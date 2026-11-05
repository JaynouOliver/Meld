import SwiftUI

@main
struct MeldApp: App {
    @Local private var model = AppModel()

    var body: some Scene {
        // A single window (not WindowGroup) so the meld:// callback lands in the
        // existing window instead of opening a new one.
        Window("Meld", id: "main") {
            RootView()
                .environment(model)
                .onOpenURL { model.handle(url: $0) }
                .frame(minWidth: 900, minHeight: 600)
        }
        .windowStyle(.hiddenTitleBar)
        .windowToolbarStyle(.unified)
        .defaultSize(width: 1280, height: 820)
        .commands {
            CommandGroup(replacing: .newItem) {}
            CommandMenu("Account") {
                Button("Sign Out") { model.signOut() }
                    .disabled(model.session == nil)
            }
        }
    }
}
