import Foundation
import XCTest
@testable import TuturuuuWatchKit

private final class MockWatchTransport: WatchHTTPTransport, @unchecked Sendable {
  private let lock = NSLock()
  private var recordedRequests: [URLRequest] = []
  private let handler: @Sendable (URLRequest, Int) throws -> WatchHTTPResponse

  init(handler: @escaping @Sendable (URLRequest, Int) throws -> WatchHTTPResponse) {
    self.handler = handler
  }

  var requests: [URLRequest] {
    lock.lock()
    defer { lock.unlock() }
    return recordedRequests
  }

  private func record(_ request: URLRequest) -> Int {
    lock.lock()
    defer { lock.unlock() }
    let index = recordedRequests.count
    recordedRequests.append(request)
    return index
  }

  func send(_ request: URLRequest) async throws -> WatchHTTPResponse {
    let index = record(request)
    return try handler(request, index)
  }
}

final class WatchAPIClientTests: XCTestCase {
  private let metadata = WatchSessionMetadata(
    userId: "user-1",
    workspaceId: "ws-123",
    workspaceName: "Tuturuuu",
    isPersonal: false,
    defaultListId: nil,
    apiOrigins: .productionDefault,
    locale: .en
  )

  func testFetchTodaySnapshotRoutesTasksAndMobileCalendarGateway() async throws {
    let now = WatchDateParser.parseISO8601("2026-11-27T02:00:00Z")!
    let transport = MockWatchTransport { request, _ in
      XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer token-abc")
      let urlString = request.url?.absoluteString ?? ""

      if urlString.hasPrefix("https://tasks.tuturuuu.com/api/v1/users/me/tasks?") {
        let json = """
        {
          "overdue": [
            {"id": "t-overdue", "name": "Pay invoice", "priority": "critical", "end_date": "2026-11-26T10:00:00Z"}
          ],
          "today": [
            {"id": "t-today", "name": "Review Watch PR", "priority": "high", "end_date": "2026-11-27T15:00:00Z"},
            {"id": "t-done", "name": "Closed task", "priority": "normal", "completed_at": "2026-11-27T01:00:00Z"}
          ]
        }
        """
        return WatchHTTPResponse(statusCode: 200, body: Data(json.utf8))
      }

      if urlString.hasPrefix("https://infrastructure.tuturuuu.com/api/v1/mobile-calendar/api/v1/workspaces/ws-123/calendar/events?") {
        let json = """
        {
          "data": [
            {
              "id": "ev-workloc",
              "title": "Office",
              "start_at": "2026-11-27T00:00:00Z",
              "end_at": "2026-11-28T00:00:00Z",
              "scheduling_metadata": {"google_event_type": "workingLocation"}
            },
            {
              "id": "ev-standup",
              "title": "Mobile standup",
              "location": "Meet",
              "start_at": "2026-11-27T03:00:00Z",
              "end_at": "2026-11-27T03:30:00Z",
              "color": "blue"
            }
          ]
        }
        """
        return WatchHTTPResponse(statusCode: 200, body: Data(json.utf8))
      }

      XCTFail("Unexpected URL: \(urlString)")
      return WatchHTTPResponse(statusCode: 404)
    }

    let client = WatchAPIClient(
      transport: transport,
      secretStore: InMemoryWatchSecretStore(initialToken: "token-abc")
    )
    let snapshot = try await client.fetchTodaySnapshot(
      metadata: metadata,
      now: now,
      timeZone: TimeZone(secondsFromGMT: 0)!
    )

    XCTAssertEqual(snapshot.tasks.map(\.id), ["t-overdue", "t-today"])
    XCTAssertEqual(snapshot.events.map(\.id), ["ev-standup"])
    XCTAssertEqual(snapshot.nextEvent(after: now)?.location, "Meet")
  }

