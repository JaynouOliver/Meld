import SwiftUI

struct ChatView: View {
    @Bindable var store: WorkspaceStore
    let chatId: ChatId
    @State private var showThread = false

    private var dir: Directory { store.directory }
    private var list: [Message]? { store.messages[chatId] }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            ZStack(alignment: .top) {
                if let list {
                    MessageList(store: store, chatId: chatId, messages: list) { id in
                        store.openThread = id
                        showThread = true
                    }
                } else {
                    MessageSkeleton()
                }
                if !store.activeRuns(in: chatId).isEmpty { WorkingBar() }
            }
            ForEach(store.activeRuns(in: chatId).filter { $0.threadId == nil }) { run in
                WorkingBubble(store: store, run: run)
            }
            Composer(store: store, chatId: chatId, threadId: nil, placeholder: "Message \(placeholderName)")
        }
        .inspector(isPresented: $showThread) {
            if let t = store.openThread, let root = list?.first(where: { $0.id == t }) {
                ThreadPanel(store: store, chatId: chatId, root: root) { showThread = false }
                    .inspectorColumnWidth(min: 340, ideal: 420, max: 520)
            }
        }
        .task(id: chatId) { await store.open(chat: chatId) }
        .navigationTitle("")
        .environment(\.openURL, OpenURLAction { url in route(url) })
    }

    private var placeholderName: String {
        if case .channel(_, let label, _, _) = dir.chats[chatId] { return "#\(label)" }
        return dir.title(of: chatId)
    }

    /// The 56pt header: title (15 semibold) and topic (13 muted).
    private var header: some View {
        HStack(spacing: 10) {
            if case .dm(_, let who, _) = dir.chats[chatId] {
                Avatar(person: dir.people[who], size: 24)
            } else {
                Image(systemName: "number").foregroundStyle(Palette.muted)
            }
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    Text(dir.title(of: chatId)).font(.meldTitle).foregroundStyle(Palette.ink)
                    if case .dm(_, let who, _) = dir.chats[chatId], dir.people[who]?.agent == true { AgentTag() }
                }
                if let topic = dir.chats[chatId]?.topic, !topic.isEmpty {
                    Text(topic).font(.meldMeta).foregroundStyle(Palette.muted).lineLimit(1)
                }
            }
            Spacer()
        }
        .padding(.horizontal, 20)
        .frame(height: 56)
    }

    /// Chips use meld:// links: tickets open the ticket, citations jump to the chat.
    private func route(_ url: URL) -> OpenURLAction.Result {
        guard url.scheme == "meld-chip" else { return .systemAction }
        let parts = url.pathComponents.filter { $0 != "/" }
        switch url.host() {
        case "ticket": store.openTicket = parts.first
        case "chat": if let c = parts.first { store.screen = .chat(c) }
        default: break
        }
        return .handled
    }
}

// MARK: - Message list

private struct MessageList: View {
    let store: WorkspaceStore
    let chatId: ChatId
    let messages: [Message]
    let openThread: (String) -> Void

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if messages.isEmpty {
                        Text("No messages yet. Say hello, or tag @atlas to file a ticket.")
                            .font(.meldMeta).foregroundStyle(Palette.muted)
                            .padding(20)
                    }
                    ForEach(Array(messages.enumerated()), id: \.element.id) { i, m in
                        MessageRow(store: store, chatId: chatId, message: m,
                                   compact: i > 0 && messages[i - 1].who == m.who && m.action == nil && messages[i - 1].action == nil && m.replies.isEmpty && messages[i - 1].replies.isEmpty,
                                   openThread: openThread)
                            .id(m.id)
                    }
                    Color.clear.frame(height: 8).id("bottom")
                }
                .padding(.vertical, 8)
            }
            .defaultScrollAnchor(.bottom)
            .onChange(of: messages.last?.id) { _, _ in
                withAnimation(Motion.arrive) { proxy.scrollTo("bottom", anchor: .bottom) }
            }
        }
    }
}

struct MessageRow: View {
    let store: WorkspaceStore
    let chatId: ChatId
    let message: Message
    var compact = false
    var openThread: ((String) -> Void)?
    @State private var hovering = false

