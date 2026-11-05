import AppKit
import Observation
import SwiftUI
import UserNotifications

/// Screens in the sidebar. Chats are native; the rest host the web pages for now.
enum Screen: Hashable {
    case home, missions, decisions, people, playbooks, tickets
    case chat(ChatId)

    var webPath: String? {
        switch self {
        case .home: "/home"
        case .missions: "/missions"
        case .decisions: "/decisions"
        case .people: "/people"
        case .playbooks: "/playbooks"
        case .tickets: "/tickets"
        case .chat: nil
        }
    }
}

/// The signed-in workspace: directory, messages, tickets and agent runs, kept live by
/// realtime pings (with a slow poll as a safety net).
@MainActor
@Observable
final class WorkspaceStore {
    let api: MeldAPI
    private(set) var directory: Directory
    private(set) var messages: [ChatId: [Message]] = [:]
    private(set) var loading: Set<ChatId> = []
    private(set) var tickets: [String: Ticket] = [:]
    private(set) var runs: [RunView] = []
    private(set) var runSteps: [String: String] = [:]
    private(set) var unread: [ChatId: Int] = [:]
    var screen: Screen
    var openThread: String?
    var openTicket: String?
    var errorMessage: String?

    @ObservationIgnored private let realtime = Realtime()
    @ObservationIgnored private var pollTask: Task<Void, Never>?
    @ObservationIgnored private var runPoll: Task<Void, Never>?

    init(api: MeldAPI, directory: Directory) {
        self.api = api
        self.directory = directory
        self.screen = .chat(directory.home)
    }

    var me: Person? { directory.people[directory.me] }

