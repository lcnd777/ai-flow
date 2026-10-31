// AI Flow — côté Mac : garder le Mac éveillé jusqu'à une relance programmée,
// et afficher une notification après l'envoi.
//
// Pourquoi deux morceaux ?
// L'extension Safari parle à `SafariWebExtensionHandler` (l'« appex »), mais ce
// processus est lancé puis tué par Safari à chaque message : il ne peut pas
// tenir une assertion « ne pas dormir » pendant des heures. Il transmet donc la
// demande à l'app AI Flow (barre des menus / élément d'ouverture), qui elle
// reste lancée et tient l'assertion.
//
// À FAIRE dans Xcode :
//  1. Activer « App Groups » sur l'app ET sur l'extension, avec le même groupe
//     (remplace `group.ai.flow` ci-dessous par le tien, ex. `TEAMID.ai.flow`).
//  2. Coller la partie 1 dans `SafariWebExtensionHandler.swift`,
//     la partie 2 dans l'app (et appeler `KeepAwakeController.shared.start()`
//     au lancement, ex. dans `applicationDidFinishLaunching`).
//  3. Pour que ça marche Mac « fermé à clé » : laisser l'app AI Flow lancée
//     (idéalement en élément d'ouverture via SMAppService.mainApp.register()).

import Foundation

enum AIFlowShared {
    static let appGroup = "group.ai.flow"                 // ← à adapter
    static let keepAwakeUntilKey = "keepAwakeUntil"        // ms depuis 1970
    static let heartbeatKey = "appHeartbeat"               // ms depuis 1970
    static let notifyTitleKey = "notifyTitle"
    static let notifyBodyKey = "notifyBody"
    static let changed = Notification.Name("ai.flow.native.changed")
    static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }
    static var nowMs: Double { Date().timeIntervalSince1970 * 1000 }
}

// MARK: - Partie 1 : SafariWebExtensionHandler (appex)

import SafariServices

/// À appeler depuis `beginRequest(with:)` quand `message["type"]` vaut
/// "AI_FLOW_KEEP_AWAKE" ou "AI_FLOW_NOTIFY". Retourne la réponse à renvoyer.
func handleAIFlowNativeMessage(_ message: [String: Any]) -> [String: Any] {
    guard let d = AIFlowShared.defaults else { return ["ok": false, "error": "app-group"] }
    switch message["type"] as? String {
    case "AI_FLOW_KEEP_AWAKE":
        let until = (message["until"] as? Double) ?? 0
        d.set(until, forKey: AIFlowShared.keepAwakeUntilKey)
    case "AI_FLOW_NOTIFY":
        d.set(String((message["title"] as? String ?? "AI Flow").prefix(80)), forKey: AIFlowShared.notifyTitleKey)
        d.set(String((message["body"] as? String ?? "").prefix(200)), forKey: AIFlowShared.notifyBodyKey)
    default:
        return ["ok": false, "error": "type"]
    }
    // Un appex sandboxé peut poster une notification distribuée sans userInfo :
    // les données passent par l'App Group.
    DistributedNotificationCenter.default().postNotificationName(AIFlowShared.changed, object: nil, userInfo: nil, deliverImmediately: true)
    // `ok` seulement si l'app AI Flow est réellement lancée (battement < 2 min) :
    // sinon le widget affiche « Mac éveillé : indisponible ».
    let beat = d.double(forKey: AIFlowShared.heartbeatKey)
    return ["ok": AIFlowShared.nowMs - beat < 120_000]
}

/* Exemple d'intégration dans SafariWebExtensionHandler.beginRequest(with:) :

    let item = context.inputItems.first as? NSExtensionItem
    let message = item?.userInfo?[SFExtensionMessageKey] as? [String: Any] ?? [:]
    let reply = handleAIFlowNativeMessage(message)   // (ou ton routage existant pour AI_FLOW_SNAPSHOT)
    let response = NSExtensionItem()
    response.userInfo = [SFExtensionMessageKey: reply]
    context.completeRequest(returningItems: [response], completionHandler: nil)
*/

// MARK: - Partie 2 : app AI Flow (reste lancée)

import IOKit.pwr_mgt
import UserNotifications

final class KeepAwakeController {
    static let shared = KeepAwakeController()
    private var assertionID: IOPMAssertionID = 0
    private var holding = false
    private var timer: Timer?

    func start() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
        DistributedNotificationCenter.default().addObserver(forName: AIFlowShared.changed, object: nil, queue: .main) { [weak self] _ in
            self?.sync(); self?.deliverPendingNotification()
        }
        // Battement + contrôle de l'échéance toutes les 30 s.
        timer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in self?.sync() }
        sync()
    }

    private func sync() {
        guard let d = AIFlowShared.defaults else { return }
        d.set(AIFlowShared.nowMs, forKey: AIFlowShared.heartbeatKey)
        let until = d.double(forKey: AIFlowShared.keepAwakeUntilKey)
        until > AIFlowShared.nowMs ? hold() : release()
    }

    /// Empêche la mise en veille *automatique* (l'écran peut s'éteindre, la
    /// session peut être verrouillée). Ne fonctionne pas capot fermé sur batterie.
    private func hold() {
        guard !holding else { return }
        let reason = "AI Flow : relance de conversation programmée" as CFString
        holding = IOPMAssertionCreateWithName(kIOPMAssertionTypePreventUserIdleSystemSleep as CFString,
                                              IOPMAssertionLevel(kIOPMAssertionLevelOn), reason, &assertionID) == kIOReturnSuccess
    }

    private func release() {
        guard holding else { return }
        IOPMAssertionRelease(assertionID); holding = false
    }

    private func deliverPendingNotification() {
        guard let d = AIFlowShared.defaults, let title = d.string(forKey: AIFlowShared.notifyTitleKey) else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = d.string(forKey: AIFlowShared.notifyBodyKey) ?? ""
        d.removeObject(forKey: AIFlowShared.notifyTitleKey); d.removeObject(forKey: AIFlowShared.notifyBodyKey)
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
    }
}