    var body: some View {
        let dir = store.directory
        let person = dir.people[message.who]
        HStack(alignment: .top, spacing: 10) {
            if compact {
                Color.clear.frame(width: 32, height: 1)
            } else {
                Avatar(person: person, size: 32)
            }
            VStack(alignment: .leading, spacing: 3) {
                if !compact {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(person?.name ?? "Someone").font(.meldName).foregroundStyle(Palette.ink)
                        if person?.agent == true { AgentTag() }
                        Text(ISO8601.display(message.time)).font(.meldCaption).foregroundStyle(Palette.muted)
                        if message.editedAt != nil { Text("(edited)").font(.meldCaption).foregroundStyle(Palette.subtle) }
                    }
                }
                if message.deletedAt != nil {
                    Text("This message was deleted.").font(.meldBody).italic().foregroundStyle(Palette.muted)
                } else {
                    RichText(text: message.text, directory: dir)
                }
                if let tid = message.ticket, let t = store.tickets[tid] { TicketCard(ticket: t, directory: dir) { store.openTicket = tid } }
                if let action = message.action { ActionCard(store: store, chatId: chatId, action: action) }
                if let r = message.reactions, !r.isEmpty { Reactions(store: store, chatId: chatId, messageId: message.id, reactions: r) }
                if !message.replies.isEmpty, let openThread {
                    ThreadSummary(store: store, replies: message.replies) { openThread(message.id) }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.top, compact ? 2 : 10)
        .padding(.bottom, 2)
        .background(hovering ? Palette.quietFill : .clear)
        .overlay(alignment: .topTrailing) {
            if hovering, let openThread {
                HStack(spacing: 2) {
                    ForEach(["👍", "👀", "✅"], id: \.self) { e in
                        Button(e) { Task { await store.toggleReaction(e, on: message.id, in: chatId) } }
                    }
                    Button { openThread(message.id) } label: { Image(systemName: "arrowshape.turn.up.left") }
                        .help("Reply in thread")
                }
                .buttonStyle(MeldGhostButtonStyle())
                .padding(2)
                .background(Palette.popover, in: .rect(cornerRadius: 6))
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(Palette.border))
                .shadow(color: .black.opacity(0.08), radius: 3, y: 1)
                .padding(.trailing, 16)
                .offset(y: -10)
            }
        }
        .onHover { hovering = $0 }
        .arrive()
    }
}

/// "5 replies" with reply faces.
private struct ThreadSummary: View {
    let store: WorkspaceStore
    let replies: [Reply]
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            HStack(spacing: 6) {
                HStack(spacing: -4) {
                    ForEach(Array(Set(replies.map(\.who))).prefix(3), id: \.self) { who in
                        Avatar(person: store.directory.people[who], size: 20)
                            .overlay(RoundedRectangle(cornerRadius: 6).stroke(Palette.background, lineWidth: 1.5))
                    }
                }
                Text("\(replies.count) \(replies.count == 1 ? "reply" : "replies")")
                    .font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.link)
                if let last = replies.last {
                    Text("Last reply \(ISO8601.display(last.time))").font(.meldCaption).foregroundStyle(Palette.muted)
                }
            }
        }
        .buttonStyle(.plain)
        .padding(.top, 2)
    }
}

private struct Reactions: View {
    let store: WorkspaceStore
    let chatId: ChatId
    let messageId: String
    let reactions: [String: [PersonId]]

    var body: some View {
        HStack(spacing: 4) {
            ForEach(reactions.keys.sorted(), id: \.self) { emoji in
                let who = reactions[emoji] ?? []
                let mine = who.contains(store.directory.me)
                Button { Task { await store.toggleReaction(emoji, on: messageId, in: chatId) } } label: {
                    HStack(spacing: 3) {
                        Text(emoji)
                        Text("\(who.count)").font(.system(size: 11, weight: .medium).monospacedDigit())
                    }
                    .padding(.horizontal, 6).frame(height: 22)
                    .background(mine ? Palette.mentionBg : Palette.quietFill, in: .rect(cornerRadius: 4))
                    .overlay(RoundedRectangle(cornerRadius: 4).stroke(mine ? Palette.mentionFg.opacity(0.4) : Palette.border))
                    .foregroundStyle(mine ? Palette.mentionFg : Palette.ink2)
                }
                .buttonStyle(.plain)
                .help(who.compactMap { store.directory.people[$0]?.name }.joined(separator: ", "))
            }
        }
    }
}

