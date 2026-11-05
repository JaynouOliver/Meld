import SwiftUI
import UserNotifications

// MARK: - 2. Sign in

struct SignInStep: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(spacing: 24) {
            Spacer(minLength: 0)
            switch model.signIn {
            case .waitingForBrowser(let p):
                StepHeader(title: "Finish signing in in your browser",
                           subtitle: "Continue with \(p.title) in the browser tab we opened. Meld comes back to the front when you're done.")
                OnboardingCard {
                    WorkingBar()
                    HStack(spacing: 10) {
                        Button("Cancel") { model.cancelSignIn() }
                            .buttonStyle(MeldSecondaryButtonStyle())
                        Button("Open browser again") { model.reopenBrowser() }
                            .buttonStyle(MeldPrimaryButtonStyle())
                    }
                }
            case .finishing, .startingDemo:
                StepHeader(title: "Signing you in", subtitle: "This takes a moment.")
                OnboardingCard {
                    WorkingBar()
                    Skeleton(height: 12)
                    Skeleton(width: 220, height: 12)
                }
            case .checkEmail(let address):
                StepHeader(title: "Check your email",
                           subtitle: "We sent a link to \(address). Open it on this Mac to confirm your account, and Meld signs you in.")
                OnboardingCard {
                    Image(systemName: "envelope.badge")
                        .font(.system(size: 28))
                        .symbolRenderingMode(.hierarchical)
                        .foregroundStyle(.tint)
                    Button("Use a different email") { model.signIn = .idle }
                        .buttonStyle(MeldSecondaryButtonStyle())
                }
            case .idle, .emailBusy:
                SignInForm()
                Button("Back") { model.backToWelcome() }
                    .buttonStyle(MeldGhostButtonStyle())
                    .foregroundStyle(Palette.muted)
                    .disabled(model.signIn == .emailBusy)
            }
            Spacer(minLength: 0)
        }
        .animation(.spring(duration: 0.3), value: model.signIn)
    }
}

/// Google and GitHub in the browser, or email and password, like the web's login card.
private struct SignInForm: View {
    @Environment(AppModel.self) private var model
    @State private var creating = false
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @FocusState private var focus: Field?

    private enum Field { case name, email, password }

    private var busy: Bool { model.signIn == .emailBusy }
    private var canSubmit: Bool {
        !busy && email.contains("@") && password.count >= (creating ? 6 : 1)
    }

    var body: some View {
        VStack(spacing: 24) {
            StepHeader(title: creating ? "Create your Meld account" : "Sign in to Meld",
                       subtitle: creating
                        ? "Then set up your company's workspace and invite your team."
                        : "Pick how you signed up. Your session is kept in your Mac's Keychain.")
            OnboardingCard {
                ProviderButton(provider: .google)
                ProviderButton(provider: .github)
                OrDivider()
                VStack(spacing: 8) {
                    if creating {
                        TextField("Your name", text: $name)
                            .textFieldStyle(MeldFieldStyle())
                            .textContentType(.name)
                            .focused($focus, equals: .name)
                            .onSubmit { focus = .email }
                    }
                    TextField("you@company.com", text: $email)
                        .textFieldStyle(MeldFieldStyle())
                        .textContentType(.username)
                        .focused($focus, equals: .email)
                        .onSubmit { focus = .password }
                    SecureField(creating ? "Password (6+ characters)" : "Password", text: $password)
                        .textFieldStyle(MeldFieldStyle())
                        .textContentType(creating ? .newPassword : .password)
                        .focused($focus, equals: .password)
                        .onSubmit(submit)
                }
                .disabled(busy)
                Button(action: submit) {
                    Text(busy ? (creating ? "Creating your account…" : "Signing in…") : (creating ? "Sign up with email" : "Sign in with email"))
                }
                .buttonStyle(MeldPrimaryButtonStyle())
                .disabled(!canSubmit)
                if busy { WorkingBar() }
                if let e = model.errorMessage { ErrorNote(message: e) }
            }
            HStack(spacing: 4) {
                Text(creating ? "Already have an account?" : "New to Meld?")
                    .foregroundStyle(Palette.muted)
                Button(creating ? "Sign in" : "Create an account") {
                    model.errorMessage = nil
                    creating.toggle()
                }
                .buttonStyle(.plain)
                .foregroundStyle(Palette.link)
                .fontWeight(.medium)
                .disabled(busy)
            }
            .font(.meldMeta)
        }
    }

    private func submit() {
        guard canSubmit else { return }
        if creating {
            model.signUp(name: name, email: email, password: password)
        } else {
            model.signIn(email: email, password: password)
        }
    }
}

