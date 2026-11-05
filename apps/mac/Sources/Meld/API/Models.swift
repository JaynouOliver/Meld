import Foundation

// Mirrors src/lib/types.ts and src/lib/directory.ts. Optional where the server may omit.

typealias PersonId = String
typealias ChatId = String

enum Role: String, Codable, Sendable { case owner, member, guest }

enum TicketStatus: String, Codable, CaseIterable, Sendable {
    case todo = "To do", inProgress = "In progress", inReview = "In review", done = "Done", backburner = "Backburner"
}

enum Priority: String, Codable, Sendable { case low = "Low", medium = "Medium", high = "High" }

struct Person: Codable, Identifiable, Hashable, Sendable {
    let id: PersonId
    let name: String
    let first: String
    let initials: String
    let color: String
    let team: String?
    let isAgent: Bool?
    let avatarUrl: String?
    let title: String?

    var agent: Bool { isAgent == true || id == "atlas" }
}

struct Team: Codable, Hashable, Sendable { let id: String; let name: String }

struct WorkspaceInfo: Codable, Hashable, Sendable {
    let id: String
    let name: String
    let slug: String
    let ticketPrefix: String
    let repo: String?
}

struct Membership: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let name: String
    let role: Role
}

struct AgentInfo: Codable, Hashable, Identifiable, Sendable {
    let id: PersonId
    let handle: String
    let name: String
    let description: String
    let kind: String
}

enum ChatMeta: Codable, Hashable, Identifiable, Sendable {
    case channel(id: ChatId, label: String, topic: String, members: [PersonId])
    case dm(id: ChatId, who: PersonId, topic: String)

    var id: ChatId {
        switch self {
        case .channel(let id, _, _, _), .dm(let id, _, _): id
        }
    }

    var topic: String {
        switch self {
        case .channel(_, _, let t, _), .dm(_, _, let t): t
        }
    }

    private enum Keys: String, CodingKey { case id, kind, label, topic, members, who }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        let id = try c.decode(String.self, forKey: .id)
        let topic = (try? c.decode(String.self, forKey: .topic)) ?? ""
        if try c.decode(String.self, forKey: .kind) == "dm" {
            self = .dm(id: id, who: try c.decode(String.self, forKey: .who), topic: topic)
        } else {
            self = .channel(id: id, label: try c.decode(String.self, forKey: .label), topic: topic,
                            members: (try? c.decode([String].self, forKey: .members)) ?? [])
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        switch self {
        case .channel(let id, let label, let topic, let members):
            try c.encode(id, forKey: .id); try c.encode("channel", forKey: .kind)
            try c.encode(label, forKey: .label); try c.encode(topic, forKey: .topic); try c.encode(members, forKey: .members)
        case .dm(let id, let who, let topic):
            try c.encode(id, forKey: .id); try c.encode("dm", forKey: .kind)
            try c.encode(who, forKey: .who); try c.encode(topic, forKey: .topic)
        }
    }
}

struct Directory: Codable, Sendable {
    let workspace: WorkspaceInfo
    let me: PersonId
    let role: Role
    let people: [PersonId: Person]
    let personOrder: [PersonId]
    let teams: [Team]
    let chats: [ChatId: ChatMeta]
    let channels: [ChatId]
    let dms: [ChatId]
    let home: ChatId
    let memberships: [Membership]
    let demo: Bool
    let agents: [AgentInfo]?

    var agentList: [AgentInfo] {
        agents ?? [AgentInfo(id: "atlas", handle: "atlas", name: "Atlas", description: "Files, updates and finds tickets.", kind: "builtin")]
    }

    func person(_ id: PersonId) -> Person? { people[id] }

    /// "# design" for channels, the other person's name for DMs.
    func title(of chat: ChatId) -> String {
        switch chats[chat] {
        case .channel(_, let label, _, _): label
        case .dm(_, let who, _): people[who]?.name ?? "Direct message"
        case nil: ""
        }
    }
}

struct ActionView: Codable, Hashable, Sendable {
    let id: String
    let status: String // pending | applied | canceled | undone
    let summary: [String]
    let destructive: Bool
    let undoUntil: String?

    var canUndo: Bool {
        guard status == "applied", let until = undoUntil, let date = ISO8601.parse(until) else { return false }
        return date > .now
    }
}

struct Reply: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let who: PersonId
    let time: String
    let text: String
    let ticket: String?
    let action: ActionView?
    let reactions: [String: [PersonId]]?
    let editedAt: String?
    let deletedAt: String?
}

struct Message: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let who: PersonId
    let time: String
    let text: String
    let ticket: String?
    let action: ActionView?
    let reactions: [String: [PersonId]]?
    let editedAt: String?
    let deletedAt: String?
    let pinnedAt: String?
    let replies: [Reply]

    private enum Keys: String, CodingKey { case id, who, time, text, ticket, action, reactions, editedAt, deletedAt, pinnedAt, replies }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        id = try c.decode(String.self, forKey: .id)
        who = try c.decode(String.self, forKey: .who)
        time = try c.decode(String.self, forKey: .time)
        text = try c.decode(String.self, forKey: .text)
        ticket = try? c.decodeIfPresent(String.self, forKey: .ticket)
        action = try? c.decodeIfPresent(ActionView.self, forKey: .action)
        reactions = try? c.decodeIfPresent([String: [PersonId]].self, forKey: .reactions)
        editedAt = try? c.decodeIfPresent(String.self, forKey: .editedAt)
        deletedAt = try? c.decodeIfPresent(String.self, forKey: .deletedAt)
        pinnedAt = try? c.decodeIfPresent(String.self, forKey: .pinnedAt)
        replies = (try? c.decodeIfPresent([Reply].self, forKey: .replies)) ?? []
    }
}

struct Ticket: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    let status: TicketStatus
    let priority: Priority
    let assignee: PersonId
}

struct MessageHit: Codable, Hashable, Identifiable, Sendable {
    let chatId: ChatId
    let id: String
    let threadId: String?
    let who: PersonId
    let time: String
    let text: String
}

struct RunView: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let agentId: PersonId?
    let chatId: ChatId
    let threadId: String?
    let status: String // queued | running | done | failed
    let step: String?
    let note: String?

    var isActive: Bool { status == "queued" || status == "running" }
}

struct Boot: Decodable, Sendable {
    let directory: Directory?
    let tickets: [Ticket]?
    let messages: [ChatId: [Message]]?
}

enum ISO8601 {
    nonisolated(unsafe) private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    nonisolated(unsafe) private static let plain = ISO8601DateFormatter()

    static func parse(_ s: String) -> Date? { withFraction.date(from: s) ?? plain.date(from: s) }

    /// Matches displayTime() on the web: ISO times become a clock time; anything else
    /// (the demo's "10:12 AM") is shown as stored.
    static func display(_ s: String) -> String {
        guard let d = parse(s) else { return s }
        return d.formatted(date: Calendar.current.isDateInToday(d) ? .omitted : .abbreviated, time: .shortened)
    }
}
