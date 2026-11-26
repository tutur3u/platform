import Foundation

public enum WatchTaskPriority: String, Codable, CaseIterable, Sendable, Equatable {
  case critical
  case high
  case normal
  case low
  case none

  public init(rawAPIValue: String?) {
    switch rawAPIValue?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
    case "critical", "urgent":
      self = .critical
    case "high":
      self = .high
    case "normal", "medium":
      self = .normal
    case "low":
      self = .low
    default:
      self = .none
    }
  }

  /// Lower rank sorts first in priority lists.
  public var sortRank: Int {
    switch self {
    case .critical: return 0
    case .high: return 1
    case .normal: return 2
    case .low: return 3
    case .none: return 4
    }
  }

  /// Value accepted by `POST /api/v1/workspaces/{wsId}/tasks`, or `nil` for none.
  public var apiValue: String? {
    self == .none ? nil : rawValue
  }
}

public struct WatchTaskItem: Identifiable, Codable, Sendable, Equatable {
  public let id: String
  public let name: String
  public let priority: WatchTaskPriority
  public let endDate: Date?
  public let listId: String?
  public let boardId: String?
  public let workspaceId: String?
  public let isCompleted: Bool

  public init(
    id: String,
    name: String,
    priority: WatchTaskPriority = .none,
    endDate: Date? = nil,
    listId: String? = nil,
    boardId: String? = nil,
    workspaceId: String? = nil,
    isCompleted: Bool = false
  ) {
    self.id = id
    self.name = name
    self.priority = priority
    self.endDate = endDate
    self.listId = listId
    self.boardId = boardId
    self.workspaceId = workspaceId
    self.isCompleted = isCompleted
  }

  public func isOverdue(relativeTo now: Date, timeZone: TimeZone = .current) -> Bool {
    guard !isCompleted, let endDate else { return false }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    let startOfToday = calendar.startOfDay(for: now)
    let dueDay = calendar.startOfDay(for: endDate)
    return dueDay < startOfToday
  }

  public func markingCompleted(_ completed: Bool) -> WatchTaskItem {
    WatchTaskItem(
      id: id,
      name: name,
      priority: priority,
      endDate: endDate,
      listId: listId,
      boardId: boardId,
      workspaceId: workspaceId,
      isCompleted: completed
    )
  }
}

public struct WatchCalendarEvent: Identifiable, Codable, Sendable, Equatable {
  public let id: String
  public let title: String
  public let location: String?
  public let startAt: Date
  public let endAt: Date
  public let color: String?
  public let isAllDay: Bool

  public init(
    id: String,
    title: String,
    location: String? = nil,
    startAt: Date,
    endAt: Date,
    color: String? = nil,
    isAllDay: Bool = false
  ) {
    self.id = id
    self.title = title
    self.location = location
    self.startAt = startAt
    self.endAt = endAt
    self.color = color
    self.isAllDay = isAllDay
  }

  /// Matches the mobile client's all-day duration inference (positive multiple of 24h).
  public static func inferAllDay(startAt: Date, endAt: Date) -> Bool {
    let durationSeconds = Int(round(endAt.timeIntervalSince(startAt)))
    let daySeconds = 24 * 60 * 60
    return durationSeconds > 0 && durationSeconds % daySeconds == 0
  }

  /// Filters out Google or first-party working-location markers.
  public static func isWorkingLocation(
    title: String?,
    isAllDay: Bool,
    googleEventType: String?
  ) -> Bool {
    if googleEventType == "workingLocation" {
      return true
    }
    guard isAllDay else { return false }
    switch title?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
    case "home", "office", "work":
      return true
    default:
      return false
    }
  }
}

public struct WatchTodaySnapshot: Codable, Sendable, Equatable {
  public let workspaceId: String
  public let workspaceName: String
  public let isPersonal: Bool
  public let syncedAt: Date
  public let events: [WatchCalendarEvent]
  public let tasks: [WatchTaskItem]