    func start() {
        Task { await loadBoot() }
        realtime.onChange = { [weak self] in self?.apply($0) }
        realtime.onRun = { [weak self] p in self?.runSteps[p.runId] = p.step }
        realtime.connect(workspaceId: directory.workspace.id)
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(45))
                await self?.refreshActive()
            }
        }
    }

    func stop() {
        realtime.disconnect()
        pollTask?.cancel()
        runPoll?.cancel()
    }

    // MARK: Loading

    private func loadBoot() async {
        do {
            let boot = try await api.call("getBoot", as: Boot.self)
            if let d = boot.directory { directory = d }
            for (chat, list) in boot.messages ?? [:] { messages[chat] = list }
            tickets = Dictionary((boot.tickets ?? []).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
            await SessionCookies.syncWorkspaceCookie()
        } catch {
            errorMessage = error.localizedDescription
        }
        if case .chat(let c) = screen { await open(chat: c) }
        await refreshRuns()
    }

    func open(chat: ChatId) async {
        unread[chat] = nil
        updateDockBadge()
        if messages[chat] == nil { loading.insert(chat) }
        await reload(chat: chat)
        loading.remove(chat)
        try? await api.send("markRead", [chat])
    }

    func reload(chat: ChatId) async {
        do {
            messages[chat] = try await api.call("getMessages", [chat], as: [Message].self)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func reloadDirectory() async {
        if let d = try? await api.call("getDirectory", as: Directory?.self) { directory = d }
    }

    func reloadTickets() async {
        if let list = try? await api.call("getTickets", as: [Ticket].self) {
            tickets = Dictionary(list.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        }
    }

    private func refreshActive() async {
        if case .chat(let c) = screen { await reload(chat: c) }
    }

    // MARK: Actions

    func post(_ text: String, in chat: ChatId, thread: String? = nil) async {
        var input: [String: Any] = ["chatId": chat, "text": text, "role": directory.role.rawValue]
        if let thread { input["threadId"] = thread }
        struct Posted: Decodable { let id: String; let runs: [RunView]? }
        do {
            let posted = try await api.call("postMessage", [input], as: Posted.self)
            if let r = posted.runs, !r.isEmpty { runs.append(contentsOf: r); watchRuns() }
            await reload(chat: chat)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Confirm, cancel or undo an agent's change.
    func decide(_ action: ActionView, _ decision: String, in chat: ChatId) async {
        do {
            try await api.send("decideAction", [["id": action.id, "decision": decision, "role": directory.role.rawValue]])
            await reload(chat: chat)
            await reloadTickets()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func search(_ query: String) async throws -> [MessageHit] {
        try await api.call("searchMessages", [query], as: [MessageHit].self)
    }

    func openDm(with person: PersonId) async {
        struct Opened: Decodable { let id: String }
        guard let r = try? await api.call("openDm", [person], as: Opened.self) else { return }
        await reloadDirectory()
        screen = .chat(r.id)
    }

    func toggleReaction(_ emoji: String, on messageId: String, in chat: ChatId) async {
        let list = messages[chat] ?? []
        let current = list.first { $0.id == messageId }?.reactions
            ?? list.lazy.flatMap(\.replies).first { $0.id == messageId }?.reactions
        let mine = current?[emoji]?.contains(directory.me) ?? false
        do {
            try await api.send("toggleReaction", [["id": messageId, "emoji": emoji, "on": !mine]])
        } catch {
            errorMessage = error.localizedDescription
        }
        await reload(chat: chat)
    }

    // MARK: Agent runs

    func activeRuns(in chat: ChatId) -> [RunView] { runs.filter { $0.chatId == chat && $0.isActive } }

    private func refreshRuns() async {
        if let list = try? await api.call("getAgentRuns", as: [RunView].self) {
            runs = list
            if list.contains(where: \.isActive) { watchRuns() }
        }
    }

    /// While an agent works: poll its runs (realtime adds the live step), then refresh the chat.
    private func watchRuns() {
        guard runPoll == nil else { return }
        runPoll = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(2))
                guard let self else { return }
                let before = Set(self.runs.filter(\.isActive).map(\.chatId))
                await self.refreshRuns()
                let after = Set(self.runs.filter(\.isActive).map(\.chatId))
                for chat in before.subtracting(after) { await self.reload(chat: chat) }
                if after.isEmpty { break }
            }
            self?.runPoll = nil
        }
    }

    // MARK: Realtime

    private func apply(_ ping: ChangePing) {
        Task {
            if ping.runs == true { await refreshRuns() }
            if ping.directory == true { await reloadDirectory() }
            if ping.tickets { await reloadTickets() }
            guard ping.origin != MeldAPI.clientId else { return }
            for chat in ping.chats {
                if messages[chat] != nil || isActive(chat) { await reload(chat: chat) }
                if ping.quiet != true && !(isActive(chat) && NSApp.isActive) {
                    unread[chat, default: 0] += 1
                    notifyIfNeeded(chat: chat)
                }
            }
            updateDockBadge()
        }
    }

    private func isActive(_ chat: ChatId) -> Bool { screen == .chat(chat) }

    func totalUnread() -> Int { unread.values.reduce(0, +) }

    private func updateDockBadge() {
        let n = totalUnread()
        NSApp.dockTile.badgeLabel = n > 0 ? "\(n)" : nil
    }

    /// DMs and @mentions of you: a system notification ("Agents tell you when something needs you").
    private func notifyIfNeeded(chat: ChatId) {
        guard let last = messages[chat]?.last, last.who != directory.me else { return }
        let isDM: Bool = if case .dm = directory.chats[chat] { true } else { false }
        let first = me?.first.lowercased() ?? "-"
        guard isDM || last.text.lowercased().contains("@\(first)") else { return }
        let content = UNMutableNotificationContent()
        content.title = directory.people[last.who]?.name ?? "Meld"
        content.subtitle = isDM ? "" : directory.title(of: chat)
        content.body = last.text.replacingOccurrences(of: #"\[\[cite:[^\]]+\]\]"#, with: "", options: .regularExpression)
        content.userInfo = ["chat": chat]
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: last.id, content: content, trigger: nil))
    }
}
