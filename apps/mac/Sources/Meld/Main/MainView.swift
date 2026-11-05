import SwiftUI

struct MainView: View {
    @Environment(AppModel.self) private var model
    let store: WorkspaceStore
    @State private var showSearch = false
    @State private var showNewMessage = false

    var body: some View {
        @Bindable var store = store
        NavigationSplitView {
            Sidebar(store: store, showSearch: $showSearch, showNewMessage: $showNewMessage)
                .navigationSplitViewColumnWidth(min: 240, ideal: 264, max: 300)
        } detail: {
            Group {
                switch store.screen {
                case .chat(let id):
                    ChatView(store: store, chatId: id).id(id)
                default:
                    WebScreen(store: store, path: store.screen.webPath ?? "/home")
                }
            }
            .background(Palette.background)
        }
        .sheet(isPresented: $showSearch) { SearchSheet(store: store) }
        .sheet(isPresented: $showNewMessage) { NewMessageSheet(store: store) }
        .sheet(item: Binding(get: { store.openTicket.map(IdBox.init) }, set: { store.openTicket = $0?.id })) { box in
            TicketSheet(store: store, ticketId: box.id)
        }
        .focusedSceneValue(\.meldActions, MeldActions(
            search: { showSearch = true },
            newMessage: { showNewMessage = true },
            go: { index in
                let screens = Sidebar.shortcutScreens(store.directory)
                if index < screens.count { store.screen = screens[index] }
            }))
    }
}

struct IdBox: Identifiable { let id: String }

/// Menu commands (⌘K, ⌘N, ⌘1–9) reach the window through this.
struct MeldActions {
    var search: () -> Void
    var newMessage: () -> Void
    var go: (Int) -> Void
}

struct MeldActionsKey: FocusedValueKey { typealias Value = MeldActions }

extension FocusedValues {
    var meldActions: MeldActions? {
        get { self[MeldActionsKey.self] }
        set { self[MeldActionsKey.self] = newValue }
    }
}

// MARK: - Sidebar

struct Sidebar: View {
    @Environment(AppModel.self) private var model
    @Bindable var store: WorkspaceStore
    @Binding var showSearch: Bool
    @Binding var showNewMessage: Bool

    /// ⌘1… order: Home, Missions, Decisions, People, Playbooks, Tickets, then channels.
    static func shortcutScreens(_ dir: Directory) -> [Screen] {
        [.home, .missions, .decisions, .people, .playbooks, .tickets] + dir.channels.map { .chat($0) }
    }

    var body: some View {
        let dir = store.directory
        List(selection: Binding(get: { store.screen }, set: { if let s = $0 { store.screen = s } })) {
            Section {
                row(.home, "Home", "house")
                row(.missions, "Missions", "flag")
                row(.decisions, "Decisions", "bookmark")
                row(.people, "People", "person.2")
                row(.playbooks, "Playbooks", "checklist")
                row(.tickets, "Tickets", "ticket")
            }

            Section("Channels") {
                ForEach(dir.channels, id: \.self) { id in
                    chatRow(id, label: dir.title(of: id), icon: "number")
                }
            }

            let people = dir.dms.filter { if case .dm(_, let who, _) = dir.chats[$0] { !(dir.people[who]?.agent ?? false) } else { false } }
            if !people.isEmpty {
                Section("Direct messages") {
                    ForEach(people, id: \.self) { id in personRow(id) }
                }
            }

            Section("Agents") {
                ForEach(dir.agentList) { agent in
                    if let dm = dir.dms.first(where: { if case .dm(_, let who, _) = dir.chats[$0] { who == agent.id } else { false } }) {
                        personRow(dm)
                    } else {
                        Button {
                            Task { await store.openDm(with: agent.id) }
                        } label: {
                            agentLabel(agent.id, name: agent.name)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .listStyle(.sidebar)
        .safeAreaInset(edge: .top, spacing: 0) {
            VStack(spacing: 8) {
                WorkspaceSwitcher(store: store)
                HStack(spacing: 6) {
                    Button { showSearch = true } label: {
                        Label("Search", systemImage: "magnifyingglass")
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .help("Search (⌘K)")
                    Button { showNewMessage = true } label: {
                        Image(systemName: "square.and.pencil")
                    }
                    .help("New message (⌘N)")
                }
                .buttonStyle(.glass)
                .controlSize(.regular)
            }
            .padding(.horizontal, 10)
            .padding(.bottom, 6)
        }
    }

    private func row(_ screen: Screen, _ title: String, _ icon: String) -> some View {
        Label(title, systemImage: icon).tag(screen)
    }

    private func chatRow(_ id: ChatId, label: String, icon: String) -> some View {
        HStack {
            Label(label, systemImage: icon)
            Spacer()
            if let n = store.unread[id], n > 0 { UnreadBadge(count: n) }
        }
        .fontWeight((store.unread[id] ?? 0) > 0 ? .semibold : .regular)
        .tag(Screen.chat(id))
    }

    private func personRow(_ chat: ChatId) -> some View {
        let who: PersonId = if case .dm(_, let w, _) = store.directory.chats[chat] { w } else { "" }
        return HStack {
            agentLabel(who, name: store.directory.people[who]?.name ?? "Direct message")
            Spacer()
            if let n = store.unread[chat], n > 0 { UnreadBadge(count: n) }
        }
        .tag(Screen.chat(chat))
    }

    private func agentLabel(_ id: PersonId, name: String) -> some View {
        Label {
            Text(name)
        } icon: {
            Avatar(person: store.directory.people[id], size: 18)
        }
    }
}

/// Square initial tile plus the workspace name, with settings in its menu.
private struct WorkspaceSwitcher: View {
    @Environment(AppModel.self) private var model
    let store: WorkspaceStore

    var body: some View {
        @Bindable var model = model
        let ws = store.directory.workspace
        Menu {
            if store.directory.memberships.count > 1 {
                Section("Switch workspace") {
                    ForEach(store.directory.memberships) { m in
                        Button(m.name) {
                            Task {
                                try? await store.api.send("switchWorkspace", [m.id])
                                await model.workspaceReady()
                            }
                        }
                        .disabled(m.id == ws.id)
                    }
                }
            }
            Picker("Accent color", selection: $model.accent) {
                ForEach(Accent.allCases) { Text($0.label).tag($0) }
            }
            Button("Workspace settings in browser") {
                NSWorkspace.shared.open(Config.webURL.appending(path: "people"))
            }
            Divider()
            Button("Sign out", role: .destructive) { model.signOut() }
        } label: {
            HStack(spacing: 8) {
                Text(String(ws.name.prefix(1)).uppercased())
                    .font(.system(size: 12, weight: .semibold)).foregroundStyle(.white)
                    .frame(width: 24, height: 24)
                    .background(.tint, in: .rect(cornerRadius: 6))
                Text(ws.name).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                Spacer(minLength: 0)
                if let me = store.me { Avatar(person: me, size: 22) }
            }
            .contentShape(.rect)
        }
        .menuStyle(.button)
        .buttonStyle(.plain)
        .menuIndicator(.hidden)
        .padding(.vertical, 4)
    }
}
