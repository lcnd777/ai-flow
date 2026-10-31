// AI Flow Dev — app de développement persistante (contient l'extension Safari « AI Flow Dev »).
// Installée une seule fois ; les nouvelles versions arrivent par Sparkle (bouton « Mettre à jour »).
// Identifiants stables et distincts de la future app publique : ai.flow.dev / ai.flow.dev.Extension.

import Cocoa
import SafariServices
import ServiceManagement
import Sparkle
import UserNotifications

@main
enum AIFlowDevMain {
    static let delegate = AppDelegate()
    static func main() {
        let app = NSApplication.shared
        app.delegate = delegate
        app.run()
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private let awake = KeepAwakeController()
    // Sparkle : vérifie au lancement puis toutes les heures (SUScheduledCheckInterval), propose « Installer et relancer ».
    let updater = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: nil, userDriverDelegate: nil)
    private var statusItem: NSStatusItem?
    private var window: NSWindow?
    private let launchedAt = Date()

    private var info: [String: Any] { Bundle.main.infoDictionary ?? [:] }
    private var versionText: String {
        "\(info["CFBundleShortVersionString"] as? String ?? "?") (build \(info["CFBundleVersion"] as? String ?? "?"))"
    }
    private var extensionID: String { (Bundle.main.bundleIdentifier ?? "ai.flow.dev") + ".Extension" }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        awake.onChange = { [weak self] in self?.refreshStatusItem() }
        setUpStatusItem()
        // Le titre se met à jour chaque minute : une valeur devenue périmée disparaît d'elle-même.
        Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in self?.refreshStatusItem() }
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
        // Premier lancement (ou ouverture manuelle) : fenêtre d'accueil pour activer l'extension.
        if !UserDefaults.standard.bool(forKey: "welcomeShown") {
            UserDefaults.standard.set(true, forKey: "welcomeShown")
            showWindow()
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { showWindow(); return true }
    func applicationWillTerminate(_ notification: Notification) { awake.releaseForQuit() }

    // aiflow-dev://awake?until=…, aiflow-dev://notify?title=…&body=…, aiflow-dev://update
    func application(_ application: NSApplication, open urls: [URL]) {
        let scheme = info["AIFlowURLScheme"] as? String ?? "aiflow-dev"
        for url in urls where url.scheme == scheme {
            let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
            let value = { (name: String) in items.first(where: { $0.name == name })?.value }
            switch url.host {
            case "awake": awake.set(untilMs: Double(value("until") ?? "") ?? 0)
            case "notify": postNotification(title: value("title") ?? "AI Flow Dev", body: value("body") ?? "")
            case "update": updater.checkForUpdates(nil)
            case "snapshot":
                if let d = value("d"), let data = Data(base64URL: d), data.count < 12_000, QuotaSnapshot(data: data) != nil {
                    UserDefaults.standard.set(data, forKey: QuotaSnapshot.storeKey)
                    refreshStatusItem()
                }
            default: break
            }
        }
    }

    private func postNotification(title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = String(title.prefix(120))
        content.body = String(body.prefix(300))
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
    }

    // MARK: Fenêtre d'accueil

    private func showWindow() {
        if window == nil {
            let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 460, height: 250), styleMask: [.titled, .closable], backing: .buffered, defer: false)
            w.title = "AI Flow Dev"
            w.isReleasedWhenClosed = false
            let title = NSTextField(labelWithString: "AI Flow Dev \(versionText)")
            title.font = .boldSystemFont(ofSize: 17)
            let text = NSTextField(wrappingLabelWithString: "Version de développement d’AI Flow. Active l’extension « AI Flow Dev » dans Safari (Réglages › Extensions), puis autorise claude.ai et chatgpt.com. Les nouvelles versions s’installent ici d’un clic sur « Mettre à jour » : plus de ZIP à manipuler.")
            let open = NSButton(title: "Ouvrir les réglages de l’extension", target: self, action: #selector(openExtensionSettings))
            open.bezelStyle = .rounded
            open.keyEquivalent = "\r"
            let check = NSButton(title: "Rechercher des mises à jour", target: self, action: #selector(checkForUpdates))
            check.bezelStyle = .rounded
            let buttons = NSStackView(views: [check, open])
            let stack = NSStackView(views: [title, text, buttons])
            stack.orientation = .vertical
            stack.alignment = .leading
            stack.spacing = 14
            stack.edgeInsets = NSEdgeInsets(top: 22, left: 22, bottom: 22, right: 22)
            stack.translatesAutoresizingMaskIntoConstraints = false
            let content = NSView()
            content.addSubview(stack)
            NSLayoutConstraint.activate([
                stack.leadingAnchor.constraint(equalTo: content.leadingAnchor),
                stack.trailingAnchor.constraint(equalTo: content.trailingAnchor),
                stack.topAnchor.constraint(equalTo: content.topAnchor),
                text.widthAnchor.constraint(equalToConstant: 416)
            ])
            w.contentView = content
            w.center()
            window = w
        }
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
    }

    // MARK: Barre des menus

    private func setUpStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        let menu = NSMenu()
        menu.delegate = self
        item.menu = menu
        statusItem = item
        refreshStatusItem()
    }

    private func refreshStatusItem() {
        guard let button = statusItem?.button else { return }
        let symbol = awake.holding ? "cup.and.saucer.fill" : "bolt.horizontal.circle"
        button.image = NSImage(systemSymbolName: symbol, accessibilityDescription: "AI Flow Dev")
        button.imagePosition = .imageLeading
        // Le quota le plus contraint, uniquement s'il est récent (sinon rien : jamais de valeur périmée présentée comme actuelle).
        button.title = QuotaSnapshot.load()?.headline() ?? ""
        button.toolTip = "AI Flow Dev \(versionText) — \(awake.statusText)"
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        let version = NSMenuItem(title: "AI Flow Dev \(versionText)", action: nil, keyEquivalent: "")
        version.isEnabled = false
        menu.addItem(version)
        menu.addItem(NSMenuItem(title: "Rechercher des mises à jour…", action: #selector(checkForUpdates), keyEquivalent: "u"))
        menu.addItem(.separator())
        // Quotas Claude / Codex (mêmes données que la fenêtre de l'extension).
        if let snap = QuotaSnapshot.load() {
            for line in snap.menuLines() {
                let item = NSMenuItem(title: line.text, action: nil, keyEquivalent: "")
                item.isEnabled = false
                if line.header { item.attributedTitle = NSAttributedString(string: line.text, attributes: [.font: NSFont.boldSystemFont(ofSize: 13)]) }
                menu.addItem(item)
            }
        } else {
            let item = NSMenuItem(title: "Quotas : ouvre Claude ou ChatGPT dans Safari", action: nil, keyEquivalent: "")
            item.isEnabled = false
            menu.addItem(item)
        }
        menu.addItem(.separator())
        let state = NSMenuItem(title: awake.statusText, action: nil, keyEquivalent: "")
        state.isEnabled = false
        menu.addItem(state)
        if awake.wanted { menu.addItem(NSMenuItem(title: "Arrêter le maintien éveillé", action: #selector(stopAwake), keyEquivalent: "")) }
        menu.addItem(.separator())
        if #available(macOS 13.0, *) {
            let login = NSMenuItem(title: "Ouvrir AI Flow Dev à la connexion", action: #selector(toggleLoginItem), keyEquivalent: "")
            login.state = SMAppService.mainApp.status == .enabled ? .on : .off
            menu.addItem(login)
        }
        menu.addItem(NSMenuItem(title: "Réglages de l’extension Safari…", action: #selector(openExtensionSettings), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Afficher la fenêtre", action: #selector(showWindowAction), keyEquivalent: ""))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quitter AI Flow Dev", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        for item in menu.items where item.action != nil && item.action != #selector(NSApplication.terminate(_:)) { item.target = self }
    }

    @objc func checkForUpdates() { updater.checkForUpdates(nil) }
    @objc private func stopAwake() { awake.set(untilMs: 0) }
    @objc private func showWindowAction() { showWindow() }
    @objc private func openExtensionSettings() {
        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionID) { _ in }
    }
    @objc private func toggleLoginItem() {
        guard #available(macOS 13.0, *) else { return }
        do {
            if SMAppService.mainApp.status == .enabled { try SMAppService.mainApp.unregister() }
            else { try SMAppService.mainApp.register() }
        } catch { NSLog("AI Flow Dev: élément d'ouverture impossible: \(error.localizedDescription)") }
    }
}

// MARK: Quotas reçus de l'extension (barre de menus)

extension Data {
    init?(base64URL s: String) {
        var t = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while t.count % 4 != 0 { t += "=" }
        self.init(base64Encoded: t)
    }
}

/// Résumé envoyé par l'extension : uniquement des pourcentages lus, leurs dates et l'état. Traité comme des données.
struct QuotaSnapshot {
    static let storeKey = "quotaSnapshot"
    static let staleAfter: TimeInterval = 15 * 60
    struct Metric { let label: String; let percent: Int; let resetAt: Date?; let observedAt: Date }
    struct Platform { let name: String; let radar: String; let risk: String; let updatedAt: Date?; let metrics: [Metric] }
    let platforms: [Platform]

    init?(data: Data) {
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let list = obj["platforms"] as? [[String: Any]] else { return nil }
        let date = { (v: Any?) -> Date? in (v as? NSNumber).map { Date(timeIntervalSince1970: $0.doubleValue / 1000) } }
        platforms = list.prefix(8).compactMap { p in
            guard let name = p["name"] as? String else { return nil }
            let metrics = ((p["metrics"] as? [[String: Any]]) ?? []).prefix(8).compactMap { m -> Metric? in
                guard let label = m["label"] as? String, let pct = m["percent"] as? NSNumber, let seen = date(m["observedAt"]) else { return nil }
                return Metric(label: String(label.prefix(40)), percent: max(0, min(100, pct.intValue)), resetAt: date(m["resetAt"]), observedAt: seen)
            }
            return Platform(name: String(name.prefix(30)), radar: p["radar"] as? String ?? "", risk: String((p["risk"] as? String ?? "").prefix(160)),
                            updatedAt: date(p["updatedAt"]), metrics: Array(metrics))
        }
    }
    static func load() -> QuotaSnapshot? {
        guard let data = UserDefaults.standard.data(forKey: storeKey) else { return nil }
        return QuotaSnapshot(data: data)
    }
    private static func fresh(_ m: Metric, now: Date) -> Bool {
        now.timeIntervalSince(m.observedAt) < staleAfter && (m.resetAt.map { $0 > now } ?? true)
    }
    private static func clock(_ d: Date) -> String {
        let f = DateFormatter()
        f.timeStyle = .short
        f.dateStyle = Calendar.current.isDateInToday(d) ? .none : .short
        return f.string(from: d)
    }
    /// « 42 % » : le quota récent le plus utilisé ; vide si aucune donnée récente.
    func headline(now: Date = Date()) -> String {
        let freshest = platforms.flatMap { $0.metrics }.filter { Self.fresh($0, now: now) }
        guard let top = freshest.max(by: { $0.percent < $1.percent }) else { return "" }
        return " \(top.percent) %"
    }
    func menuLines(now: Date = Date()) -> [(text: String, header: Bool)] {
        var lines: [(text: String, header: Bool)] = []
        for p in platforms {
            let state: String
            switch p.radar {
            case "available": state = "Disponible"
            case "near": state = "Proche de la limite"
            case "reached": state = "Limite atteinte"
            case "reset-soon": state = "Reset imminent"
            case "stale": state = "Données périmées"
            default: state = "Indisponible"
            }
            lines.append(("\(p.name) — \(state)", true))
            for m in p.metrics {
                let ok = Self.fresh(m, now: now)
                let reset = m.resetAt.map { $0 > now ? " · reset \(Self.clock($0))" : "" } ?? ""
                lines.append((ok ? "   \(m.label) : \(m.percent) %\(reset)" : "   \(m.label) : périmé (relevé de \(Self.clock(m.observedAt)))", false))
            }
            if !p.risk.isEmpty { lines.append(("   \(p.risk)", false)) }
            if let u = p.updatedAt { lines.append(("   Actualisé à \(Self.clock(u))", false)) }
        }
        return lines
    }
}