  func testMarkTaskCompletedAndQuickCaptureFallbackListDiscovery() async throws {
    let transport = MockWatchTransport { request, _ in
      let path = request.url?.path ?? ""
      if request.httpMethod == "PUT", path == "/api/v1/users/me/tasks/task-9/overrides" {
        let body = try JSONSerialization.jsonObject(with: request.httpBody ?? Data()) as? [String: Any]
        XCTAssertNotNil(body?["completed_at"] as? String)
        return WatchHTTPResponse(statusCode: 200, body: Data("{}".utf8))
      }
      if request.httpMethod == "PUT", path == "/api/v1/workspaces/ws-123/tasks/task-board-1" {
        let body = try JSONSerialization.jsonObject(with: request.httpBody ?? Data()) as? [String: Any]
        XCTAssertEqual(body?["list_id"] as? String, "l-done")
        return WatchHTTPResponse(statusCode: 200, body: Data("{}".utf8))
      }
      if request.httpMethod == "GET", path == "/api/v1/workspaces/ws-123/task-boards" {
        return WatchHTTPResponse(
          statusCode: 200,
          body: Data(#"{"boards":[{"id":"b-arch","archived":true},{"id":"b-main","archived":false}]}"#.utf8)
        )
      }
      if request.httpMethod == "GET", path == "/api/v1/workspaces/ws-123/task-boards/b-main/lists" {
        return WatchHTTPResponse(
          statusCode: 200,
          body: Data(#"{"lists":[{"id":"l-done","status":"done"},{"id":"l-todo","status":"not_started"}]}"#.utf8)
        )
      }
      if request.httpMethod == "POST", path == "/api/v1/workspaces/ws-123/tasks" {
        let body = try JSONSerialization.jsonObject(with: request.httpBody ?? Data()) as? [String: Any]
        XCTAssertEqual(body?["name"] as? String, "Buy coffee beans")
        XCTAssertEqual(body?["listId"] as? String, "l-todo")
        XCTAssertEqual(body?["priority"] as? String, "high")
        XCTAssertNotNil(body?["end_date"] as? String)
        return WatchHTTPResponse(
          statusCode: 201,
          body: Data(#"{"task":{"id":"t-new","name":"Buy coffee beans","priority":"high","list_id":"l-todo"}}"#.utf8)
        )
      }
      XCTFail("Unexpected request: \(request.httpMethod ?? "") \(path)")
      return WatchHTTPResponse(statusCode: 404)
    }

    let client = WatchAPIClient(
      transport: transport,
      secretStore: InMemoryWatchSecretStore(initialToken: "token-abc")
    )

    // Without boardId -> falls back to personal completion override.
    try await client.markTaskCompleted(
      task: WatchTaskItem(id: "task-9", name: "Personal item"),
      metadata: metadata
    )
    // With boardId -> moves task into board's non-archived done list.
    try await client.markTaskCompleted(
      task: WatchTaskItem(id: "task-board-1", name: "Board item", boardId: "b-main", workspaceId: "ws-123"),
      metadata: metadata
    )
    let created = try await client.quickCaptureTask(
      name: "  Buy coffee beans ",
      priority: .high,
      dueToday: true,
      metadata: metadata
    )
    XCTAssertEqual(created.id, "t-new")
    XCTAssertEqual(created.name, "Buy coffee beans")
    XCTAssertEqual(created.listId, "l-todo")
  }

  func testAskMiraCreatesAIConversationAndStreamsReply() async throws {
    let transport = MockWatchTransport { request, _ in
      let path = request.url?.path ?? ""
      if path == "/api/v1/workspaces/ws-123/chat/conversations" {
        let body = try JSONSerialization.jsonObject(with: request.httpBody ?? Data()) as? [String: Any]
        XCTAssertEqual(body?["type"] as? String, "ai")
        XCTAssertEqual(body?["aiEnabled"] as? Bool, true)
        return WatchHTTPResponse(
          statusCode: 201,
          body: Data(#"{"conversation":{"id":"conv-42"}}"#.utf8)
        )
      }
      if path == "/api/v1/workspaces/ws-123/chat/conversations/conv-42/messages" {
        XCTAssertEqual(request.value(forHTTPHeaderField: "Accept"), "application/x-ndjson")
        let ndjson = """
        {"type":"assistant_delta","delta":"You have "}
        {"type":"assistant_delta","delta":"two meetings left."}
        {"type":"messages","messages":[{"id":"m1","kind":"assistant","content":"fallback","metadata":{"ai":{"parts":[{"type":"text","text":"You have two meetings left today."}]}}}]}
        {"type":"done"}
        """
        return WatchHTTPResponse(
          statusCode: 200,
          headers: ["Content-Type": "application/x-ndjson; charset=utf-8"],
          body: Data(ndjson.utf8)
        )
      }
      XCTFail("Unexpected request: \(path)")
      return WatchHTTPResponse(statusCode: 404)
    }

    let client = WatchAPIClient(
      transport: transport,
      secretStore: InMemoryWatchSecretStore(initialToken: "token-abc")
    )
    let result = try await client.askMira(
      prompt: "What is left today?",
      metadata: metadata,
      timeZone: TimeZone(identifier: "Asia/Ho_Chi_Minh")!
    )
    XCTAssertEqual(result.conversationId, "conv-42")
    XCTAssertEqual(result.reply, "You have two meetings left today.")
  }

  func testUnauthorizedTriggersSingleRefreshRetry() async throws {
    let secrets = InMemoryWatchSecretStore(initialToken: "expired-jwt")
    let transport = MockWatchTransport { request, _ in
      let auth = request.value(forHTTPHeaderField: "Authorization")
      if auth == "Bearer expired-jwt" {
        return WatchHTTPResponse(statusCode: 401, body: Data(#"{"error":"expired"}"#.utf8))
      }
      XCTAssertEqual(auth, "Bearer fresh-jwt")
      return WatchHTTPResponse(statusCode: 200, body: Data(#"{"overdue":[],"today":[]}"#.utf8))
    }

    let client = WatchAPIClient(
      transport: transport,
      secretStore: secrets,
      onUnauthorizedRefresh: { "fresh-jwt" }
    )

    let tasks = try await client.fetchMyTasks(metadata: metadata)
    XCTAssertTrue(tasks.isEmpty)
    XCTAssertEqual(secrets.readAccessToken(), "fresh-jwt")
    XCTAssertEqual(transport.requests.count, 2)
  }

  func testRedirectDelegateBlocksCrossHostRedirects() {
    let delegate = WatchRedirectBlockingDelegate()
    let session = URLSession(configuration: .ephemeral)
    let url = URL(string: "https://tuturuuu.com/api/v1/test")!
    let task = session.dataTask(with: url)
    let redirectResponse = HTTPURLResponse(
      url: url,
      statusCode: 302,
      httpVersion: nil,
      headerFields: ["Location": "https://evil.example/steal"]
    )!
    let expectation = expectation(description: "Redirect blocked")
    delegate.urlSession(
      session,
      task: task,
      willPerformHTTPRedirection: redirectResponse,
      newRequest: URLRequest(url: URL(string: "https://evil.example/steal")!)
    ) { allowedRequest in
      XCTAssertNil(allowedRequest)
      expectation.fulfill()
    }
    waitForExpectations(timeout: 1)
    session.invalidateAndCancel()
  }
}