  public init(
    workspaceId: String,
    workspaceName: String,
    isPersonal: Bool,
    syncedAt: Date,
    events: [WatchCalendarEvent],
    tasks: [WatchTaskItem]
  ) {
    self.workspaceId = workspaceId
    self.workspaceName = workspaceName
    self.isPersonal = isPersonal
    self.syncedAt = syncedAt
    self.events = events
    self.tasks = tasks
  }

  public var remainingTasksCount: Int {
    tasks.filter { !$0.isCompleted }.count
  }

  public func prioritizedTasks(now: Date, timeZone: TimeZone = .current) -> [WatchTaskItem] {
    tasks
      .filter { !$0.isCompleted }
      .sorted { lhs, rhs in
        let lhsOverdue = lhs.isOverdue(relativeTo: now, timeZone: timeZone)
        let rhsOverdue = rhs.isOverdue(relativeTo: now, timeZone: timeZone)
        if lhsOverdue != rhsOverdue {
          return lhsOverdue && !rhsOverdue
        }
        if lhs.priority.sortRank != rhs.priority.sortRank {
          return lhs.priority.sortRank < rhs.priority.sortRank
        }
        switch (lhs.endDate, rhs.endDate) {
        case let (l?, r?) where l != r:
          return l < r
        case (_?, nil):
          return true
        case (nil, _?):
          return false
        default:
          return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
        }
      }
  }

  public func upcomingEvents(after now: Date, limit: Int = 5) -> [WatchCalendarEvent] {
    let filtered = events
      .filter { $0.endAt > now }
      .sorted { lhs, rhs in
        if lhs.startAt != rhs.startAt {
          return lhs.startAt < rhs.startAt
        }
        return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
      }
    return Array(filtered.prefix(max(0, limit)))
  }

  public func nextEvent(after now: Date) -> WatchCalendarEvent? {
    let upcoming = upcomingEvents(after: now, limit: 20)
    return upcoming.first(where: { !$0.isAllDay }) ?? upcoming.first
  }

  public func topPriorityTask(now: Date, timeZone: TimeZone = .current) -> WatchTaskItem? {
    prioritizedTasks(now: now, timeZone: timeZone).first
  }
}

public struct WatchApiOrigins: Codable, Sendable, Equatable {
  public let platform: String
  public let tasks: String
  public let calendarBase: String

  public static let productionDefault = WatchApiOrigins(
    platform: "https://tuturuuu.com",
    tasks: "https://tasks.tuturuuu.com",
    calendarBase: "https://infrastructure.tuturuuu.com/api/v1/mobile-calendar"
  )

  public init(platform: String, tasks: String, calendarBase: String) {
    self.platform = Self.normalize(platform)
    self.tasks = Self.normalize(tasks)
    self.calendarBase = Self.normalize(calendarBase)
  }

  public var isValid: Bool {
    Self.isValidOrigin(platform) && Self.isValidOrigin(tasks) && Self.isValidOrigin(calendarBase)
  }

  private static func normalize(_ raw: String) -> String {
    var trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    while trimmed.hasSuffix("/") {
      trimmed.removeLast()
    }
    return trimmed
  }

  private static func isValidOrigin(_ value: String) -> Bool {
    guard let url = URL(string: value),
          let scheme = url.scheme?.lowercased(),
          let host = url.host,
          !host.isEmpty else {
      return false
    }
    if scheme == "https" {
      return true
    }
    return scheme == "http" && (host == "localhost" || host == "127.0.0.1")
  }
}

public struct WatchSessionMetadata: Codable, Sendable, Equatable {
  public let userId: String
  public let userFirstName: String?
  public let workspaceId: String
  public let workspaceName: String
  public let isPersonal: Bool
  public let defaultListId: String?
  public let apiOrigins: WatchApiOrigins
  public let locale: WatchLocale
  public let calmColors: Bool
  public let expiresAtEpochSeconds: Double?

