import Foundation
import XCTest
@testable import TuturuuuWatchKit

final class WatchModelsAndSessionTests: XCTestCase {
  func testTaskPriorityParsingAndSorting() {
    XCTAssertEqual(WatchTaskPriority(rawAPIValue: "critical"), .critical)
    XCTAssertEqual(WatchTaskPriority(rawAPIValue: "URGENT"), .critical)
    XCTAssertEqual(WatchTaskPriority(rawAPIValue: "high"), .high)
    XCTAssertEqual(WatchTaskPriority(rawAPIValue: "normal"), .normal)
    XCTAssertEqual(WatchTaskPriority(rawAPIValue: "medium"), .normal)
    XCTAssertEqual(WatchTaskPriority(rawAPIValue: "low"), .low)
    XCTAssertEqual(WatchTaskPriority(rawAPIValue: nil), .none)
    XCTAssertNil(WatchTaskPriority.none.apiValue)
    XCTAssertEqual(WatchTaskPriority.critical.apiValue, "critical")

    let tz = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
    let now = WatchDateParser.parseISO8601("2026-11-27T04:00:00Z")! // 11:00 ICT
    let yesterday = WatchDateParser.parseISO8601("2026-11-26T10:00:00Z")!
    let laterToday = WatchDateParser.parseISO8601("2026-11-27T12:00:00Z")!

    let snapshot = WatchTodaySnapshot(
      workspaceId: "ws-1",
      workspaceName: "Tuturuuu",
      isPersonal: false,
      syncedAt: now,
      events: [],
      tasks: [
        WatchTaskItem(id: "done", name: "Already done", priority: .critical, endDate: yesterday, isCompleted: true),
        WatchTaskItem(id: "low", name: "Low today", priority: .low, endDate: laterToday),
        WatchTaskItem(id: "urgent", name: "Urgent today", priority: .critical, endDate: laterToday),
        WatchTaskItem(id: "overdue-low", name: "Overdue low", priority: .low, endDate: yesterday),
        WatchTaskItem(id: "high", name: "High today", priority: .high, endDate: laterToday),
      ]
    )

    let ordered = snapshot.prioritizedTasks(now: now, timeZone: tz)
    XCTAssertEqual(ordered.map(\.id), ["overdue-low", "urgent", "high", "low"])
    XCTAssertEqual(snapshot.remainingTasksCount, 4)
    XCTAssertTrue(ordered[0].isOverdue(relativeTo: now, timeZone: tz))
    XCTAssertFalse(ordered[1].isOverdue(relativeTo: now, timeZone: tz))
  }

  func testWorkingLocationAndAllDayInference() {
    let start = WatchDateParser.parseISO8601("2026-11-27T00:00:00Z")!
    let end24h = WatchDateParser.parseISO8601("2026-11-28T00:00:00Z")!
    let end1h = WatchDateParser.parseISO8601("2026-11-27T01:00:00Z")!

    XCTAssertTrue(WatchCalendarEvent.inferAllDay(startAt: start, endAt: end24h))
    XCTAssertFalse(WatchCalendarEvent.inferAllDay(startAt: start, endAt: end1h))

    XCTAssertTrue(WatchCalendarEvent.isWorkingLocation(title: "Office", isAllDay: true, googleEventType: nil))
    XCTAssertTrue(WatchCalendarEvent.isWorkingLocation(title: "Focus", isAllDay: false, googleEventType: "workingLocation"))
    XCTAssertFalse(WatchCalendarEvent.isWorkingLocation(title: "Office sync", isAllDay: false, googleEventType: nil))

    // Timed event takes precedence over all-day banner for nextEvent complication.
    let now = WatchDateParser.parseISO8601("2026-11-27T02:00:00Z")!
    let snapshot = WatchTodaySnapshot(
      workspaceId: "ws-1",
      workspaceName: "Tuturuuu",
      isPersonal: false,
      syncedAt: now,
      events: [
        WatchCalendarEvent(id: "allday", title: "Company offsite", startAt: start, endAt: end24h, isAllDay: true),
        WatchCalendarEvent(
          id: "timed",
          title: "Architecture sync",
          startAt: now.addingTimeInterval(3600),
          endAt: now.addingTimeInterval(5400),
          isAllDay: false
        ),
      ],
      tasks: []
    )
    XCTAssertEqual(snapshot.nextEvent(after: now)?.id, "timed")

    // Token expiry handles both seconds and milliseconds.
    let expiredMs = WatchSessionMetadata(
      userId: "u", workspaceId: "w", workspaceName: "W", isPersonal: true,
      expiresAtEpochSeconds: (now.timeIntervalSince1970 - 10) * 1000
    )
    XCTAssertTrue(expiredMs.isTokenExpired(now: now))
  }

