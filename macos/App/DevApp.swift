// AI Flow Dev — app de développement persistante (contient l'extension Safari « AI Flow Dev »).
// Installée une seule fois ; les nouvelles versions arrivent par Sparkle (bouton « Mettre à jour »).
// Identifiants stables et distincts de la future app publique : ai.flow.dev / ai.flow.dev.Extension.

import Cocoa
import SwiftUI
import SafariServices
import ServiceManagement
import Sparkle
import UserNotifications

@main
enum AIFlowDevMain {
    static let delegate = AppDelegate()
    static func main() {
        // Auto-test Dev Continuity (CI) : « AI Flow Dev --handoff-selftest <dossier> » — lecture seule, puis sortie.
        let args = CommandLine.arguments
        if let i = args.firstIndex(of: "--handoff-selftest") {
            exit(HandoffEngine.selfTest(path: i + 1 < args.count ? args[i + 1] : FileManager.default.currentDirectoryPath))
        }
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
        // Quotas dans la barre de menus retirés (0.12.3) : nettoyage des anciennes données.
        UserDefaults.standard.removeObject(forKey: "quotaSnapshot")
        UserDefaults.standard.removeObject(forKey: "quotaSnapshotReceivedAt")
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
            let dev = NSButton(title: "Dev Continuity…", target: self, action: #selector(showDevContinuity))
            dev.bezelStyle = .rounded
            let buttons = NSStackView(views: [check, open, dev])
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
        button.title = ""
        button.toolTip = "AI Flow Dev \(versionText) — \(awake.statusText)"
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        let version = NSMenuItem(title: "AI Flow Dev \(versionText)", action: nil, keyEquivalent: "")
        version.isEnabled = false
        menu.addItem(version)
        menu.addItem(NSMenuItem(title: "Rechercher des mises à jour…", action: #selector(checkForUpdates), keyEquivalent: "u"))
        menu.addItem(NSMenuItem(title: "Dev Continuity…", action: #selector(showDevContinuity), keyEquivalent: "d"))
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

    // MARK: Dev Continuity

    private var devWindow: NSWindow?
    private let devModel = DevContinuityModel()
    @objc func showDevContinuity() {
        if devWindow == nil {
            let w = NSWindow(contentViewController: NSHostingController(rootView: DevContinuityView(model: devModel)))
            w.title = "Dev Continuity — AI Flow Dev"
            w.styleMask = [.titled, .closable, .miniaturizable, .resizable]
            w.isReleasedWhenClosed = false
            w.center()
            devWindow = w
        }
        NSApp.activate(ignoringOtherApps: true)
        devWindow?.makeKeyAndOrderFront(nil)
    }
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
