import SwiftUI

/// First-run welcome: three colorful pages that say what Meld is, then "Get started".
struct WelcomeView: View {
    @Environment(AppModel.self) private var model
    @Local private var page = 0
    @Local private var appeared = false

    private struct Page {
        let symbol: String
        let eyebrow: String
        let title: String
        let body: String
        let palette: [Color]
        let chips: [(String, String)]
    }

    private let pages: [Page] = [
        Page(symbol: "bubble.left.and.text.bubble.right.fill",
             eyebrow: "Welcome to Meld",
             title: "Where your team talks,\nand work gets done.",
             body: "Channels, DMs and threads sit right next to your tickets. No more copying a conversation into a tracker.",
             palette: [.meldBlue, .meldIndigo, Color(red: 0.36, green: 0.62, blue: 1), .meldViolet, .meldBlue, .meldTeal, .meldIndigo, .meldBlue, .meldViolet],
             chips: [("number", "Channels"), ("bubble.left.and.bubble.right", "Threads"), ("ticket", "Tickets")]),
        Page(symbol: "sparkles",
             eyebrow: "Meet Atlas",
             title: "An agent that files\nyour tickets for you.",
             body: "Tag @Atlas anywhere. It creates, updates and closes tickets from chat, with exactly the permissions of the person asking.",
             palette: [.meldViolet, .meldPink, .meldIndigo, .meldPink, .meldViolet, .meldAmber, .meldIndigo, .meldViolet, .meldPink],
             chips: [("at", "@Atlas"), ("checkmark.seal", "Same permissions"), ("bolt", "Instant")]),
        Page(symbol: "lock.shield.fill",
             eyebrow: "Built for teams",
             title: "Private by default.\nYours on every Mac.",
             body: "Sign in once with Google or GitHub. Your session stays in your Mac's Keychain, and your workspace is ready when you are.",
             palette: [.meldTeal, .meldBlue, Color(red: 0.2, green: 0.8, blue: 0.6), .meldBlue, .meldTeal, .meldIndigo, .meldTeal, .meldBlue, .meldTeal],
             chips: [("key", "Keychain"), ("person.2", "Roles"), ("laptopcomputer", "Native Mac")]),
    ]

    var body: some View {
        let p = pages[page]
        ZStack {
            AuroraBackground(palette: p.palette)
            // Soft vignette so white text always reads.
            LinearGradient(colors: [.black.opacity(0.0), .black.opacity(0.25)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()

            VStack(spacing: 0) {
                HStack {
                    HStack(spacing: 10) {
                        MeldAppIcon(size: 30)
                        Text("Meld").font(.title3.weight(.semibold))
                    }
                    Spacer()
                    Button("Skip") { model.finishWelcome() }
                        .buttonStyle(.glass)
                        .foregroundStyle(.white)
                        .opacity(page < pages.count - 1 ? 1 : 0)
                }
                .padding(.horizontal, 32)
                .padding(.top, 36)

                Spacer()

                VStack(spacing: 22) {
                    Image(systemName: p.symbol)
                        .font(.system(size: 56, weight: .semibold))
                        .symbolRenderingMode(.hierarchical)
                        .symbolEffect(.bounce, value: page)
                        .frame(width: 112, height: 112)
                        .glassEffect(.regular, in: .rect(cornerRadius: 30))
                        .contentTransition(.symbolEffect(.replace))

                    Text(p.eyebrow.uppercased())
                        .font(.caption.weight(.bold))
                        .tracking(1.6)
                        .opacity(0.85)

                    Text(p.title)
                        .font(.system(size: 44, weight: .bold, design: .rounded))
                        .multilineTextAlignment(.center)
                        .lineSpacing(2)
                        .contentTransition(.opacity)

                    Text(p.body)
                        .font(.title3)
                        .multilineTextAlignment(.center)
                        .opacity(0.9)
                        .frame(maxWidth: 560)

                    GlassEffectContainer(spacing: 10) {
                        HStack(spacing: 10) {
                            ForEach(p.chips, id: \.1) { chip in
                                GlassChip(systemImage: chip.0, text: chip.1)
                            }
                        }
                    }
                    .padding(.top, 6)
                }
                .foregroundStyle(.white)
                .id(page)
                .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity),
                                        removal: .move(edge: .leading).combined(with: .opacity)))
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 24)

                Spacer()

                HStack(spacing: 20) {
                    Button {
                        withAnimation(.smooth(duration: 0.5)) { page -= 1 }
                    } label: {
                        Image(systemName: "chevron.left").frame(width: 20, height: 20)
                    }
                    .buttonStyle(.glass)
                    .controlSize(.large)
                    .opacity(page > 0 ? 1 : 0)
                    .disabled(page == 0)

                    PageDots(count: pages.count, current: page)

                    Button {
                        if page < pages.count - 1 {
                            withAnimation(.smooth(duration: 0.5)) { page += 1 }
                        } else {
                            model.finishWelcome()
                        }
                    } label: {
                        HStack(spacing: 8) {
                            Text(page < pages.count - 1 ? "Continue" : "Get started")
                            Image(systemName: "arrow.right")
                        }
                        .font(.headline)
                        .foregroundStyle(Color.meldBlue)
                        .padding(.horizontal, 26)
                        .frame(height: 44)
                        .background(.white, in: .capsule)
                        .shadow(color: .black.opacity(0.18), radius: 12, y: 6)
                        .contentShape(.capsule)
                    }
                    .buttonStyle(.plain)
                    .keyboardShortcut(.defaultAction)
                }
                .padding(.bottom, 44)
            }
        }
        .onAppear {
            withAnimation(.smooth(duration: 0.9).delay(0.1)) { appeared = true }
        }
    }
}

private struct PageDots: View {
    let count: Int
    let current: Int

    var body: some View {
        HStack(spacing: 8) {
            ForEach(0..<count, id: \.self) { i in
                Capsule()
                    .fill(.white.opacity(i == current ? 1 : 0.4))
                    .frame(width: i == current ? 26 : 8, height: 8)
            }
        }
        .animation(.spring(duration: 0.4, bounce: 0.3), value: current)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .glassEffect(.regular, in: .capsule)
    }
}
