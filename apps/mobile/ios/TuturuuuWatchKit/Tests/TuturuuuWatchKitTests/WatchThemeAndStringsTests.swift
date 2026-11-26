import Foundation
import XCTest
@testable import TuturuuuWatchKit

final class WatchThemeAndStringsTests: XCTestCase {
  func testEnglishAndVietnameseLocalizationParityAndNoEmoji() {
    let allKeys = Set(WatchStringKey.allCases)
    XCTAssertEqual(WatchStrings.allEnglishKeys, allKeys)
    XCTAssertEqual(WatchStrings.allVietnameseKeys, allKeys)

    for locale in WatchLocale.allCases {
      for key in WatchStringKey.allCases {
        let value = WatchStrings.text(key, locale: locale)
        XCTAssertFalse(value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, "\(locale) \(key)")
        XCTAssertFalse(containsEmoji(value), "Emoji forbidden in UI copy: \(locale) \(key) = \(value)")
      }
    }

    XCTAssertEqual(WatchStrings.tasksLeftSummary(count: 0, locale: .en), "All caught up")
    XCTAssertEqual(WatchStrings.tasksLeftSummary(count: 1, locale: .en), "1 left today")
    XCTAssertEqual(WatchStrings.tasksLeftSummary(count: 4, locale: .en), "4 left today")
    XCTAssertEqual(WatchStrings.tasksLeftSummary(count: 0, locale: .vi), "Đã xong hôm nay")
    XCTAssertEqual(WatchStrings.tasksLeftSummary(count: 4, locale: .vi), "Còn 4 việc hôm nay")
  }

  func test24HourTimeFormat() {
    let date = WatchDateParser.parseISO8601("2026-11-27T07:35:00Z")!
    let ict = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
    XCTAssertEqual(WatchStrings.format24HourTime(date, timeZone: ict), "14:35")
  }

  func testSorbetPaletteMatchesContractAndCalmTwins() {
    XCTAssertEqual(SorbetWatchPalette.background, SorbetRGB(hex: 0x18151C))
    XCTAssertEqual(SorbetWatchPalette.surface, SorbetRGB(hex: 0x211D26))
    XCTAssertEqual(SorbetWatchPalette.blue.activeFill(calmColors: false), SorbetRGB(hex: 0x22396B))
    XCTAssertEqual(SorbetWatchPalette.blue.activeFill(calmColors: true), SorbetRGB(hex: 0x22304F))
    XCTAssertEqual(SorbetWatchPalette.hue(for: .critical), SorbetWatchPalette.red)
    XCTAssertEqual(SorbetWatchPalette.hue(for: .high), SorbetWatchPalette.orange)
    XCTAssertEqual(SorbetWatchPalette.hue(forCalendarColor: "purple"), SorbetWatchPalette.purple)
  }

  func testComplicationModelsForSignedOutEmptyAndPopulatedStates() {
    let tz = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
    let now = WatchDateParser.parseISO8601("2026-11-27T02:00:00Z")!

    let signedOutEvent = NextEventComplicationModel.make(
      snapshot: nil, isSignedIn: false, now: now, locale: .en, timeZone: tz
    )
    XCTAssertFalse(signedOutEvent.isSignedIn)
    XCTAssertEqual(signedOutEvent.title, "Open iPhone app")

    let snapshot = WatchTodaySnapshot(
      workspaceId: "ws-1",
      workspaceName: "Tuturuuu",
      isPersonal: false,
      syncedAt: now,
      events: [
        WatchCalendarEvent(
          id: "past",
          title: "Early sync",
          startAt: now.addingTimeInterval(-3600),
          endAt: now.addingTimeInterval(-600)
        ),
        WatchCalendarEvent(
          id: "next",
          title: "Product demo",
          location: "Zoom",
          startAt: now.addingTimeInterval(3600), // 10:00 ICT
          endAt: now.addingTimeInterval(5400),
          color: "teal"
        ),
      ],
      tasks: [
        WatchTaskItem(id: "t1", name: "Fix Duo sheet", priority: .critical, endDate: now.addingTimeInterval(7200)),
        WatchTaskItem(id: "t2", name: "Write tests", priority: .normal, isCompleted: true),
      ]
    )

    let nextEvent = NextEventComplicationModel.make(
      snapshot: snapshot, isSignedIn: true, now: now, locale: .en, timeZone: tz
    )
    XCTAssertEqual(nextEvent.title, "Product demo")
    XCTAssertEqual(nextEvent.timeLabel, "10:00")
    XCTAssertEqual(nextEvent.calendarColor, "teal")

    let tasksLeft = TasksLeftComplicationModel.make(
      snapshot: snapshot, isSignedIn: true, now: now, locale: .vi, timeZone: tz
    )
    XCTAssertEqual(tasksLeft.remainingCount, 1)
    XCTAssertEqual(tasksLeft.totalCount, 2)
    XCTAssertEqual(tasksLeft.completionFraction, 0.5, accuracy: 0.001)
    XCTAssertEqual(tasksLeft.summaryText, "Còn 1 việc hôm nay")
    XCTAssertEqual(tasksLeft.topTaskTitle, "Fix Duo sheet")
  }

  private func containsEmoji(_ text: String) -> Bool {
    text.unicodeScalars.contains { scalar in
      scalar.properties.isEmojiPresentation || scalar.properties.generalCategory == .otherSymbol
    }
  }
}