/// "or" between the provider buttons and the email form.
private struct OrDivider: View {
    var body: some View {
        HStack(spacing: 12) {
            Rectangle().fill(Palette.border).frame(height: 1)
            Text("or").font(.meldMeta).foregroundStyle(Palette.muted)
            Rectangle().fill(Palette.border).frame(height: 1)
        }
        .padding(.vertical, 2)
    }
}

private struct ProviderButton: View {
    @Environment(AppModel.self) private var model
    let provider: OAuthProvider

    var body: some View {
        Button {
            model.signIn(with: provider)
        } label: {
            HStack(spacing: 10) {
                Image(nsImage: provider == .google ? BrandLogo.google : BrandLogo.github)
                    .resizable().scaledToFit()
                    .frame(width: 16, height: 16)
                Text("Continue with \(provider.title)")
            }
        }
        .buttonStyle(MeldSecondaryButtonStyle(height: 40))
    }
}

// MARK: - 3. Workspace

struct WorkspaceStep: View {
    @Environment(AppModel.self) private var model
    @State private var mode = 0
    @State private var name = ""
    @State private var prefix = ""
    @State private var prefixEdited = false
    @State private var invite = ""
    @State private var busy = false
    @State private var error: String?

    private var shownPrefix: String { prefixEdited ? prefix : Self.prefixFor(name) }

