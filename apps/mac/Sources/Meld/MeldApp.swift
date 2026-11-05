import SwiftUI
import UserNotifications

@main
struct MeldApp: App {
    @NSApplicationDelegateAdaptor private var appDelegate: AppDelegate
    @State private var model = AppModel()
    @FocusedValue(\.meldActions) private var actions

    var body: some Scene {
        // A single window (not WindowGroup) so the meld:// callback lands in the
        // existing window instead of opening a new one.
        Window("Meld", id: "main") {
            RootView()
                .environment(model)
                .tint(model.accent.color)
                .environment(\.meldAccent, model.accent.color)
                .onOpenURL { model.handle(url: $0) }
                .frame(minWidth: 900, minHeight: 600)
                .onAppear { appDelegate.model = model }
        }
        .windowStyle(.hiddenTitleBar)
        .windowToolbarStyle(.unified)
        .defaultSize(Self.launchSize)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("New Message") { actions?.newMessage() }
                    .keyboardShortcut("n")
                    .disabled(actions == nil)
            }
            CommandGroup(after: .textEditing) {
                Button("Search") { actions?.search() }
                    .keyboardShortcut("k")
                    .disabled(actions == nil)
            }
            CommandMenu("Go") {
                ForEach(0..<9, id: \.self) { i in
                    Button(Self.goTitle(i)) { actions?.go(i) }
                        .keyboardShortcut(KeyEquivalent(Character("\(i + 1)")))
                        .disabled(actions == nil)
                }
            }
            CommandMenu("Account") {
                Button("Sign Out") { model.signOut() }
                    .disabled(model.session == nil)
            }
        }
    }

    /// MELD_WINDOW_SIZE=900x600 opens at that size (for screenshots); default 1280×820.
    private static var launchSize: CGSize {
        let parts = (ProcessInfo.processInfo.environment["MELD_WINDOW_SIZE"] ?? "").split(separator: "x").compactMap { Double($0) }
        return parts.count == 2 ? CGSize(width: parts[0], height: parts[1]) : CGSize(width: 1280, height: 820)
    }

    private static func goTitle(_ i: Int) -> String {
        ["Home", "Missions", "Decisions", "People", "Playbooks", "Tickets"].indices.contains(i)
            ? ["Home", "Missions", "Decisions", "People", "Playbooks", "Tickets"][i]
            : "Channel \(i - 5)"
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            switch model.phase {
            case .launching:
                LaunchView()
            case .main:
                if let store = model.workspace {
                    MainView(store: store).transition(.opacity)
                }
            default:
                OnboardingView().transition(.opacity)
            }
        }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.25), value: model.phase == .main)
    }
}

/// While the saved session and workspace load: the mark on the canvas, nothing more.
private struct LaunchView: View {
    var body: some View {
        ZStack {
            Palette.canvas.ignoresSafeArea()
            VStack(spacing: 16) {
                MeldMark().fill(Color.meldBlue).frame(width: 44, height: 44)
                WorkingBar().frame(width: 120)
            }
        }
    }
}

/// Opens the chat a notification is about, and shows banners while Meld is open.
final class AppDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
    @MainActor static weak var current: AppModel?
    @MainActor var model: AppModel? {
        get { Self.current }
        set { Self.current = newValue }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        UNUserNotificationCenter.current().delegate = self
        // For screenshots and testing: MELD_APPEARANCE=dark|light overrides the system look.
        switch ProcessInfo.processInfo.environment["MELD_APPEARANCE"] {
        case "dark": NSApp.appearance = NSAppearance(named: .darkAqua)
        case "light": NSApp.appearance = NSAppearance(named: .aqua)
        default: break
        }
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let chat = response.notification.request.content.userInfo["chat"] as? String
        await Self.open(chat: chat)
    }

    @MainActor private static func open(chat: String?) {
        if let chat { current?.workspace?.screen = .chat(chat) }
        NSApp.activate()
    }
}
