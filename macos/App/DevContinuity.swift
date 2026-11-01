// AI Flow Dev — Dev Continuity : passation Claude Code ↔ Codex depuis un dossier de projet choisi par l'utilisateur.
//
// Sécurité :
//  - le dossier est choisi explicitement (NSOpenPanel) ; aucune commande ne vient de l'extension ni d'une page web ;
//  - uniquement des commandes Git en LECTURE (liste fixée par tools/handoff/core.js, vérifiée ici) ;
//  - aucun commit, push, stash, reset ni suppression ; rien n'est écrit dans le projet sauf demande explicite ;
//  - le cœur de calcul est exactement celui de la CLI (core.js + sync.js), exécuté par JavaScriptCore.

import AppKit
import JavaScriptCore
import SwiftUI

// MARK: - Moteur

enum HandoffEngineError: LocalizedError {
    case gitMissing, resources, script(String)
    var errorDescription: String? {
        switch self {
        case .gitMissing: return "Git n’est pas disponible sur ce Mac. Installe une fois les outils en ligne de commande d’Apple (bouton ci-dessous), puis réessaie."
        case .resources: return "Fichiers internes de Dev Continuity introuvables : réinstalle AI Flow Dev."
        case .script(let m): return "Analyse impossible : \(m)"
        }
    }
}

struct HandoffResult {
    let handoff: [String: Any]
    let json: String
    let markdown: String
    let prompt: String
    let promptInline: String
    var project: [String: Any] { handoff["project"] as? [String: Any] ?? [:] }
    var publication: [String: Any] { handoff["publication"] as? [String: Any] ?? [:] }
    var git: [String: Any] { handoff["git"] as? [String: Any] ?? [:] }
    var localChanges: [[String: Any]] { git["localChanges"] as? [[String: Any]] ?? [] }
    var unpushed: [[String: Any]] { git["unpushedCommits"] as? [[String: Any]] ?? [] }
    var published: Bool { (publication["level"] as? String) == "published" }
    var available: Bool { handoff["git"].flatMap { ($0 as? [String: Any])?["unavailable"] } == nil }
}

final class HandoffEngine {
    /// Seules sous-commandes Git autorisées (lecture seule).
    static let readOnly: Set<String> = ["rev-parse", "remote", "status", "diff", "stash", "log", "branch", "rev-list"]

    static func gitPath() -> String? {
        let fm = FileManager.default
        for p in ["/opt/homebrew/bin/git", "/usr/local/bin/git"] where fm.isExecutableFile(atPath: p) { return p }
        // /usr/bin/git n'est qu'un relais : il ne fonctionne que si les outils en ligne de commande sont installés.
        guard fm.isExecutableFile(atPath: "/usr/bin/git") else { return nil }
        if FileManager.default.fileExists(atPath: "/Library/Developer/CommandLineTools/usr/bin/git") { return "/usr/bin/git" }
        let check = Process()
        check.executableURL = URL(fileURLWithPath: "/usr/bin/xcode-select")
        check.arguments = ["-p"]
        check.standardOutput = Pipe(); check.standardError = Pipe()
        do { try check.run(); check.waitUntilExit() } catch { return nil }
        return check.terminationStatus == 0 ? "/usr/bin/git" : nil
    }

    let git: String
    let folder: URL
    init(folder: URL) throws {
        guard let g = HandoffEngine.gitPath() else { throw HandoffEngineError.gitMissing }
        git = g
        self.folder = folder
    }

    /// Exécute une commande Git en lecture ; nil en cas d'échec (« non vérifiable »).
    func run(_ args: [String]) -> String? {
        guard let sub = args.first, HandoffEngine.readOnly.contains(sub) else { return nil }
        if sub == "stash" && args.count > 1 && args[1] != "list" { return nil }
        if sub == "remote" && (args.count < 2 || args[1] != "get-url") { return nil }
        if sub == "branch" && !args.contains("--contains") { return nil }
        let p = Process()
        p.executableURL = URL(fileURLWithPath: git)
        p.arguments = ["-C", folder.path] + args
        var env = ProcessInfo.processInfo.environment
        env["GIT_TERMINAL_PROMPT"] = "0"; env["GIT_OPTIONAL_LOCKS"] = "0"; env["LC_ALL"] = "C"
        p.environment = env
        let out = Pipe()
        p.standardOutput = out
        p.standardError = Pipe()
        do { try p.run() } catch { return nil }
        let data = out.fileHandleForReading.readDataToEndOfFile()
        p.waitUntilExit()
        guard p.terminationStatus == 0 else { return nil }
        var s = String(decoding: data, as: UTF8.self)
        if s.hasSuffix("\n") { s.removeLast() }
        return s
    }

