import Foundation

public struct WatchHTTPResponse: Sendable {
  public let statusCode: Int
  public let headers: [String: String]
  public let body: Data

  public init(statusCode: Int, headers: [String: String] = [:], body: Data = Data()) {
    self.statusCode = statusCode
    self.headers = headers
    self.body = body
  }

  public func headerValue(_ name: String) -> String? {
    let lower = name.lowercased()
    return headers.first { $0.key.lowercased() == lower }?.value
  }
}

public protocol WatchHTTPTransport: Sendable {
  func send(_ request: URLRequest) async throws -> WatchHTTPResponse
}

public enum WatchAPIError: Error, Equatable {
  case missingSession
  case invalidOrigin
  case invalidRequest
  case unauthorized
  case missingDefaultTaskList
  case httpError(statusCode: Int, message: String)
  case invalidResponse
  case streamError(String)
}

/// Refuses HTTP redirects on authenticated requests so Bearer credentials never cross hosts.
public final class WatchRedirectBlockingDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  public func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    completionHandler(nil)
  }
}

public final class URLSessionWatchTransport: WatchHTTPTransport, @unchecked Sendable {
  private let session: URLSession

  public init(configuration: URLSessionConfiguration = .ephemeral) {
    configuration.timeoutIntervalForRequest = 25
    configuration.timeoutIntervalForResource = 45
    self.session = URLSession(
      configuration: configuration,
      delegate: WatchRedirectBlockingDelegate(),
      delegateQueue: nil
    )
  }

  public func send(_ request: URLRequest) async throws -> WatchHTTPResponse {
    let (data, response) = try await session.data(for: request)
    guard let http = response as? HTTPURLResponse else {
      throw WatchAPIError.invalidResponse
    }
    var headers: [String: String] = [:]
    for (key, value) in http.allHeaderFields {
      if let k = key as? String, let v = value as? String {
        headers[k] = v
      }
    }
    return WatchHTTPResponse(statusCode: http.statusCode, headers: headers, body: data)
  }
}

/// Lightweight watchOS API client using the paired iPhone's short-lived Supabase Bearer token
/// and resolved Tuturuuu origins (including the production mobile-calendar gateway).
public final class WatchAPIClient: @unchecked Sendable {
  private let transport: WatchHTTPTransport
  private let secretStore: WatchSecretStore
  private let onUnauthorizedRefresh: (@Sendable () async -> String?)?

  public init(
    transport: WatchHTTPTransport = URLSessionWatchTransport(),
    secretStore: WatchSecretStore,
    onUnauthorizedRefresh: (@Sendable () async -> String?)? = nil
  ) {
    self.transport = transport
    self.secretStore = secretStore
    self.onUnauthorizedRefresh = onUnauthorizedRefresh
  }

  // MARK: - Today Snapshot (Events + Priority Tasks)

  public func fetchTodaySnapshot(
    metadata: WatchSessionMetadata,
    now: Date = Date(),
    timeZone: TimeZone = .current
  ) async throws -> WatchTodaySnapshot {
    guard metadata.apiOrigins.isValid else { throw WatchAPIError.invalidOrigin }

    async let tasksResult = fetchMyTasks(metadata: metadata)
    async let eventsResult = fetchTodayEvents(metadata: metadata, now: now, timeZone: timeZone)

    let (tasks, events) = try await (tasksResult, eventsResult)
    return WatchTodaySnapshot(
      workspaceId: metadata.workspaceId,
      workspaceName: metadata.workspaceName,
      isPersonal: metadata.isPersonal,
      syncedAt: now,
      events: events,
      tasks: tasks
    )
  }

  public func fetchMyTasks(metadata: WatchSessionMetadata) async throws -> [WatchTaskItem] {
    guard metadata.apiOrigins.isValid else { throw WatchAPIError.invalidOrigin }
    var components = URLComponents(string: "\(metadata.apiOrigins.tasks)/api/v1/users/me/tasks")
    components?.queryItems = [
      URLQueryItem(name: "wsId", value: metadata.workspaceId),
      URLQueryItem(name: "isPersonal", value: metadata.isPersonal ? "true" : "false"),
      URLQueryItem(name: "completedPage", value: "0"),
      URLQueryItem(name: "completedLimit", value: "5"),
    ]
    guard let url = components?.url else { throw WatchAPIError.invalidRequest }

    let response = try await sendAuthorized(method: "GET", url: url)
    guard let root = try? JSONSerialization.jsonObject(with: response.body) as? [String: Any] else {
      throw WatchAPIError.invalidResponse
    }

    let overdueRows = root["overdue"] as? [[String: Any]] ?? []
    let todayRows = root["today"] as? [[String: Any]] ?? []
    var seen = Set<String>()
    var items: [WatchTaskItem] = []

    for row in overdueRows + todayRows {
      guard let item = Self.parseUserTask(row), seen.insert(item.id).inserted else { continue }
      if !item.isCompleted {
        items.append(item)
      }
    }
    return items
  }

