import Foundation

public struct NextEventComplicationModel: Sendable, Equatable {
  public let isSignedIn: Bool
  public let title: String
  public let timeLabel: String?
  public let location: String?
  public let calendarColor: String?
  public let isAllDay: Bool

  public init(
    isSignedIn: Bool,
    title: String,
    timeLabel: String?,
    location: String?,
    calendarColor: String?,
    isAllDay: Bool
  ) {
    self.isSignedIn = isSignedIn
    self.title = title
    self.timeLabel = timeLabel
    self.location = location
    self.calendarColor = calendarColor
    self.isAllDay = isAllDay
  }

  public static func make(
    snapshot: WatchTodaySnapshot?,
    isSignedIn: Bool,
    now: Date,
    locale: WatchLocale,
    timeZone: TimeZone = .current
  ) -> NextEventComplicationModel {
    guard isSignedIn else {
      return NextEventComplicationModel(
        isSignedIn: false,
        title: WatchStrings.text(.complicationSignIn, locale: locale),
        timeLabel: nil,
        location: nil,
        calendarColor: nil,
        isAllDay: false
      )
    }

    guard let next = snapshot?.nextEvent(after: now) else {
      return NextEventComplicationModel(
        isSignedIn: true,
        title: WatchStrings.text(.complicationNoEvents, locale: locale),
        timeLabel: nil,
        location: nil,
        calendarColor: nil,
        isAllDay: false
      )
    }

    let timeLabel = next.isAllDay
      ? WatchStrings.text(.allDay, locale: locale)
      : WatchStrings.format24HourTime(next.startAt, timeZone: timeZone)

    return NextEventComplicationModel(
      isSignedIn: true,
      title: next.title,
      timeLabel: timeLabel,
      location: next.location,
      calendarColor: next.color,
      isAllDay: next.isAllDay
    )
  }
}

public struct TasksLeftComplicationModel: Sendable, Equatable {
  public let isSignedIn: Bool
  public let remainingCount: Int
  public let totalCount: Int
  public let summaryText: String
  public let topTaskTitle: String?
  public let topTaskPriority: WatchTaskPriority
  public let hasOverdue: Bool

  public init(
    isSignedIn: Bool,
    remainingCount: Int,
    totalCount: Int,
    summaryText: String,
    topTaskTitle: String?,
    topTaskPriority: WatchTaskPriority,
    hasOverdue: Bool
  ) {
    self.isSignedIn = isSignedIn
    self.remainingCount = remainingCount
    self.totalCount = totalCount
    self.summaryText = summaryText
    self.topTaskTitle = topTaskTitle
    self.topTaskPriority = topTaskPriority
    self.hasOverdue = hasOverdue
  }

  public var completionFraction: Double {
    guard totalCount > 0 else { return remainingCount == 0 ? 1.0 : 0.0 }
    let completed = max(0, totalCount - remainingCount)
    return min(1.0, max(0.0, Double(completed) / Double(totalCount)))
  }

  public static func make(
    snapshot: WatchTodaySnapshot?,
    isSignedIn: Bool,
    now: Date,
    locale: WatchLocale,
    timeZone: TimeZone = .current
  ) -> TasksLeftComplicationModel {
    guard isSignedIn else {
      return TasksLeftComplicationModel(
        isSignedIn: false,
        remainingCount: 0,
        totalCount: 0,
        summaryText: WatchStrings.text(.complicationSignIn, locale: locale),
        topTaskTitle: nil,
        topTaskPriority: .none,
        hasOverdue: false
      )
    }

    let total = snapshot?.tasks.count ?? 0
    let prioritized = snapshot?.prioritizedTasks(now: now, timeZone: timeZone) ?? []
    let remaining = prioritized.count
    let top = prioritized.first
    let hasOverdue = prioritized.contains { $0.isOverdue(relativeTo: now, timeZone: timeZone) }

    return TasksLeftComplicationModel(
      isSignedIn: true,
      remainingCount: remaining,
      totalCount: total,
      summaryText: remaining == 0
        ? WatchStrings.text(.complicationAllDone, locale: locale)
        : WatchStrings.tasksLeftSummary(count: remaining, locale: locale),
      topTaskTitle: top?.name,
      topTaskPriority: top?.priority ?? .none,
      hasOverdue: hasOverdue
    )
  }
}
