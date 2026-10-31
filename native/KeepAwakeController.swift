// AI Flow — maintien éveillé du Mac (partagé par l'app publique et l'app de développement).
import Foundation
import IOKit.pwr_mgt
import IOKit.ps

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
