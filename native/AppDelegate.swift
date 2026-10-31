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

/// Tient une assertion « PreventUserIdleSystemSleep » jusqu'à une échéance, puis la libère seule.
final class KeepAwakeController {
    static let maxDuration: TimeInterval = 12 * 3600 + 15 * 60
    private static let storeKey = "keepAwakeUntil"
    private(set) var untilMs: Double = 0
    private(set) var holding = false
    private(set) var pausedForBattery = false
    private var assertionID: IOPMAssertionID = 0
    private var timer: Timer?
    var onChange: (() -> Void)?

    init() {
        // Reprise après un redémarrage de l'app : l'échéance enregistrée reste valable.
        untilMs = UserDefaults.standard.double(forKey: Self.storeKey)
        evaluate()
    }

    var wanted: Bool { untilMs > Date().timeIntervalSince1970 * 1000 }

    var statusText: String {
        guard wanted else { return "Maintien éveillé : inactif" }
        let f = DateFormatter()
        f.timeStyle = .short
        f.dateStyle = Calendar.current.isDateInToday(Date(timeIntervalSince1970: untilMs / 1000)) ? .none : .short
        let until = f.string(from: Date(timeIntervalSince1970: untilMs / 1000))
        return pausedForBattery ? "En pause (batterie < 20 %) · jusqu'à \(until)" : "Mac maintenu éveillé jusqu'à \(until)"
    }

    func set(untilMs value: Double) {
        let cap = (Date().timeIntervalSince1970 + Self.maxDuration) * 1000
        untilMs = value > 0 ? min(value, cap) : 0
        UserDefaults.standard.set(untilMs, forKey: Self.storeKey)
        evaluate()
    }

    func releaseForQuit() { release() }

    private func evaluate() {
        timer?.invalidate()
        timer = nil
        let now = Date().timeIntervalSince1970 * 1000
        if untilMs > now {
            pausedForBattery = Self.batteryLow()
            pausedForBattery ? release() : hold()
            // Revérifie l'échéance et la batterie au plus tard chaque minute.
            let next = min(60, max(1, (untilMs - now) / 1000))
            timer = Timer.scheduledTimer(withTimeInterval: next, repeats: false) { [weak self] _ in self?.evaluate() }
        } else {
            pausedForBattery = false
            if untilMs != 0 {
                untilMs = 0
                UserDefaults.standard.set(0, forKey: Self.storeKey)
            }
            release()
        }
        onChange?()
    }

    private func hold() {
        guard !holding else { return }
        let reason = "AI Flow : relance de conversation programmée" as CFString
        let result = IOPMAssertionCreateWithName(kIOPMAssertionTypePreventUserIdleSystemSleep as CFString,
                                                 IOPMAssertionLevel(kIOPMAssertionLevelOn), reason, &assertionID)
        holding = (result == kIOReturnSuccess)
    }

    private func release() {
        guard holding else { return }
        IOPMAssertionRelease(assertionID)
        holding = false
    }

    /// Vrai si le Mac est sur batterie avec moins de 20 % de charge.
    static func batteryLow() -> Bool {
        guard let info = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(),
              let sources = IOPSCopyPowerSourcesList(info)?.takeRetainedValue() as? [CFTypeRef] else { return false }
        for source in sources {
            guard let d = IOPSGetPowerSourceDescription(info, source)?.takeUnretainedValue() as? [String: Any] else { continue }
            let onAC = (d[kIOPSPowerSourceStateKey] as? String) == kIOPSACPowerValue
            if !onAC, let current = d[kIOPSCurrentCapacityKey] as? Int, let max = d[kIOPSMaxCapacityKey] as? Int, max > 0, current * 100 / max < 20 {
                return true
            }
        }
        return false
    }
}