/// An agent's change: what changed, with Undo; destructive or multi-ticket changes wait for Confirm.
private struct ActionCard: View {
    let store: WorkspaceStore
    let chatId: ChatId
    let action: ActionView
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(action.summary, id: \.self) { line in
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Image(systemName: icon).font(.system(size: 11)).foregroundStyle(tint)
                    Text(line).font(.meldMeta).foregroundStyle(Palette.ink)
                }
            }
            HStack(spacing: 8) {
                switch action.status {
                case "pending":
                    Button(action.destructive ? "Confirm" : "Confirm") { decide("confirm") }
                        .buttonStyle(MeldPrimaryButtonStyle(height: 28)).fixedSize()
                    Button("Cancel") { decide("cancel") }
                        .buttonStyle(MeldSecondaryButtonStyle(height: 28, fill: false))
                case "applied":
                    Text("Done").font(.meldCaption).foregroundStyle(Palette.success)
                    if action.canUndo {
                        Button("Undo") { decide("undo") }
                            .buttonStyle(MeldSecondaryButtonStyle(height: 26, fill: false))
                    }
                case "undone":
                    Text("Undone").font(.meldCaption).foregroundStyle(Palette.muted)
                default:
                    Text("Canceled").font(.meldCaption).foregroundStyle(Palette.muted)
                }
                if busy { ProgressView().controlSize(.small) }
            }
            .disabled(busy)
        }
        .padding(12)
        .frame(maxWidth: 520, alignment: .leading)
        .background(Palette.card, in: .rect(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(action.status == "pending" && action.destructive ? Palette.destructive.opacity(0.5) : Palette.border))
        .padding(.top, 4)
    }

    private var icon: String { action.status == "pending" ? (action.destructive ? "exclamationmark.triangle" : "questionmark.circle") : "checkmark.circle" }
    private var tint: Color { action.status == "pending" ? (action.destructive ? Palette.destructive : Palette.warning) : Palette.success }

    private func decide(_ d: String) {
        busy = true
        Task {
            await store.decide(action, d, in: chatId)
            busy = false
        }
    }
}

private struct TicketCard: View {
    let ticket: Ticket
    let directory: Directory
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            HStack(spacing: 10) {
                Text(ticket.id).font(.system(size: 12, weight: .medium).monospaced()).foregroundStyle(Palette.link)
                Text(ticket.title).font(.meldMeta).foregroundStyle(Palette.ink).lineLimit(1)
                Spacer(minLength: 8)
                StatusPill(status: ticket.status)
                Avatar(person: directory.people[ticket.assignee], size: 20)
            }
            .padding(10)
            .frame(maxWidth: 520)
            .background(Palette.card, in: .rect(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(Palette.border))
        }
        .buttonStyle(.plain)
        .padding(.top, 4)
    }
}

/// "Atlas is working · Reading #product…" while a run is active.
struct WorkingBubble: View {
    let store: WorkspaceStore
    let run: RunView

    var body: some View {
        let agent = store.directory.people[run.agentId ?? "atlas"]
        HStack(spacing: 8) {
            Avatar(person: agent, size: 20)
            Text("\(agent?.first ?? "Atlas") is working").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.ink2)
            if let step = store.runSteps[run.id] ?? run.step ?? run.note {
                Text(step).font(.meldCaption).foregroundStyle(Palette.muted).lineLimit(1)
            }
            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 6)
        .transition(.opacity)
    }
}

/// Skeleton rows shaped like messages: never a lone spinner.
private struct MessageSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            ForEach(0..<6, id: \.self) { i in
                HStack(alignment: .top, spacing: 10) {
                    RoundedRectangle(cornerRadius: 6).fill(Palette.quietFill).frame(width: 32, height: 32)
                    VStack(alignment: .leading, spacing: 6) {
                        Skeleton(width: 120, height: 10)
                        Skeleton(width: [360, 280, 420, 220, 320, 260][i], height: 10)
                    }
                }
            }
            Spacer()
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
