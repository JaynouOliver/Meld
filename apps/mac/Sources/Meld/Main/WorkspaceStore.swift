import AppKit
import Observation
import UserNotifications

/// The signed-in workspace, for what the web app can't do on its own: the Dock badge and
/// macOS notifications for DMs and @mentions, driven by the same realtime pings the web
/// app uses. Everything on screen is the web app (WorkspaceWebView).
@MainActor
@Observable
final class WorkspaceStore {
    let api: MeldAPI
    private(set) var directory: Directory
    private(set) var unread = 0
    /// The chat the web view shows (from its URL), so it doesn't count as unread.
    private(set) var activeChat: ChatId?
    /// Opens a chat in the web view (set by WorkspaceWebView), for notification clicks.
    @ObservationIgnored var openChat: ((ChatId) -> Void)?

    @ObservationIgnored private let realtime = Realtime()
    @ObservationIgnored private var activeObserver: NSObjectProtocol?

    init(api: MeldAPI, directory: Directory) {
        self.api = api
        self.directory = directory
    }

    func start() {
        realtime.onChange = { [weak self] in self?.apply($0) }
        realtime.connect(workspaceId: directory.workspace.id)
        activeObserver = NotificationCenter.default.addObserver(forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.clearBadge() }
        }
    }

    func stop() {
        realtime.disconnect()
        if let activeObserver { NotificationCenter.default.removeObserver(activeObserver) }
        NSApp.dockTile.badgeLabel = nil
    }

    func pageChanged(_ url: URL) {
        let parts = url.pathComponents.filter { $0 != "/" }
        activeChat = parts.first == "chat" && parts.count > 1 ? parts[1] : nil
    }

    func open(chat: ChatId) {
        openChat?(chat)
    }

    // MARK: Realtime

    private func apply(_ ping: ChangePing) {
        if ping.directory == true {
            Task { if let d = try? await api.call("getDirectory", as: Directory?.self) { directory = d } }
        }
        guard ping.quiet != true, let live = ping.message, let m = live.message, m.who != directory.me else { return }
        // While you're looking at the window, the web app shows it; only count it otherwise.
        if NSApp.isActive && live.chatId == activeChat { return }
        let isDM: Bool = if case .dm = directory.chats[live.chatId] { true } else { false }
        let mentionsMe = directory.people[directory.me].map { m.text.lowercased().contains("@\($0.first.lowercased())") } ?? false
        guard isDM || mentionsMe else { return }
        if !NSApp.isActive {
            unread += 1
            NSApp.dockTile.badgeLabel = "\(unread)"
        }
        notify(m, in: live.chatId, isDM: isDM)
    }

    private func clearBadge() {
        unread = 0
        NSApp.dockTile.badgeLabel = nil
    }

    /// "Agents tell you when something needs you": a DM or an @mention of you.
    private func notify(_ m: Message, in chat: ChatId, isDM: Bool) {
        let content = UNMutableNotificationContent()
        content.title = directory.people[m.who]?.name ?? "Meld"
        if !isDM { content.subtitle = "#\(directory.title(of: chat))" }
        content.body = m.text.replacingOccurrences(of: #"\[\[cite:[^\]]+\]\]"#, with: "", options: .regularExpression)
        content.userInfo = ["chat": chat]
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: m.id, content: content, trigger: nil))
    }
}