    private func context() throws -> JSContext {
        guard let ctx = JSContext(),
              let syncURL = Bundle.main.url(forResource: "sync", withExtension: "js"),
              let coreURL = Bundle.main.url(forResource: "core", withExtension: "js"),
              let sync = try? String(contentsOf: syncURL, encoding: .utf8),
              let core = try? String(contentsOf: coreURL, encoding: .utf8) else { throw HandoffEngineError.resources }
        var failure: String?
        ctx.exceptionHandler = { _, e in failure = e?.toString() }
        ctx.evaluateScript(sync)
        ctx.evaluateScript(core)
        if let f = failure { throw HandoffEngineError.script(f) }
        return ctx
    }

    private func commands(_ value: JSValue?) -> [(String, [String])] {
        guard let list = value?.toArray() as? [[Any]] else { return [] }
        return list.compactMap { pair in
            guard pair.count == 2, let k = pair[0] as? String, let a = pair[1] as? [String] else { return nil }
            return (k, a)
        }
    }

    func prepare(notes: [String: Any], from: String, to: String) throws -> HandoffResult {
        let ctx = try context()
        guard let H = ctx.objectForKeyedSubscript("AIFlowHandoff") else { throw HandoffEngineError.resources }
        var raw: [String: Any] = [:]
        for (k, a) in commands(H.objectForKeyedSubscript("GIT_PHASE1")) { raw[k] = run(a) ?? NSNull() }
        if raw["top"] is String {
            let phase2 = H.objectForKeyedSubscript("gitPhase2").call(withArguments: [raw])
            for (k, a) in commands(phase2) { raw[k] = run(a) ?? NSNull() }
        }
        // Fichiers non suivis : lus localement (≤ 200 Ko) uniquement pour la détection de secrets.
        var untracked = ""
        if let top = raw["top"] as? String, let paths = H.objectForKeyedSubscript("untrackedPaths").call(withArguments: [raw])?.toArray() as? [String] {
            for p in paths {
                let url = URL(fileURLWithPath: top).appendingPathComponent(p)
                if let size = (try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? Int, size <= 200_000,
                   let text = try? String(contentsOf: url, encoding: .utf8) { untracked += "\n" + text }
            }
        }
        let rawJSON = String(decoding: try JSONSerialization.data(withJSONObject: raw), as: UTF8.self)
        let notesJSON = String(decoding: try JSONSerialization.data(withJSONObject: notes), as: UTF8.self)
        let iso = ISO8601DateFormatter().string(from: Date())
        guard let out = H.objectForKeyedSubscript("prepare").call(withArguments: [rawJSON, untracked, notesJSON, from, to, iso])?.toString(),
              let obj = try JSONSerialization.jsonObject(with: Data(out.utf8)) as? [String: Any] else { throw HandoffEngineError.script("réponse vide") }
        guard obj["ok"] as? Bool == true, let h = obj["handoff"] as? [String: Any] else { throw HandoffEngineError.script(obj["error"] as? String ?? "erreur inconnue") }
        let json = String(decoding: try JSONSerialization.data(withJSONObject: h, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]), as: UTF8.self)
        return HandoffResult(handoff: h, json: json, markdown: obj["markdown"] as? String ?? "", prompt: obj["prompt"] as? String ?? "", promptInline: obj["promptInline"] as? String ?? "")
    }

