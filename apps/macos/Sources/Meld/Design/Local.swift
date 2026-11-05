import Combine
import SwiftUI

/// View-local state, like `@State`.
///
/// Why not `@State`: in the macOS 27 SDK `@State` is a macro whose plugin ships only with
/// Xcode, so it doesn't build with the Command Line Tools alone. This wrapper keeps the
/// app buildable with plain `swift build`. If the project moves to Xcode, swap back freely.
@MainActor
@propertyWrapper
struct Local<Value>: DynamicProperty {
    @StateObject private var box: Box

    init(wrappedValue: @autoclosure @escaping () -> Value) {
        _box = StateObject(wrappedValue: Box(wrappedValue()))
    }

    var wrappedValue: Value {
        get { box.value }
        nonmutating set { box.value = newValue }
    }

    var projectedValue: Binding<Value> {
        Binding(get: { box.value }, set: { box.value = $0 })
    }

    final class Box: ObservableObject {
        @Published var value: Value
        init(_ value: Value) { self.value = value }
    }
}
