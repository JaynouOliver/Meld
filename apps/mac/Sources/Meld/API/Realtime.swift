import Foundation

/// What changed, from the server's realtime ping (src/server/realtime.ts ChangePing).
struct ChangePing: Decodable, Sendable {
    let chats: [ChatId]
    let tickets: Bool
    let runs: Bool?
    let directory: Bool?
    let quiet: Bool?
    let origin: String?
    let message: LiveMessage?

    struct LiveMessage: Decodable, Sendable {
        let chatId: ChatId
        let threadId: String?
    }
}

/// Live progress of an agent run (step label), from the "run" broadcast.
struct RunProgress: Decodable, Sendable {
    let runId: String
    let chatId: ChatId
    let step: String?
}

/// Supabase Realtime broadcast over its Phoenix websocket protocol: one topic per
/// workspace, `meld-ws-<id>` (see src/hooks/use-realtime-sync.ts). Reconnects with backoff.
@MainActor
final class Realtime {
    var onChange: ((ChangePing) -> Void)?
    var onRun: ((RunProgress) -> Void)?

    private var task: URLSessionWebSocketTask?
    private var topic = ""
    private var ref = 0
    private var heartbeat: Task<Void, Never>?
    private var attempts = 0
    private var stopped = true

    func connect(workspaceId: String) {
        topic = "realtime:meld-ws-\(workspaceId)"
        stopped = false
        open()
    }

    func disconnect() {
        stopped = true
        heartbeat?.cancel()
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
    }

    private func open() {
        var c = URLComponents(url: Config.supabaseURL.appending(path: "realtime/v1/websocket"), resolvingAgainstBaseURL: false)!
        c.scheme = "wss"
        c.queryItems = [.init(name: "apikey", value: Config.supabaseKey), .init(name: "vsn", value: "1.0.0")]
        let t = URLSession.shared.webSocketTask(with: c.url!)
        task = t
        t.resume()
        send(topic: topic, event: "phx_join", payload: ["config": ["broadcast": ["self": false], "presence": ["key": ""], "private": false]])
        heartbeat?.cancel()
        heartbeat = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(25))
                self?.send(topic: "phoenix", event: "heartbeat", payload: [:])
            }
        }
        receive(on: t)
    }

    private func receive(on t: URLSessionWebSocketTask) {
        t.receive { [weak self] result in
            Task { @MainActor in
                guard let self, t === self.task else { return }
                switch result {
                case .success(let message):
                    self.attempts = 0
                    if case .string(let text) = message { self.handle(text) }
                    self.receive(on: t)
                case .failure:
                    self.reconnect()
                }
            }
        }
    }

    private func reconnect() {
        heartbeat?.cancel()
        task = nil
        guard !stopped else { return }
        attempts += 1
        let delay = min(30.0, pow(2, Double(min(attempts, 5))))
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard let self, !self.stopped, self.task == nil else { return }
            self.open()
        }
    }

    private func handle(_ text: String) {
        struct Frame: Decodable { let event: String; let payload: Broadcast? }
        struct Broadcast: Decodable { let event: String?; let payload: AnyPayload? }
        guard let data = text.data(using: .utf8),
              let frame = try? JSONDecoder().decode(Frame.self, from: data), frame.event == "broadcast",
              let inner = frame.payload, let body = inner.payload?.data else { return }
        switch inner.event {
        case "changed": if let p = try? JSONDecoder().decode(ChangePing.self, from: body) { onChange?(p) }
        case "run": if let p = try? JSONDecoder().decode(RunProgress.self, from: body) { onRun?(p) }
        default: break
        }
    }

    private func send(topic: String, event: String, payload: [String: Any]) {
        ref += 1
        let frame: [String: Any] = ["topic": topic, "event": event, "payload": payload, "ref": String(ref)]
        guard let data = try? JSONSerialization.data(withJSONObject: frame), let s = String(data: data, encoding: .utf8) else { return }
        task?.send(.string(s)) { _ in }
    }
}

/// Keeps a nested JSON object as raw bytes so it can be decoded into a concrete type later.
private struct AnyPayload: Decodable {
    let data: Data
    init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer().decode(JSONAny.self)
        data = try JSONSerialization.data(withJSONObject: value.value)
    }
}

private struct JSONAny: Decodable {
    let value: Any
    init(from decoder: Decoder) throws {
        if var a = try? decoder.unkeyedContainer() {
            var out: [Any] = []
            while !a.isAtEnd { out.append((try a.decode(JSONAny.self)).value) }
            value = out
        } else if let o = try? decoder.container(keyedBy: AnyKey.self) {
            var out: [String: Any] = [:]
            for k in o.allKeys { out[k.stringValue] = (try o.decode(JSONAny.self, forKey: k)).value }
            value = out
        } else {
            let c = try decoder.singleValueContainer()
            if c.decodeNil() { value = NSNull() }
            else if let b = try? c.decode(Bool.self) { value = b }
            else if let n = try? c.decode(Double.self) { value = n }
            else { value = try c.decode(String.self) }
        }
    }
}

private struct AnyKey: CodingKey {
    var stringValue: String
    var intValue: Int? { nil }
    init(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { nil }
}