    /// Copie conservée hors du projet (aucune modification du dépôt) : ~/Library/Application Support/AI Flow Dev/Handoffs.
    static func archive(_ r: HandoffResult, name: String) -> URL? {
        guard let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        let dir = base.appendingPathComponent("AI Flow Dev/Handoffs", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd-HHmmss"
        let safe = name.replacingOccurrences(of: "[^A-Za-z0-9_-]", with: "-", options: .regularExpression)
        let stem = "\(safe)-\(f.string(from: Date()))"
        let md = dir.appendingPathComponent(stem + ".md")
        do {
            try r.json.write(to: dir.appendingPathComponent(stem + ".json"), atomically: true, encoding: .utf8)
            try r.markdown.write(to: md, atomically: true, encoding: .utf8)
            return md
        } catch { return nil }
    }

    /// Écriture dans le projet (docs/handoff/) : seulement sur demande explicite. Aucun commit.
    func writeIntoProject(_ r: HandoffResult) throws {
        let dir = folder.appendingPathComponent("docs/handoff", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try (r.json + "\n").write(to: dir.appendingPathComponent("latest.json"), atomically: true, encoding: .utf8)
        try r.markdown.write(to: dir.appendingPathComponent("LATEST.md"), atomically: true, encoding: .utf8)
    }

    /// Auto-test (CI) : analyse un dépôt et imprime la passation JSON, sans rien écrire.
    static func selfTest(path: String) -> Int32 {
        do {
            let r = try HandoffEngine(folder: URL(fileURLWithPath: path)).prepare(notes: ["mission": "Auto-test Dev Continuity"], from: "claude-code", to: "codex")
            let compact = String(decoding: try JSONSerialization.data(withJSONObject: r.handoff, options: [.withoutEscapingSlashes]), as: UTF8.self)
            print(compact)
            return r.available ? 0 : 1
        } catch {
            FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8))
            return 1
        }
    }
}

// MARK: - Interface

final class DevContinuityModel: ObservableObject {
    @Published var folder: URL? = UserDefaults.standard.string(forKey: "devContinuityFolder").map { URL(fileURLWithPath: $0) }
    @Published var to = UserDefaults.standard.string(forKey: "devContinuityTo") ?? "codex" { didSet { UserDefaults.standard.set(to, forKey: "devContinuityTo") } }
    @Published var mission = ""
    @Published var next = ""
    @Published var writeInProject = false
    @Published var result: HandoffResult?
    @Published var preview: HandoffResult?
    @Published var busy = false
    @Published var error: String?
    @Published var gitMissing = false
    @Published var status = ""

    var from: String { to == "codex" ? "claude-code" : "codex" }
    static let names = ["codex": "Codex", "claude-code": "Claude Code"]
    static let urls = ["codex": "https://chatgpt.com/codex", "claude-code": "https://claude.ai/code"]

    func choose() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "Choisir ce projet"
        panel.message = "Choisis le dossier d’un projet Git (par exemple ton clone de ai-flow). AI Flow le lit sans rien modifier."
        guard panel.runModal() == .OK, let url = panel.url else { return }
        folder = url
        UserDefaults.standard.set(url.path, forKey: "devContinuityFolder")
        result = nil
        analyze()
    }

    private func work(_ notes: [String: Any], keep: Bool) {
        guard let folder = folder else { return }
        busy = true; error = nil; status = ""
        let to = self.to, from = self.from, write = writeInProject && keep
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let engine = try HandoffEngine(folder: folder)
                let r = try engine.prepare(notes: notes, from: from, to: to)
                var msg = ""
                if keep {
                    if let saved = HandoffEngine.archive(r, name: folder.lastPathComponent) { msg = "Passation conservée : \(saved.lastPathComponent)." }
                    if write { try engine.writeIntoProject(r); msg += " Écrite aussi dans docs/handoff/ du projet (non commitée)." }
                }
                DispatchQueue.main.async {
                    self.busy = false; self.gitMissing = false
                    if keep { self.result = r; self.status = msg } else { self.preview = r }
                    if !r.available { self.error = "Ce dossier n’est pas un dépôt Git (ou Git ne peut pas le lire)." }
                }
            } catch {
                DispatchQueue.main.async {
                    self.busy = false
                    var missing = false
                    if let e = error as? HandoffEngineError, case .gitMissing = e { missing = true }
                    self.gitMissing = missing
                    self.error = error.localizedDescription
                }
            }
        }
    }
    func analyze() { work([:], keep: false) }
    func prepare() {
        var notes: [String: Any] = [:]
        if !mission.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { notes["mission"] = mission }
        let steps = next.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        if !steps.isEmpty { notes["next"] = steps }
        work(notes, keep: true)
    }
    func copyInstructions() {
        guard let r = result else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(writeInProject ? r.prompt : r.promptInline, forType: .string)
        status = "Instructions copiées : colle-les dans \(Self.names[to] ?? to)."
    }
    func openAgent() { if let u = Self.urls[to].flatMap(URL.init(string:)) { NSWorkspace.shared.open(u) } }
    func installGit() {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/xcode-select")
        p.arguments = ["--install"]
        try? p.run()
        status = "macOS ouvre l’installation des outils en ligne de commande. Une fois terminée, clique « Analyser »."
    }
}

