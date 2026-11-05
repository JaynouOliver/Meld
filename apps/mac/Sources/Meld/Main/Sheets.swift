import SwiftUI

/// ⌘K: search messages across the workspace.
struct SearchSheet: View {
    let store: WorkspaceStore
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var hits: [MessageHit] = []
    @State private var searching = false
    @State private var error: String?

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(Palette.muted)
                TextField("Search messages", text: $query)
                    .textFieldStyle(.plain)
                    .font(.system(size: 15))
                    .onSubmit { Task { await run() } }
                if searching { ProgressView().controlSize(.small) }
            }
            .padding(14)
            Divider()
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if let error {
                        Text(error).font(.meldMeta).foregroundStyle(Palette.destructive).padding(16)
                    } else if hits.isEmpty {
                        Text(query.isEmpty ? "Search for words in any channel or DM you can read."
                             : searching ? "" : "No messages match \u{201C}\(query)\u{201D}. Search matches whole words, and skips very common ones.")
                            .font(.meldMeta).foregroundStyle(Palette.muted).padding(16)
                    }
                    ForEach(hits) { hit in
                        Button {
                            store.screen = .chat(hit.chatId)
                            dismiss()
                        } label: {
                            HStack(alignment: .top, spacing: 10) {
                                Avatar(person: store.directory.people[hit.who], size: 28)
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack(spacing: 6) {
                                        Text(store.directory.people[hit.who]?.name ?? "").font(.system(size: 13, weight: .semibold))
                                        Text(store.directory.title(of: hit.chatId)).font(.meldCaption).foregroundStyle(Palette.muted)
                                        Text(ISO8601.display(hit.time)).font(.meldCaption).foregroundStyle(Palette.subtle)
                                    }
                                    Text(hit.text).font(.meldMeta).foregroundStyle(Palette.ink2).lineLimit(2)
                                }
                                Spacer()
                            }
                            .padding(.horizontal, 14).padding(.vertical, 8).contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .frame(width: 560, height: 420)
        .task(id: query) {
            try? await Task.sleep(for: .milliseconds(250))
            await run()
        }
    }

    private func run() async {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else { hits = []; return }
        searching = true
        do {
            hits = try await store.search(q)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        searching = false
    }
}

/// ⌘N: start a DM with someone in the workspace.
struct NewMessageSheet: View {
    let store: WorkspaceStore
    @Environment(\.dismiss) private var dismiss
    @State private var filter = ""

    var body: some View {
        let dir = store.directory
        let people = dir.personOrder.compactMap { dir.people[$0] }
            .filter { $0.id != dir.me && (filter.isEmpty || $0.name.localizedCaseInsensitiveContains(filter)) }
        VStack(spacing: 0) {
            HStack {
                Text("New message").font(.meldDialogTitle)
                Spacer()
                Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction)
            }
            .padding(16)
            TextField("Find a person or agent", text: $filter)
                .textFieldStyle(MeldFieldStyle())
                .padding(.horizontal, 16)
            List(people) { p in
                Button {
                    Task {
                        await store.openDm(with: p.id)
                        dismiss()
                    }
                } label: {
                    HStack(spacing: 10) {
                        Avatar(person: p, size: 28)
                        Text(p.name).font(.system(size: 13, weight: .medium))
                        if p.agent { AgentTag() }
                        if let t = p.title { Text(t).font(.meldCaption).foregroundStyle(Palette.muted) }
                        Spacer()
                    }
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
            }
            .listStyle(.inset)
        }
        .frame(width: 420, height: 440)
    }
}

/// A ticket's details. Editing stays in the Tickets screen for now.
struct TicketSheet: View {
    let store: WorkspaceStore
    let ticketId: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let dir = store.directory
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text(ticketId).font(.system(size: 13, weight: .medium).monospaced()).foregroundStyle(Palette.link)
                Spacer()
                Button("Done") { dismiss() }.keyboardShortcut(.cancelAction)
            }
            if let t = store.tickets[ticketId] {
                Text(t.title).font(.meldDialogTitle).foregroundStyle(Palette.ink)
                Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 10) {
                    GridRow { label("Status"); StatusPill(status: t.status) }
                    GridRow {
                        label("Priority")
                        Text(t.priority.rawValue).font(.system(size: 13, weight: .medium)).foregroundStyle(Palette.priority(t.priority))
                    }
                    GridRow {
                        label("Assignee")
                        HStack(spacing: 6) {
                            Avatar(person: dir.people[t.assignee], size: 20)
                            Text(dir.people[t.assignee]?.name ?? "Unassigned").font(.meldMeta)
                        }
                    }
                }
                Button("Open in Tickets") {
                    store.screen = .tickets
                    dismiss()
                }
                .buttonStyle(MeldSecondaryButtonStyle(fill: false))
            } else {
                Text("You can't see this ticket, or it was deleted.").font(.meldMeta).foregroundStyle(Palette.muted)
            }
        }
        .padding(20)
        .frame(width: 420)
    }

    private func label(_ s: String) -> some View {
        Text(s).font(.meldMeta).foregroundStyle(Palette.muted).frame(width: 70, alignment: .leading)
    }
}
