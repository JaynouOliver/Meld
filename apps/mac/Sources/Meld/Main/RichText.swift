import SwiftUI

/// Message text: inline markdown, plus the same chips as splitText() on the web
/// (src/lib/text.ts): @mentions, ticket ids (PREFIX-123) and verified citations.
struct RichText: View {
    let text: String
    let directory: Directory

    var body: some View {
        Text(Self.attributed(text, directory: directory))
            .font(.meldBody)
            .lineSpacing(4) // 14/22
            .foregroundStyle(Palette.ink)
            .textSelection(.enabled)
            .fixedSize(horizontal: false, vertical: true)
    }

    static func attributed(_ text: String, directory: Directory) -> AttributedString {
        let prefix = NSRegularExpression.escapedPattern(for: directory.workspace.ticketPrefix)
        let pattern = #"(\[\[cite:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+\]\]|@\w+|\b"# + prefix + #"-\d+\b)"#
        guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return AttributedString(text) }
        var out = AttributedString()
        let ns = text as NSString
        var cursor = 0
        for m in re.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            if m.range.location > cursor { out += markdown(ns.substring(with: NSRange(location: cursor, length: m.range.location - cursor))) }
            out += chip(ns.substring(with: m.range), directory: directory)
            cursor = m.range.location + m.range.length
        }
        if cursor < ns.length { out += markdown(ns.substring(from: cursor)) }
        return out
    }

    private static func markdown(_ s: String) -> AttributedString {
        (try? AttributedString(markdown: s, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(s)
    }

    private static func chip(_ token: String, directory: Directory) -> AttributedString {
        if token.hasPrefix("[[cite:") {
            let parts = token.dropFirst(7).dropLast(2).split(separator: ":")
            let chat = parts.first.map(String.init) ?? ""
            let label = directory.chats[chat] == nil ? "source" : (chatIsChannel(chat, directory) ? "#\(directory.title(of: chat))" : directory.title(of: chat))
            var a = AttributedString(" \(label) ↗ ")
            a.foregroundColor = Palette.link
            a.backgroundColor = Palette.quietFill
            a.font = .system(size: 12, weight: .medium)
            a.link = URL(string: "meld-chip://chat/\(chat)")
            return a
        }
        if token.hasPrefix("@") {
            var a = AttributedString(token)
            a.foregroundColor = Palette.mentionFg
            a.backgroundColor = Palette.mentionBg
            a.font = .system(size: 14, weight: .medium)
            return a
        }
        var a = AttributedString(token.uppercased())
        a.foregroundColor = Palette.link
        a.font = .system(size: 13, weight: .medium).monospacedDigit()
        a.link = URL(string: "meld-chip://ticket/\(token.uppercased())")
        return a
    }

    private static func chatIsChannel(_ id: ChatId, _ d: Directory) -> Bool {
        if case .channel = d.chats[id] { true } else { false }
    }
}

// MARK: - Composer

/// A bordered box; Enter sends, Option-Enter adds a line. `@` opens a picker (agents by
/// @handle, then people by first name), like the web composer.
struct Composer: View {
    let store: WorkspaceStore
    let chatId: ChatId
    let threadId: String?
    let placeholder: String
    @State private var text = ""
    @State private var sending = false
    @FocusState private var focused: Bool

    private var query: String? {
        guard let last = text.split(separator: " ", omittingEmptySubsequences: false).last, last.hasPrefix("@") else { return nil }
        return String(last.dropFirst()).lowercased()
    }

    private var suggestions: [(insert: String, person: Person?, name: String, sub: String)] {
        guard let q = query else { return [] }
        let dir = store.directory
        let agents = dir.agentList.filter { q.isEmpty || $0.handle.hasPrefix(q) || $0.name.lowercased().hasPrefix(q) }
            .map { ("@" + $0.handle, dir.people[$0.id], $0.name, "@" + $0.handle) }
        let people = dir.personOrder.compactMap { dir.people[$0] }
            .filter { !$0.agent && $0.id != dir.me && (q.isEmpty || $0.first.lowercased().hasPrefix(q)) }
            .map { ("@" + $0.first, Optional($0), $0.name, "@" + $0.first) }
        return Array((agents + people).prefix(6))
    }

    var body: some View {
        VStack(spacing: 0) {
            if !suggestions.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(suggestions, id: \.insert) { s in
                        Button { insert(s.insert) } label: {
                            HStack(spacing: 8) {
                                Avatar(person: s.person, size: 20)
                                Text(s.name).font(.system(size: 13, weight: .medium)).foregroundStyle(Palette.ink)
                                Text(s.sub).font(.meldCaption).foregroundStyle(Palette.muted)
                                if s.person?.agent == true { AgentTag() }
                                Spacer()
                            }
                            .padding(.horizontal, 10).frame(height: 30).contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(4)
                .background(Palette.popover, in: .rect(cornerRadius: 6))
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(Palette.border))
                .shadow(color: .black.opacity(0.1), radius: 8, y: 3)
                .padding(.horizontal, 16)
                .padding(.bottom, 6)
            }
            HStack(alignment: .bottom, spacing: 8) {
                TextField(placeholder, text: $text, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(.meldBody)
                    .lineLimit(1...8)
                    .focused($focused)
                    .onSubmit(send)
                    .padding(.vertical, 9)
                Button(action: send) {
                    Image(systemName: "paperplane.fill")
                        .font(.system(size: 12))
                        .foregroundStyle(.white)
                        .frame(width: 28, height: 28)
                        .background(canSend ? AnyShapeStyle(.tint) : AnyShapeStyle(Palette.subtle), in: .rect(cornerRadius: 6))
                }
                .buttonStyle(.plain)
                .disabled(!canSend)
                .help("Send (Enter)")
                .padding(.bottom, 5)
            }
            .padding(.leading, 12)
            .padding(.trailing, 6)
            .background(Palette.background, in: .rect(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(focused ? AnyShapeStyle(.tint) : AnyShapeStyle(Palette.input), lineWidth: focused ? 2 : 1))
            .padding(.horizontal, 16)
            Text("Tag @atlas or a teammate. Enter sends, Option-Enter adds a line.")
                .font(.system(size: 11)).foregroundStyle(Palette.subtle)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 18).padding(.vertical, 6)
        }
        .padding(.top, 6)
        .onAppear { focused = true }
    }

    private var canSend: Bool { !sending && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    private func insert(_ token: String) {
        var words = text.split(separator: " ", omittingEmptySubsequences: false).map(String.init)
        words.removeLast()
        words.append(token)
        text = words.joined(separator: " ") + " "
        focused = true
    }

    private func send() {
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty, !sending else { return }
        if let first = suggestions.first, query != nil, !text.hasSuffix(" ") { insert(first.insert); return }
        sending = true
        text = ""
        Task {
            await store.post(body, in: chatId, thread: threadId)
            sending = false
        }
    }
}

// MARK: - Thread panel

struct ThreadPanel: View {
    let store: WorkspaceStore
    let chatId: ChatId
    let root: Message
    let close: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Thread").font(.meldTitle).foregroundStyle(Palette.ink)
                    Text(store.directory.title(of: chatId)).font(.meldMeta).foregroundStyle(Palette.muted)
                }
                Spacer()
                Button(action: close) { Image(systemName: "xmark") }
                    .buttonStyle(MeldGhostButtonStyle())
                    .help("Close thread")
            }
            .padding(.horizontal, 16)
            .frame(height: 56)
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    MessageRow(store: store, chatId: chatId, message: root)
                    Divider().padding(.vertical, 8)
                    ForEach(root.replies) { r in
                        MessageRow(store: store, chatId: chatId, message: Message(reply: r))
                    }
                    ForEach(store.activeRuns(in: chatId).filter { $0.threadId == root.id }) { run in
                        WorkingBubble(store: store, run: run)
                    }
                }
                .padding(.vertical, 8)
            }
            .defaultScrollAnchor(.bottom)
            Composer(store: store, chatId: chatId, threadId: root.id, placeholder: "Reply…")
        }
        .background(Palette.background)
    }
}

extension Message {
    /// A thread reply, shown with the same row as a message.
    init(reply r: Reply) {
        id = r.id; who = r.who; time = r.time; text = r.text; ticket = r.ticket; action = r.action
        reactions = r.reactions; editedAt = r.editedAt; deletedAt = r.deletedAt; pinnedAt = nil; replies = []
    }
}