struct DevContinuityView: View {
    @ObservedObject var model: DevContinuityModel

    private func row(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label).foregroundColor(.secondary).frame(width: 110, alignment: .leading)
            Text(value).textSelection(.enabled)
            Spacer()
        }
    }
    private func repoName(_ r: HandoffResult) -> String {
        ((r.project["repository"] as? String) ?? "Dépôt local sans adresse GitHub").replacingOccurrences(of: "https://github.com/", with: "")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Dev Continuity").font(.title2).bold()
            Text("Reprends un développement sur un autre agent sans tout réexpliquer. AI Flow lit l’état Git du projet (sans rien modifier) et prépare les instructions de reprise.")
                .foregroundColor(.secondary).fixedSize(horizontal: false, vertical: true)

            HStack {
                Button(model.folder == nil ? "Choisir un projet…" : "Changer de projet…") { model.choose() }
                if let f = model.folder { Text(f.lastPathComponent).bold() }
                Spacer()
                if model.folder != nil { Button("Analyser") { model.analyze() }.disabled(model.busy) }
            }

            if let r = model.result ?? model.preview, r.available {
                GroupBox {
                    VStack(alignment: .leading, spacing: 6) {
                        row("Dépôt", repoName(r))
                        row("Branche", (r.project["branch"] as? String) ?? "?")
                        row("Dernier commit", "\(((r.project["commit"] as? String) ?? "").prefix(7)) — \((r.project["commitSubject"] as? String) ?? "")")
                        row("État", (r.publication["label"] as? String) ?? "")
                        if !r.published {
                            Text("⚠︎ \(r.localChanges.count) fichier(s) modifié(s), \(r.unpushed.count) commit(s) non poussé(s). Un agent dans le cloud ne verra pas ces changements tant qu’ils ne sont pas publiés sur GitHub.")
                                .foregroundColor(.orange).fixedSize(horizontal: false, vertical: true)
                        }
                    }.padding(4)
                }
            }

            if model.folder != nil {
                Picker("Continuer avec", selection: $model.to) {
                    Text("Codex").tag("codex")
                    Text("Claude Code").tag("claude-code")
                }.pickerStyle(.segmented).frame(maxWidth: 320)
                TextField("Mission en cours (facultatif)", text: $model.mission)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Prochaines actions (une par ligne, facultatif)").font(.caption).foregroundColor(.secondary)
                    TextEditor(text: $model.next).frame(height: 54).border(Color.secondary.opacity(0.3))
                }
                Toggle("Enregistrer aussi la passation dans le projet (docs/handoff/, sans commit)", isOn: $model.writeInProject)
                Button("Préparer la reprise avec \(DevContinuityModel.names[model.to] ?? "")") { model.prepare() }
                    .keyboardShortcut(.defaultAction).disabled(model.busy)
            }

            if model.busy { ProgressView().controlSize(.small) }
            if let e = model.error {
                Text(e).foregroundColor(.red).fixedSize(horizontal: false, vertical: true)
                if model.gitMissing { Button("Installer les outils Git d’Apple") { model.installGit() } }
            }

            if let r = model.result {
                Divider()
                HStack {
                    Button("Copier les instructions") { model.copyInstructions() }
                    Button("Ouvrir \(DevContinuityModel.names[model.to] ?? "")") { model.openAgent() }
                }
                ScrollView {
                    Text(r.markdown).font(.system(.caption, design: .monospaced)).textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }.frame(minHeight: 160)
            }
            if !model.status.isEmpty { Text(model.status).font(.caption).foregroundColor(.secondary) }
            Spacer(minLength: 0)
        }
        .padding(20)
        .frame(width: 560)
        .frame(minHeight: 420)
        .onAppear { if model.folder != nil && model.preview == nil { model.analyze() } }
    }
}