  func testApiOriginsValidationAndNormalization() {
    let prod = WatchApiOrigins(
      platform: "https://tuturuuu.com/",
      tasks: "https://tasks.tuturuuu.com///",
      calendarBase: "https://infrastructure.tuturuuu.com/api/v1/mobile-calendar/"
    )
    XCTAssertTrue(prod.isValid)
    XCTAssertEqual(prod.platform, "https://tuturuuu.com")
    XCTAssertEqual(prod.tasks, "https://tasks.tuturuuu.com")
    XCTAssertEqual(prod.calendarBase, "https://infrastructure.tuturuuu.com/api/v1/mobile-calendar")

    let localDev = WatchApiOrigins(
      platform: "http://localhost:7803",
      tasks: "http://localhost:7809",
      calendarBase: "http://localhost:7806"
    )
    XCTAssertTrue(localDev.isValid)

    let insecureRemote = WatchApiOrigins(
      platform: "http://tuturuuu.com",
      tasks: "https://tasks.tuturuuu.com",
      calendarBase: "https://infrastructure.tuturuuu.com/api/v1/mobile-calendar"
    )
    XCTAssertFalse(insecureRemote.isValid)
  }

  func testWatchConnectivityContextRoundTripAndSignOutWipe() throws {
    let now = WatchDateParser.parseISO8601("2026-11-27T04:00:00Z")!
    let metadata = WatchSessionMetadata(
      userId: "user-1",
      userFirstName: "Linh",
      workspaceId: "ws-1",
      workspaceName: "Tuturuuu",
      isPersonal: false,
      defaultListId: "list-1",
      apiOrigins: .productionDefault,
      locale: .vi,
      calmColors: true,
      expiresAtEpochSeconds: now.timeIntervalSince1970 + 3600
    )
    let snapshot = WatchTodaySnapshot(
      workspaceId: "ws-1",
      workspaceName: "Tuturuuu",
      isPersonal: false,
      syncedAt: now,
      events: [
        WatchCalendarEvent(
          id: "ev-1",
          title: "Design review",
          location: "Room A",
          startAt: now.addingTimeInterval(1800),
          endAt: now.addingTimeInterval(3600),
          color: "blue"
        ),
      ],
      tasks: [
        WatchTaskItem(id: "t-1", name: "Ship watch v1", priority: .high, endDate: now.addingTimeInterval(7200)),
      ]
    )

    let outgoing = WatchSessionContext(
      signedOut: false,
      accessToken: "jwt-secret-token",
      metadata: metadata,
      snapshot: snapshot
    )
    let wire = try outgoing.toWatchConnectivityDictionary()
    let decoded = try WatchSessionContext.fromWatchConnectivityDictionary(wire)
    XCTAssertEqual(decoded, outgoing)

    let suiteName = "com.tuturuuu.watch.tests.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suiteName)!
    defer { defaults.removePersistentDomain(forName: suiteName) }

    let secrets = InMemoryWatchSecretStore()
    let store = AppGroupWatchSnapshotStore(defaults: defaults)
    let coordinator = WatchSessionCoordinator(secretStore: secrets, snapshotStore: store)

    XCTAssertTrue(try coordinator.apply(decoded))
    XCTAssertEqual(secrets.readAccessToken(), "jwt-secret-token")
    XCTAssertEqual(store.readMetadata()?.workspaceName, "Tuturuuu")
    XCTAssertEqual(store.readSnapshot()?.tasks.count, 1)

    // Verify token is never stored in UserDefaults.
    let serializedDefaults = defaults.dictionaryRepresentation().values.compactMap { value -> String? in
      if let data = value as? Data { return String(data: data, encoding: .utf8) }
      return value as? String
    }.joined(separator: "\n")
    XCTAssertFalse(serializedDefaults.contains("jwt-secret-token"))

    // Account switch clears previous user's snapshot.
    let switched = WatchSessionContext(
      signedOut: false,
      accessToken: "jwt-user-2",
      metadata: WatchSessionMetadata(
        userId: "user-2",
        workspaceId: "ws-2",
        workspaceName: "Personal",
        isPersonal: true
      ),
      snapshot: nil
    )
    XCTAssertTrue(try coordinator.apply(switched))
    XCTAssertEqual(secrets.readAccessToken(), "jwt-user-2")
    XCTAssertNil(store.readSnapshot())

    // Sign-out wipes both Keychain and App Group store.
    XCTAssertFalse(try coordinator.apply(.signedOutPayload))
    XCTAssertNil(secrets.readAccessToken())
    XCTAssertNil(store.readMetadata())
    XCTAssertNil(store.readSnapshot())
  }
}
