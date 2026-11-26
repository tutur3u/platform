import Foundation

public enum WatchLocale: String, Codable, CaseIterable, Sendable, Equatable {
  case en
  case vi

  public init(languageCode: String?) {
    if let code = languageCode?.lowercased(), code.hasPrefix("vi") {
      self = .vi
    } else {
      self = .en
    }
  }

  public static var systemDefault: WatchLocale {
    WatchLocale(languageCode: Locale.preferredLanguages.first)
  }
}

public enum WatchStringKey: String, CaseIterable, Sendable {
  case appTitle
  case todayTitle
  case nextEventsSection
  case priorityTasksSection
  case noEventsToday
  case noTasksToday
  case allDay
  case overdue
  case quickCaptureAction
  case quickCaptureTitle
  case quickCapturePrompt
  case quickCaptureSave
  case quickCaptureSaved
  case quickCaptureFailed
  case miraAction
  case miraTitle
  case miraPrompt
  case miraThinking
  case miraAskAgain
  case miraError
  case signedOutTitle
  case signedOutBody
  case syncFromPhone
  case syncWaiting
  case refreshAction
  case taskCompleted
  case taskCompleteFailed
  case priorityUrgent
  case priorityHigh
  case priorityMedium
  case priorityLow
  case priorityNone
  case complicationNextEventTitle
  case complicationNextEventDesc
  case complicationTasksLeftTitle
  case complicationTasksLeftDesc
  case complicationNoEvents
  case complicationAllDone
  case complicationSignIn
}

/// Complete English and Vietnamese copy following Sorbet sentence-case voice (no emoji).
public enum WatchStrings {
  private static let english: [WatchStringKey: String] = [
    .appTitle: "Tuturuuu",
    .todayTitle: "Today",
    .nextEventsSection: "Next events",
    .priorityTasksSection: "Priority tasks",
    .noEventsToday: "No events left today",
    .noTasksToday: "Nothing due today",
    .allDay: "All day",
    .overdue: "Overdue",
    .quickCaptureAction: "Add task",
    .quickCaptureTitle: "New task",
    .quickCapturePrompt: "Dictate task title",
    .quickCaptureSave: "Save task",
    .quickCaptureSaved: "Task added",
    .quickCaptureFailed: "Could not add task",
    .miraAction: "Ask Mira",
    .miraTitle: "Mira",
    .miraPrompt: "Ask Mira anything",
    .miraThinking: "Mira is thinking...",
    .miraAskAgain: "Ask follow-up",
    .miraError: "Mira could not reply",
    .signedOutTitle: "Sign in on iPhone",
    .signedOutBody: "Open Tuturuuu on your iPhone to sync your workspace.",
    .syncFromPhone: "Sync from iPhone",
    .syncWaiting: "Syncing with iPhone...",
    .refreshAction: "Refresh",
    .taskCompleted: "Task marked done",
    .taskCompleteFailed: "Could not update task",
    .priorityUrgent: "Urgent",
    .priorityHigh: "High",
    .priorityMedium: "Medium",
    .priorityLow: "Low",
    .priorityNone: "None",
    .complicationNextEventTitle: "Next event",
    .complicationNextEventDesc: "Shows your next upcoming calendar event.",
    .complicationTasksLeftTitle: "Tasks left today",
    .complicationTasksLeftDesc: "Shows remaining priority tasks for today.",
    .complicationNoEvents: "No more events",
    .complicationAllDone: "All tasks done",
    .complicationSignIn: "Open iPhone app",
  ]

  private static let vietnamese: [WatchStringKey: String] = [
    .appTitle: "Tuturuuu",
    .todayTitle: "Hôm nay",
    .nextEventsSection: "Sự kiện tiếp theo",
    .priorityTasksSection: "Việc ưu tiên",
    .noEventsToday: "Hết lịch hôm nay",
    .noTasksToday: "Không có việc hôm nay",
    .allDay: "Cả ngày",
    .overdue: "Quá hạn",
    .quickCaptureAction: "Thêm việc",
    .quickCaptureTitle: "Việc mới",
    .quickCapturePrompt: "Đọc tên công việc",
    .quickCaptureSave: "Lưu việc",
    .quickCaptureSaved: "Đã thêm việc",
    .quickCaptureFailed: "Không thể thêm việc",
    .miraAction: "Hỏi Mira",
    .miraTitle: "Mira",
    .miraPrompt: "Hỏi Mira điều bạn cần",
    .miraThinking: "Mira đang trả lời...",
    .miraAskAgain: "Hỏi tiếp",
    .miraError: "Mira chưa thể trả lời",
    .signedOutTitle: "Đăng nhập trên iPhone",
    .signedOutBody: "Mở Tuturuuu trên iPhone để đồng bộ không gian làm việc.",
    .syncFromPhone: "Đồng bộ từ iPhone",
    .syncWaiting: "Đang đồng bộ với iPhone...",
    .refreshAction: "Làm mới",
    .taskCompleted: "Đã hoàn thành",
    .taskCompleteFailed: "Không thể cập nhật việc",
    .priorityUrgent: "Khẩn cấp",
    .priorityHigh: "Cao",
    .priorityMedium: "Trung bình",
    .priorityLow: "Thấp",
    .priorityNone: "Không",
    .complicationNextEventTitle: "Sự kiện tiếp theo",
    .complicationNextEventDesc: "Hiển thị sự kiện lịch sắp diễn ra.",
    .complicationTasksLeftTitle: "Việc còn lại hôm nay",
    .complicationTasksLeftDesc: "Hiển thị số công việc còn lại trong ngày.",
    .complicationNoEvents: "Hết lịch hôm nay",
    .complicationAllDone: "Đã xong hết việc",
    .complicationSignIn: "Mở app trên iPhone",
  ]

  public static func text(_ key: WatchStringKey, locale: WatchLocale) -> String {
    switch locale {
    case .en: return english[key] ?? key.rawValue
    case .vi: return vietnamese[key] ?? english[key] ?? key.rawValue
    }
  }

  public static func tasksLeftSummary(count: Int, locale: WatchLocale) -> String {
    switch locale {
    case .en:
      if count <= 0 { return "All caught up" }
      return count == 1 ? "1 left today" : "\(count) left today"
    case .vi:
      if count <= 0 { return "Đã xong hôm nay" }
      return "Còn \(count) việc hôm nay"
    }
  }

  public static func priorityLabel(_ priority: WatchTaskPriority, locale: WatchLocale) -> String {
    switch priority {
    case .critical: return text(.priorityUrgent, locale: locale)
    case .high: return text(.priorityHigh, locale: locale)
    case .normal: return text(.priorityMedium, locale: locale)
    case .low: return text(.priorityLow, locale: locale)
    case .none: return text(.priorityNone, locale: locale)
    }
  }

  public static func format24HourTime(_ date: Date, timeZone: TimeZone = .current) -> String {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_GB")
    formatter.timeZone = timeZone
    formatter.dateFormat = "HH:mm"
    return formatter.string(from: date)
  }

  public static var allEnglishKeys: Set<WatchStringKey> { Set(english.keys) }
  public static var allVietnameseKeys: Set<WatchStringKey> { Set(vietnamese.keys) }
}