    var body: some View {
        @Bindable var model = model
        VStack(spacing: 22) {
            Spacer(minLength: 0)
            StepHeader(title: "Set up your workspace",
                       subtitle: "Create one for your company, or join your team with an invite link.")
            HStack(alignment: .top, spacing: 20) {
                OnboardingCard(width: 360) {
                    Picker("", selection: $mode) {
                        Text("Create a company").tag(0)
                        Text("Join with an invite").tag(1)
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()

                    if mode == 0 {
                        Field("Company name") {
                            TextField("Acme Robotics", text: $name).textFieldStyle(MeldFieldStyle())
                        }
                        Field("Ticket prefix", hint: "Tickets will be \(shownPrefix.isEmpty ? "ACME" : shownPrefix)-1, -2, …") {
                            TextField("ACME", text: Binding(get: { shownPrefix }, set: {
                                prefixEdited = true
                                prefix = String($0.uppercased().filter { $0.isLetter || $0.isNumber }.prefix(5))
                            }))
                            .textFieldStyle(MeldFieldStyle())
                            .font(.system(size: 13).monospaced())
                        }
                        Field("Accent color") {
                            HStack(spacing: 10) {
                                ForEach(Accent.allCases) { a in
                                    Button { model.accent = a } label: {
                                        Circle().fill(a.color)
                                            .frame(width: 24, height: 24)
                                            .overlay(Circle().stroke(Palette.background, lineWidth: 2).padding(2).opacity(model.accent == a ? 1 : 0))
                                            .overlay(Circle().stroke(a.color, lineWidth: 2).padding(-2).opacity(model.accent == a ? 1 : 0))
                                    }
                                    .buttonStyle(.plain)
                                    .help(a.label)
                                    .accessibilityLabel(a.label)
                                }
                                Spacer()
                                Text(model.accent.label).font(.meldMeta).foregroundStyle(Palette.muted)
                            }
                        }
                        Button(busy ? "Creating…" : "Create workspace") { create() }
                            .buttonStyle(MeldPrimaryButtonStyle())
                            .disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
                            .keyboardShortcut(.defaultAction)
                    } else {
                        Field("Invite link", hint: "Ask a teammate for one from People → Invite.") {
                            TextField("https://meld-fawn.vercel.app/join/…", text: $invite).textFieldStyle(MeldFieldStyle())
                        }
                        Button(busy ? "Joining…" : "Join workspace") { join() }
                            .buttonStyle(MeldPrimaryButtonStyle())
                            .disabled(busy || Self.inviteToken(invite) == nil)
                            .keyboardShortcut(.defaultAction)
                    }
                    if busy { WorkingBar() }
                    if let error { ErrorNote(message: error) }
                }
                if mode == 0 {
                    AccentPreview(name: name.isEmpty ? "Acme Robotics" : name, prefix: shownPrefix.isEmpty ? "ACME" : shownPrefix)
                        .transition(.opacity)
                }
            }
            .animation(.spring(duration: 0.3), value: mode)
            Spacer(minLength: 0)
        }
    }

    private func create() {
        busy = true; error = nil
        Task {
            do {
                try await model.api.send("createWorkspace", [["name": name, "ticketPrefix": shownPrefix, "teams": ["Engineering", "Design", "Product"]]])
                model.markAccentChosen()
                await model.workspaceReady()
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }

    private func join() {
        guard let token = Self.inviteToken(invite) else { return }
        busy = true; error = nil
        Task {
            do {
                try await model.api.send("acceptInvite", [token])
                await model.workspaceReady()
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }

    /// "…/join/<token>" or just the token.
    static func inviteToken(_ s: String) -> String? {
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return nil }
        if let r = t.range(of: "/join/") {
            return String(t[r.upperBound...].prefix { $0 != "?" && $0 != "/" && $0 != "#" })
        }
        return t.contains("/") ? nil : t
    }

    /// "Acme Robotics" → "AR"; "Northwind" → "NOR" (same as the web).
    static func prefixFor(_ name: String) -> String {
        let words = name.split(whereSeparator: \.isWhitespace)
        let p = words.count > 1 ? words.compactMap(\.first).map(String.init).joined() : String(words.first?.prefix(3) ?? "")
        return String(p.uppercased().filter { $0.isLetter || $0.isNumber }.prefix(5))
    }
}

/// Live preview of the chosen accent: a sliver of sidebar and a message with a mention.
private struct AccentPreview: View {
    @Environment(AppModel.self) private var model
    let name: String
    let prefix: String

    var body: some View {
        let accent = model.accent.color
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Text(String(name.prefix(1)).uppercased())
                    .font(.system(size: 11, weight: .semibold)).foregroundStyle(.white)
                    .frame(width: 20, height: 20).background(accent, in: .rect(cornerRadius: 4))
                Text(name).font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.ink).lineLimit(1)
            }
            .padding(12)
            Divider()
            VStack(alignment: .leading, spacing: 2) {
                row("number", "general", selected: true, accent: accent)
                row("number", "design", selected: false, accent: accent)
            }
            .padding(8)
            Divider()
            HStack(alignment: .top, spacing: 10) {
                AgentFace(name: "Atlas", size: 28)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text("Atlas").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.ink)
                        AgentTag()
                    }
                    Text("Filed \(Text("\(prefix)-1").foregroundStyle(Palette.link)) for you.")
                        .foregroundStyle(Palette.ink)
                        .font(.system(size: 13))
                }
            }
            .padding(12)
            HStack {
                Spacer()
                Text("Confirm").font(.system(size: 12, weight: .semibold)).foregroundStyle(.white)
                    .padding(.horizontal, 10).frame(height: 26).background(accent, in: .rect(cornerRadius: 6))
            }
            .padding([.horizontal, .bottom], 12)
        }
        .frame(width: 240)
        .background(Palette.card, in: .rect(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Palette.border, lineWidth: 1))
        .shadow(color: .black.opacity(0.08), radius: 8, y: 2)
        .animation(.easeOut(duration: 0.2), value: model.accent)
        .accessibilityLabel("Preview of the \(model.accent.label) accent")
    }

    private func row(_ icon: String, _ label: String, selected: Bool, accent: Color) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon).font(.system(size: 11)).foregroundStyle(selected ? accent : Palette.muted)
            Text(label).font(.system(size: 13, weight: selected ? .semibold : .regular)).foregroundStyle(selected ? accent : Palette.ink2)
            Spacer()
        }
        .padding(.horizontal, 8).frame(height: 26)
        .background(selected ? accent.opacity(0.1) : .clear, in: .rect(cornerRadius: 6))
    }
}

struct Field<Content: View>: View {
    let label: String
    var hint: String?
    @ViewBuilder var content: Content

