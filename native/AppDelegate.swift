// AI Flow — app Mac (compagnon de l'extension Safari).
// Remplace « macOS (App)/AppDelegate.swift » généré par Xcode (copié automatiquement par prepare-safari.sh).
//
// Rôle : maintenir le Mac éveillé (Awake) jusqu'à une relance programmée, afficher
// l'état dans la barre des menus et poster les notifications macOS demandées par l'extension.
// Awake empêche la mise en veille AUTOMATIQUE (inactivité) ; il ne réveille pas un Mac
// déjà endormi et ne s'oppose pas à la fermeture du capot sur batterie.

import Cocoa
import IOKit.pwr_mgt
import IOKit.ps
import SafariServices
import ServiceManagement
import UserNotifications

@main
class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private let awake = KeepAwakeController()
    private var statusItem: NSStatusItem?
    private let launchedAt = Date()

    func applicationDidFinishLaunching(_ notification: Notification) {
        awake.onChange = { [weak self] in self?.refreshStatusItem() }
        setUpStatusItem()
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    // L'app reste dans la barre des menus quand sa fenêtre est fermée.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { showMainWindow() }
        return true
    }

    func applicationWillTerminate(_ notification: Notification) { awake.releaseForQuit() }

    // Liens envoyés par l'extension : aiflow://awake?until=<ms> et aiflow://notify?title=…&body=…
    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls where url.scheme == "aiflow" {
            let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
            let value = { (name: String) in items.first(where: { $0.name == name })?.value }
            switch url.host {
            case "awake":
                awake.set(untilMs: Double(value("until") ?? "") ?? 0)
            case "notify":
                postNotification(title: value("title") ?? "AI Flow", body: value("body") ?? "")
            default:
                break
            }
        }
        // Lancée uniquement pour une demande de l'extension : pas de fenêtre ni d'icône dans le Dock.
        if Date().timeIntervalSince(launchedAt) < 4 {
            NSApp.setActivationPolicy(.accessory)
            for window in NSApp.windows where window.isVisible { window.orderOut(nil) }
        }
    }

    private func showMainWindow() {
        NSApp.setActivationPolicy(.regular)
        NSApp.windows.first?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func postNotification(title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = String(title.prefix(120))
        content.body = String(body.prefix(300))
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
    }

    // MARK: Barre des menus

    private func setUpStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        let menu = NSMenu()
        menu.delegate = self
        item.menu = menu
        statusItem = item
        refreshStatusItem()
    }

    private func refreshStatusItem() {
        guard let button = statusItem?.button else { return }
        let symbol = awake.holding ? "cup.and.saucer.fill" : "moon.zzz"
        button.image = NSImage(systemSymbolName: symbol, accessibilityDescription: "AI Flow")
        button.toolTip = awake.statusText
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        let state = NSMenuItem(title: awake.statusText, action: nil, keyEquivalent: "")
        state.isEnabled = false
        menu.addItem(state)
        if awake.wanted {
            menu.addItem(NSMenuItem(title: "Arrêter le maintien éveillé", action: #selector(stopAwake), keyEquivalent: ""))
        }
        menu.addItem(.separator())
        if #available(macOS 13.0, *) {
            let login = NSMenuItem(title: "Ouvrir AI Flow à la connexion", action: #selector(toggleLoginItem), keyEquivalent: "")
            login.state = SMAppService.mainApp.status == .enabled ? .on : .off
            menu.addItem(login)
        }
        menu.addItem(NSMenuItem(title: "Réglages de l'extension Safari…", action: #selector(openExtensionSettings), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Afficher la fenêtre AI Flow", action: #selector(showWindowAction), keyEquivalent: ""))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quitter AI Flow", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        for item in menu.items where item.action != nil && item.action != #selector(NSApplication.terminate(_:)) { item.target = self }
    }

    @objc private func stopAwake() { awake.set(untilMs: 0) }
    @objc private func showWindowAction() { showMainWindow() }

    @objc private func openExtensionSettings() {
        let id = (Bundle.main.bundleIdentifier ?? "") + ".Extension"
        SFSafariApplication.showPreferencesForExtension(withIdentifier: id) { _ in }
    }

    @objc private func toggleLoginItem() {
        guard #available(macOS 13.0, *) else { return }
        do {
            if SMAppService.mainApp.status == .enabled { try SMAppService.mainApp.unregister() }
            else { try SMAppService.mainApp.register() }
        } catch {
            NSLog("AI Flow: élément d'ouverture impossible: \(error.localizedDescription)")
        }
    }
}
// KeepAwakeController : voir KeepAwakeController.swift (ajouté par prepare-safari.sh).
