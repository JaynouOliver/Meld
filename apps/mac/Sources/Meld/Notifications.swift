import AppKit
import UserNotifications

/// macOS notification permission. macOS asks only once: after "Don't Allow" (or a dismissed
/// prompt) only System Settings can turn notifications on, so the app checks the real status
/// and sends people there instead of asking again silently.
enum Notifications {
    enum Status: Equatable { case notAsked, on, off }

    static func status() async -> Status {
        switch await UNUserNotificationCenter.current().notificationSettings().authorizationStatus {
        case .notDetermined: .notAsked
        case .authorized, .provisional, .ephemeral: .on
        default: .off
        }
    }

    /// Shows the system prompt if it hasn't been answered; returns the resulting status.
    static func request() async -> Status {
        if await status() == .notAsked {
            _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
        }
        return await status()
    }

    /// System Settings → Notifications, on Meld's page.
    static func openSettings() {
        let id = Bundle.main.bundleIdentifier ?? "app.meld.mac"
        let urls = [
            "x-apple.systempreferences:com.apple.Notifications-Settings.extension?id=\(id)",
            "x-apple.systempreferences:com.apple.Notifications-Settings.extension",
        ]
        for s in urls { if let u = URL(string: s), NSWorkspace.shared.open(u) { return } }
    }
}