    init(_ label: String, hint: String? = nil, @ViewBuilder content: () -> Content) {
        self.label = label; self.hint = hint; self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.system(size: 12, weight: .medium)).foregroundStyle(Palette.ink2)
            content
            if let hint { Text(hint).font(.meldCaption).foregroundStyle(Palette.muted) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Inputs: 36pt tall, input border, 6pt radius, accent focus ring.
struct MeldFieldStyle: TextFieldStyle {
    @FocusState private var focused: Bool

    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .textFieldStyle(.plain)
            .font(.system(size: 13))
            .focused($focused)
            .padding(.horizontal, 10)
            .frame(height: 36)
            .background(Palette.background, in: .rect(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(focused ? AnyShapeStyle(.tint) : AnyShapeStyle(Palette.input), lineWidth: focused ? 2 : 1))
    }
}

// MARK: - 4. Meet your team

struct TeamStep: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let agents = Array((model.workspace?.directory.agentList ?? []).prefix(4))
        VStack(spacing: 24) {
            Spacer(minLength: 0)
            StepHeader(title: "Meet your team",
                       subtitle: agents.count > 1
                        ? "These agents work in your channels next to everyone else. Every change they make shows what changed, with Undo."
                        : "Atlas works in your channels next to everyone else. Every change it makes shows what changed, with Undo. Add more agents from People.")
            HStack(spacing: 14) {
                ForEach(Array(agents.enumerated()), id: \.element.id) { i, a in
                    AgentCard(agent: a, person: model.workspace?.directory.people[a.id],
                              tint: namedAgents.first { $0.name == a.name }?.tint ?? namedAgents[i % 4].tint)
                        .arrive()
                }
            }
            Button("Continue") { model.go(.setup(.notifications)) }
                .buttonStyle(MeldPrimaryButtonStyle(height: 40))
                .frame(width: 240)
                .keyboardShortcut(.defaultAction)
            Spacer(minLength: 0)
        }
    }
}

private struct AgentCard: View {
    let agent: AgentInfo
    let person: Person?
    let tint: Color

    var body: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle().fill(tint.opacity(0.16))
                Avatar(person: person, size: 56)
            }
            .frame(width: 72, height: 72)
            VStack(spacing: 4) {
                HStack(spacing: 6) {
                    Text(agent.name).font(.meldName).foregroundStyle(Palette.ink)
                    AgentTag()
                }
                Text("@\(agent.handle)").font(.meldCaption).foregroundStyle(Palette.muted)
            }
            Text(agent.description)
                .font(.meldMeta)
                .foregroundStyle(Palette.ink2)
                .multilineTextAlignment(.center)
                .lineLimit(5)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(width: 188, height: 250)
        .background(Palette.card, in: .rect(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Palette.border, lineWidth: 1))
    }
}

// MARK: - 5. Notifications

struct NotificationsStep: View {
    @Environment(AppModel.self) private var model
    @State private var status: Notifications.Status?
    @State private var asking = false

    var body: some View {
        VStack(spacing: 24) {
            Spacer(minLength: 0)
            ZStack {
                Circle().fill(.tint.opacity(0.12)).frame(width: 88, height: 88)
                Image(systemName: status == .on ? "bell.badge.fill" : status == .off ? "bell.slash" : "bell.badge")
                    .font(.system(size: 34, weight: .regular))
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(.tint)
                    .contentTransition(.symbolEffect(.replace))
            }
            StepHeader(title: title, subtitle: subtitle)
            VStack(spacing: 10) {
                switch status {
                case .on:
                    Label("Notifications are on", systemImage: "checkmark.circle.fill")
                        .font(.meldMeta).foregroundStyle(Palette.success)
                    Button("Open Meld") { model.finishOnboarding() }
                        .buttonStyle(MeldPrimaryButtonStyle(height: 40))
                        .keyboardShortcut(.defaultAction)
                case .off:
                    Button("Open System Settings") { Notifications.openSettings() }
                        .buttonStyle(MeldPrimaryButtonStyle(height: 40))
                        .keyboardShortcut(.defaultAction)
                    Button("Not now") { model.finishOnboarding() }
                        .buttonStyle(MeldSecondaryButtonStyle(height: 40))
                default:
                    Button(asking ? "Waiting for your answer…" : "Turn on notifications") { ask() }
                        .buttonStyle(MeldPrimaryButtonStyle(height: 40))
                        .keyboardShortcut(.defaultAction)
                        .disabled(asking || status == nil)
                    Button("Not now") { model.finishOnboarding() }
                        .buttonStyle(MeldSecondaryButtonStyle(height: 40))
                }
            }
            .frame(width: 260)
            Spacer(minLength: 0)
        }
        .animation(.spring(duration: 0.3), value: status)
        .task { status = await Notifications.status() }
        // Back from System Settings: pick up the change.
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            Task { status = await Notifications.status() }
        }
    }

    private var title: String {
        switch status {
        case .on: "You're all set"
        case .off: "Notifications are off for Meld"
        default: "Know when something needs you"
        }
    }

    private var subtitle: String {
        switch status {
        case .off: "macOS only asks once. Turn on Allow notifications for Meld in System Settings, then come back here."
        default: "Agents tell you when something needs you: a DM, an @mention, or a change waiting for your Confirm. Nothing else."
        }
    }

    private func ask() {
        asking = true
        Task {
            status = await Notifications.request()
            asking = false
        }
    }
}