  public init(
    userId: String,
    userFirstName: String? = nil,
    workspaceId: String,
    workspaceName: String,
    isPersonal: Bool,
    defaultListId: String? = nil,
    apiOrigins: WatchApiOrigins = .productionDefault,
    locale: WatchLocale = .en,
    calmColors: Bool = false,
    expiresAtEpochSeconds: Double? = nil
  ) {
    self.userId = userId
    self.userFirstName = userFirstName
    self.workspaceId = workspaceId
    self.workspaceName = workspaceName
    self.isPersonal = isPersonal
    self.defaultListId = defaultListId
    self.apiOrigins = apiOrigins
    self.locale = locale
    self.calmColors = calmColors
    self.expiresAtEpochSeconds = expiresAtEpochSeconds
  }

  public func isTokenExpired(now: Date, leewaySeconds: TimeInterval = 60) -> Bool {
    guard let raw = expiresAtEpochSeconds else { return false }
    let seconds = raw > 1_000_000_000_000 ? raw / 1000.0 : raw
    return now.timeIntervalSince1970 >= (seconds - leewaySeconds)
  }
}

/// Wire payload exchanged between the iPhone companion app and watchOS via WatchConnectivity.
public struct WatchSessionContext: Codable, Sendable, Equatable {
  public let signedOut: Bool
  public let accessToken: String?
  public let metadata: WatchSessionMetadata?
  public let snapshot: WatchTodaySnapshot?

  public init(
    signedOut: Bool,
    accessToken: String? = nil,
    metadata: WatchSessionMetadata? = nil,
    snapshot: WatchTodaySnapshot? = nil
  ) {
    self.signedOut = signedOut
    self.accessToken = accessToken
    self.metadata = metadata
    self.snapshot = snapshot
  }

  public static let signedOutPayload = WatchSessionContext(signedOut: true)

  private enum WireKey {
    static let version = "v"
    static let payload = "payload"
    static let currentVersion = 1
  }

  /// Encodes into a property-list-safe dictionary for `WCSession.updateApplicationContext`.
  public func toWatchConnectivityDictionary() throws -> [String: Any] {
    let encoder = WatchCoders.makeEncoder()
    let data = try encoder.encode(self)
    return [
      WireKey.version: WireKey.currentVersion,
      WireKey.payload: data,
    ]
  }

  public static func fromWatchConnectivityDictionary(_ dictionary: [String: Any]) throws -> WatchSessionContext {
    if let data = dictionary[WireKey.payload] as? Data {
      return try WatchCoders.makeDecoder().decode(WatchSessionContext.self, from: data)
    }
    if let jsonString = dictionary[WireKey.payload] as? String,
       let data = jsonString.data(using: .utf8) {
      return try WatchCoders.makeDecoder().decode(WatchSessionContext.self, from: data)
    }
    throw WatchCodingError.missingPayload
  }
}

public enum WatchCodingError: Error, Equatable {
  case missingPayload
}

public enum WatchCoders {
  public static func makeEncoder() -> JSONEncoder {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    return encoder
  }

  public static func makeDecoder() -> JSONDecoder {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .custom { decoder in
      let container = try decoder.singleValueContainer()
      let raw = try container.decode(String.self)
      if let date = WatchDateParser.parseISO8601(raw) {
        return date
      }
      throw DecodingError.dataCorruptedError(
        in: container,
        debugDescription: "Invalid ISO8601 date: \(raw)"
      )
    }
    return decoder
  }
}

public enum WatchDateParser {
  public static func parseISO8601(_ raw: String) -> Date? {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = fractional.date(from: trimmed) {
      return date
    }
    let plain = ISO8601DateFormatter()
    plain.formatOptions = [.withInternetDateTime]
    return plain.date(from: trimmed)
  }

  public static func formatISO8601(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    return formatter.string(from: date)
  }
}