  public func fetchTodayEvents(
    metadata: WatchSessionMetadata,
    now: Date = Date(),
    timeZone: TimeZone = .current
  ) async throws -> [WatchCalendarEvent] {
    guard metadata.apiOrigins.isValid else { throw WatchAPIError.invalidOrigin }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    let startOfToday = calendar.startOfDay(for: now)
    let endOfWindow = calendar.date(byAdding: .day, value: 2, to: startOfToday)
      ?? startOfToday.addingTimeInterval(48 * 3600)

    let encodedWs = metadata.workspaceId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)
      ?? metadata.workspaceId
    let base = "\(metadata.apiOrigins.calendarBase)/api/v1/workspaces/\(encodedWs)/calendar/events"
    var components = URLComponents(string: base)
    components?.queryItems = [
      URLQueryItem(name: "start_at", value: WatchDateParser.formatISO8601(startOfToday)),
      URLQueryItem(name: "end_at", value: WatchDateParser.formatISO8601(endOfWindow)),
      URLQueryItem(name: "page_size", value: "50"),
    ]
    guard let url = components?.url else { throw WatchAPIError.invalidRequest }

    let response = try await sendAuthorized(method: "GET", url: url)
    guard let root = try? JSONSerialization.jsonObject(with: response.body) as? [String: Any],
          let rows = root["data"] as? [[String: Any]] else {
      throw WatchAPIError.invalidResponse
    }

