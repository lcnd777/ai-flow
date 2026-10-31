// AI Flow — composant natif de l'extension Safari (« appex »).
// Remplace le fichier généré par Xcode (copié automatiquement par prepare-safari.sh).
//
// Safari lance ce processus à chaque message puis le termine : il ne peut pas tenir
// le Mac éveillé lui-même. Il transmet donc la demande à l'app AI Flow par un lien
// aiflow://… (l'app est lancée en arrière-plan si besoin) et répond avec l'état de l'app.
// Aucun App Group ni réglage d'équipe n'est nécessaire.

import SafariServices
import os.log
#if os(macOS)
import AppKit
#endif

final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem
        let message: Any?
        if #available(iOS 17.0, macOS 14.0, *) {
            message = request?.userInfo?[SFExtensionMessageKey]
        } else {
            message = request?.userInfo?["message"]
        }
        let reply = AIFlowNative.handle(message as? [String: Any] ?? [:])
        let response = NSExtensionItem()
        if #available(iOS 17.0, macOS 14.0, *) {
            response.userInfo = [SFExtensionMessageKey: reply]
        } else {
            response.userInfo = ["message": reply]
        }
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}

enum AIFlowNative {
    static func handle(_ message: [String: Any]) -> [String: Any] {
        #if os(macOS)
        switch message["type"] as? String ?? "" {
        case "AI_FLOW_KEEP_AWAKE":
            let until = (message["until"] as? NSNumber)?.doubleValue ?? 0
            let running = appRunning
            // Une demande d'arrêt n'a jamais besoin de lancer l'app.
            if until <= 0 && !running { return status(["ok": true]) }
            let opened = open(host: "awake", items: [URLQueryItem(name: "until", value: String(Int64(max(0, until))))])
            return status(["ok": opened])
        case "AI_FLOW_NOTIFY":
            let title = String((message["title"] as? String ?? "AI Flow").prefix(120))
            let body = String((message["body"] as? String ?? "").prefix(300))
            let opened = open(host: "notify", items: [URLQueryItem(name: "title", value: title), URLQueryItem(name: "body", value: body)])
            return status(["ok": opened])
        case "AI_FLOW_AWAKE_STATUS":
            return status(["ok": true])
        default:
            return ["ok": false, "error": "type"]
        }
        #else
        return ["ok": false, "error": "unsupported-platform"]
        #endif
    }

    #if os(macOS)
    /// L'extension a pour identifiant « <app>.Extension » (convention du convertisseur Safari).
    static var hostBundleID: String? {
        guard let id = Bundle.main.bundleIdentifier, let dot = id.range(of: ".", options: .backwards) else { return nil }
        return String(id[..<dot.lowerBound])
    }
    static var appURL: URL? {
        guard let id = hostBundleID else { return nil }
        return NSWorkspace.shared.urlForApplication(withBundleIdentifier: id)
    }
    static var appRunning: Bool {
        guard let id = hostBundleID else { return false }
        return !NSRunningApplication.runningApplications(withBundleIdentifier: id).isEmpty
    }
    static func status(_ extra: [String: Any]) -> [String: Any] {
        var out = extra
        out["appInstalled"] = appURL != nil
        out["appRunning"] = appRunning
        return out
    }
    /// Ouvre aiflow://<host>?… avec l'app AI Flow, sans la passer au premier plan.
    static func open(host: String, items: [URLQueryItem]) -> Bool {
        var c = URLComponents()
        c.scheme = "aiflow"
        c.host = host
        c.queryItems = items
        guard let url = c.url, let app = appURL else { return false }
        let config = NSWorkspace.OpenConfiguration()
        config.activates = false
        config.addsToRecentItems = false
        let done = DispatchSemaphore(value: 0)
        var success = false
        NSWorkspace.shared.open([url], withApplicationAt: app, configuration: config) { _, error in
            success = (error == nil)
            if let error = error { os_log("AI Flow: ouverture de l'app impossible: %{public}@", error.localizedDescription) }
            done.signal()
        }
        // Le processus peut être terminé juste après la réponse : on attend le lancement.
        _ = done.wait(timeout: .now() + 4)
        return success
    }
    #endif
}