    return rows.compactMap(Self.parseCalendarEvent)
  }

  // MARK: - Task Completion & Quick Capture

  /// Mirrors mobile `MyTaskMutations.completeMyTask`: moves board tasks into
  /// the board's first non-archived `done` list when available, and falls back
  /// to the personal `/users/me/tasks/{id}/overrides` completion timestamp.
  public func markTaskCompleted(
    task: WatchTaskItem,
    completedAt: Date = Date(),
    metadata: WatchSessionMetadata
  ) async throws {
    guard metadata.apiOrigins.isValid else { throw WatchAPIError.invalidOrigin }
    if let boardId = task.boardId, !boardId.isEmpty {
      let targetWsId = (task.workspaceId?.isEmpty == false) ? task.workspaceId! : metadata.workspaceId
      if let doneListId = try await findDoneListId(wsId: targetWsId, boardId: boardId, origins: metadata.apiOrigins) {
        let encodedWs = targetWsId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? targetWsId
        let encodedTask = task.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? task.id
        guard let url = URL(string: "\(metadata.apiOrigins.tasks)/api/v1/workspaces/\(encodedWs)/tasks/\(encodedTask)") else {
          throw WatchAPIError.invalidRequest
        }
        let body = try JSONSerialization.data(withJSONObject: ["list_id": doneListId])
        _ = try await sendAuthorized(method: "PUT", url: url, body: body)
        return
      }
    }
    try await markTaskCompletedOverride(taskId: task.id, completedAt: completedAt, metadata: metadata)
  }

  public func markTaskCompletedOverride(
    taskId: String,
    completedAt: Date? = Date(),
    metadata: WatchSessionMetadata
  ) async throws {
    guard metadata.apiOrigins.isValid else { throw WatchAPIError.invalidOrigin }
    let encodedId = taskId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? taskId
    guard let url = URL(string: "\(metadata.apiOrigins.tasks)/api/v1/users/me/tasks/\(encodedId)/overrides") else {
      throw WatchAPIError.invalidRequest
    }
    let payload: [String: Any] = [
      "completed_at": completedAt.map { WatchDateParser.formatISO8601($0) } ?? NSNull(),
    ]
    let body = try JSONSerialization.data(withJSONObject: payload)
    _ = try await sendAuthorized(method: "PUT", url: url, body: body)
  }

  private func findDoneListId(
    wsId: String,
    boardId: String,
    origins: WatchApiOrigins
  ) async throws -> String? {
    let encodedWs = wsId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? wsId
    let encodedBoard = boardId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? boardId
    guard let listsURL = URL(string: "\(origins.tasks)/api/v1/workspaces/\(encodedWs)/task-boards/\(encodedBoard)/lists") else {
      throw WatchAPIError.invalidRequest
    }
    let listsResponse = try await sendAuthorized(method: "GET", url: listsURL)
    guard let listsRoot = try? JSONSerialization.jsonObject(with: listsResponse.body) as? [String: Any] else {
      return nil
    }
    let lists = (listsRoot["lists"] as? [[String: Any]]) ?? (listsRoot["data"] as? [[String: Any]]) ?? []
    let doneList = lists.first { row in
      let archived = (row["archived"] as? Bool) == true || (row["deleted"] as? Bool) == true
      let status = (row["status"] as? String) ?? ""
      return !archived && status == "done"
    }
    return doneList?["id"] as? String
  }

  public func resolveDefaultListId(metadata: WatchSessionMetadata) async throws -> String {
    if let existing = metadata.defaultListId?.trimmingCharacters(in: .whitespacesAndNewlines),
       !existing.isEmpty {
      return existing
    }
    guard metadata.apiOrigins.isValid else { throw WatchAPIError.invalidOrigin }
    let encodedWs = metadata.workspaceId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)
      ?? metadata.workspaceId
    guard let boardsURL = URL(string: "\(metadata.apiOrigins.tasks)/api/v1/workspaces/\(encodedWs)/task-boards") else {
      throw WatchAPIError.invalidRequest
    }
    let boardsResponse = try await sendAuthorized(method: "GET", url: boardsURL)
    guard let boardsRoot = try? JSONSerialization.jsonObject(with: boardsResponse.body) as? [String: Any] else {
      throw WatchAPIError.invalidResponse
    }
    let boards = (boardsRoot["boards"] as? [[String: Any]]) ?? (boardsRoot["data"] as? [[String: Any]]) ?? []
    guard let boardId = boards.first(where: { ($0["archived"] as? Bool) != true })?["id"] as? String else {
      throw WatchAPIError.missingDefaultTaskList
    }
    let encodedBoard = boardId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? boardId
    guard let listsURL = URL(string: "\(metadata.apiOrigins.tasks)/api/v1/workspaces/\(encodedWs)/task-boards/\(encodedBoard)/lists") else {
      throw WatchAPIError.invalidRequest
    }
    let listsResponse = try await sendAuthorized(method: "GET", url: listsURL)
    guard let listsRoot = try? JSONSerialization.jsonObject(with: listsResponse.body) as? [String: Any] else {
      throw WatchAPIError.invalidResponse
    }
    let lists = (listsRoot["lists"] as? [[String: Any]]) ?? (listsRoot["data"] as? [[String: Any]]) ?? []
    let activeList = lists.first { row in
      let archived = (row["archived"] as? Bool) == true || (row["deleted"] as? Bool) == true
      let status = (row["status"] as? String) ?? ""
      return !archived && (status == "not_started" || status == "active")
    } ?? lists.first { ($0["archived"] as? Bool) != true }
    guard let listId = activeList?["id"] as? String, !listId.isEmpty else {
      throw WatchAPIError.missingDefaultTaskList
    }
    return listId
  }

  public func quickCaptureTask(
    name: String,
    priority: WatchTaskPriority = .normal,
    dueToday: Bool = true,
    metadata: WatchSessionMetadata,
    now: Date = Date(),
    timeZone: TimeZone = .current
  ) async throws -> WatchTaskItem {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { throw WatchAPIError.invalidRequest }
    guard metadata.apiOrigins.isValid else { throw WatchAPIError.invalidOrigin }

    let listId = try await resolveDefaultListId(metadata: metadata)
    let encodedWs = metadata.workspaceId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)
      ?? metadata.workspaceId
    guard let url = URL(string: "\(metadata.apiOrigins.tasks)/api/v1/workspaces/\(encodedWs)/tasks") else {
      throw WatchAPIError.invalidRequest
    }

    var payload: [String: Any] = [
      "name": trimmed,
      "listId": listId,
    ]
    if let apiPriority = priority.apiValue {
      payload["priority"] = apiPriority
    }
    if dueToday {
      var calendar = Calendar(identifier: .gregorian)
      calendar.timeZone = timeZone
      let startOfToday = calendar.startOfDay(for: now)
      let endOfToday = calendar.date(byAdding: DateComponents(day: 1, second: -1), to: startOfToday)
        ?? now
      payload["end_date"] = WatchDateParser.formatISO8601(endOfToday)
    }

    let body = try JSONSerialization.data(withJSONObject: payload)
    let response = try await sendAuthorized(method: "POST", url: url, body: body)
    guard let root = try? JSONSerialization.jsonObject(with: response.body) as? [String: Any],
          let taskRow = root["task"] as? [String: Any],
          let created = Self.parseUserTask(taskRow) else {
      throw WatchAPIError.invalidResponse
    }
    return created
  }

  // MARK: - Mira Quick-Ask

  public func askMira(
    prompt: String,
    conversationId: String? = nil,
    metadata: WatchSessionMetadata,
    timeZone: TimeZone = .current,
    onDelta: (@Sendable (String) -> Void)? = nil
  ) async throws -> (conversationId: String, reply: String) {
    let trimmed = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { throw WatchAPIError.invalidRequest }
    guard metadata.apiOrigins.isValid else { throw WatchAPIError.invalidOrigin }

    let encodedWs = metadata.workspaceId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)
      ?? metadata.workspaceId

    let resolvedConversationId: String
    if let conversationId, !conversationId.isEmpty {
      resolvedConversationId = conversationId
    } else {
      guard let createURL = URL(string: "\(metadata.apiOrigins.platform)/api/v1/workspaces/\(encodedWs)/chat/conversations") else {
        throw WatchAPIError.invalidRequest
      }
      let title = String(trimmed.prefix(64))
      let createPayload: [String: Any] = [
        "type": "ai",
        "title": title,
        "aiEnabled": true,
        "autoReply": true,
      ]
      let createBody = try JSONSerialization.data(withJSONObject: createPayload)
      let createResp = try await sendAuthorized(method: "POST", url: createURL, body: createBody)
      guard let createRoot = try? JSONSerialization.jsonObject(with: createResp.body) as? [String: Any],
            let conv = createRoot["conversation"] as? [String: Any],
            let convId = conv["id"] as? String,
            !convId.isEmpty else {
        throw WatchAPIError.invalidResponse
      }
      resolvedConversationId = convId
    }

    let encodedConv = resolvedConversationId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)
      ?? resolvedConversationId
    guard let msgURL = URL(string: "\(metadata.apiOrigins.platform)/api/v1/workspaces/\(encodedWs)/chat/conversations/\(encodedConv)/messages") else {
      throw WatchAPIError.invalidRequest
    }

    let messagePayload: [String: Any] = [
      "content": trimmed,
      "kind": "user",
      "clientRequestId": UUID().uuidString.lowercased(),
      "miraMode": true,
      "timezone": timeZone.identifier,
    ]
    let messageBody = try JSONSerialization.data(withJSONObject: messagePayload)
    let response = try await sendAuthorized(
      method: "POST",
      url: msgURL,
      body: messageBody,
      accept: "application/x-ndjson"
    )

    let contentType = response.headerValue("Content-Type")?.lowercased() ?? ""
    if !contentType.contains("application/x-ndjson") {
      if let text = WatchMiraStreamParser.parsePlainJSONResponse(response.body) {
        onDelta?(text)
        return (resolvedConversationId, text)
      }
      throw WatchAPIError.invalidResponse
    }

    let parser = WatchMiraStreamParser()
    let events = parser.addChunk(response.body) + parser.finish()
    var accumulated = ""
    var authoritative: String?

    for event in events {
      switch event {
      case let .assistantDelta(delta):
        accumulated.append(delta)
        onDelta?(accumulated)
      case let .assistantFinalText(text):
        authoritative = text
      case let .error(message):
        throw WatchAPIError.streamError(message)
      case .done:
        break
      }
    }

    let finalReply = (authoritative ?? accumulated).trimmingCharacters(in: .whitespacesAndNewlines)
    guard !finalReply.isEmpty else { throw WatchAPIError.invalidResponse }
    return (resolvedConversationId, finalReply)
  }

  // MARK: - Authorized Request Dispatch

  private func sendAuthorized(
    method: String,
    url: URL,
    body: Data? = nil,
    accept: String = "application/json",
    allowUnauthorizedRetry: Bool = true
  ) async throws -> WatchHTTPResponse {
    guard let token = secretStore.readAccessToken(), !token.isEmpty else {
      throw WatchAPIError.missingSession
    }

    var request = URLRequest(url: url)
    request.httpMethod = method
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue(accept, forHTTPHeaderField: "Accept")
    if let body {
      request.httpBody = body
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }

    let response = try await transport.send(request)
    if response.statusCode == 401 && allowUnauthorizedRetry,
       let refresh = onUnauthorizedRefresh,
       let refreshedToken = await refresh(),
       !refreshedToken.isEmpty {
      try? secretStore.saveAccessToken(refreshedToken)
      return try await sendAuthorized(
        method: method,
        url: url,
        body: body,
        accept: accept,
        allowUnauthorizedRetry: false
      )
    }

    if response.statusCode == 401 {
      throw WatchAPIError.unauthorized
    }

    guard (200..<300).contains(response.statusCode) else {
      let message = Self.extractErrorMessage(from: response.body)
        ?? "Request failed (\(response.statusCode))"
      throw WatchAPIError.httpError(statusCode: response.statusCode, message: message)
    }

    return response
  }

  // MARK: - JSON Row Decoders

  private static func parseUserTask(_ row: [String: Any]) -> WatchTaskItem? {
    guard let id = row["id"] as? String, !id.isEmpty else { return nil }
    let rawName = (row["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    let name = (rawName?.isEmpty == false) ? rawName! : "Untitled task"
    let priority = WatchTaskPriority(rawAPIValue: row["priority"] as? String)
    let endDate = (row["end_date"] as? String).flatMap(WatchDateParser.parseISO8601)
    let listObject = row["list"] as? [String: Any]
    let listId = (row["list_id"] as? String) ?? (listObject?["id"] as? String)
    let listStatus = listObject?["status"] as? String
    let boardObject = listObject?["board"] as? [String: Any]
    let boardId = boardObject?["id"] as? String
    let workspaceId = (boardObject?["ws_id"] as? String)
      ?? ((boardObject?["workspaces"] as? [String: Any])?["id"] as? String)
      ?? ((boardObject?["workspace"] as? [String: Any])?["id"] as? String)
    let hasCompletedAt = (row["completed_at"] as? String).flatMap(WatchDateParser.parseISO8601) != nil
    let completedFlag = (row["completed"] as? Bool) == true
    let isCompleted = hasCompletedAt || completedFlag || listStatus == "done" || listStatus == "review"

    return WatchTaskItem(
      id: id,
      name: name,
      priority: priority,
      endDate: endDate,
      listId: listId,
      boardId: boardId,
      workspaceId: workspaceId,
      isCompleted: isCompleted
    )
  }

  private static func parseCalendarEvent(_ row: [String: Any]) -> WatchCalendarEvent? {
    guard let id = row["id"] as? String,
          !id.isEmpty,
          let rawStart = row["start_at"] as? String,
          let rawEnd = row["end_at"] as? String,
          let startAt = WatchDateParser.parseISO8601(rawStart),
          let endAt = WatchDateParser.parseISO8601(rawEnd) else {
      return nil
    }
    let rawTitle = (row["title"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    let isAllDay = WatchCalendarEvent.inferAllDay(startAt: startAt, endAt: endAt)
    let metadata = row["scheduling_metadata"] as? [String: Any]
    let googleEventType = metadata?["google_event_type"] as? String

    if WatchCalendarEvent.isWorkingLocation(
      title: rawTitle,
      isAllDay: isAllDay,
      googleEventType: googleEventType
    ) {
      return nil
    }

    let rawLocation = (row["location"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    let location = (rawLocation?.isEmpty == false) ? rawLocation : nil
    let title = (rawTitle?.isEmpty == false) ? rawTitle! : "Untitled event"

    return WatchCalendarEvent(
      id: id,
      title: title,
      location: location,
      startAt: startAt,
      endAt: endAt,
      color: row["color"] as? String,
      isAllDay: isAllDay
    )
  }

  private static func extractErrorMessage(from body: Data) -> String? {
    guard let root = try? JSONSerialization.jsonObject(with: body) as? [String: Any] else {
      return nil
    }
    for key in ["message", "error"] {
      if let value = root[key] as? String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { return trimmed }
      }
    }
    return nil
  }
}
