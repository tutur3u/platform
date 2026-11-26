import SwiftUI
import TuturuuuWatchKit
import WidgetKit

struct TasksLeftEntry: TimelineEntry {
  let date: Date
  let model: TasksLeftComplicationModel
  let locale: WatchLocale
}

struct TasksLeftTimelineProvider: TimelineProvider {
  private func loadStore() -> AppGroupWatchSnapshotStore {
    let groupId = Bundle.main.object(forInfoDictionaryKey: "WatchAppGroupIdentifier") as? String
    return AppGroupWatchSnapshotStore(appGroupIdentifier: groupId)
  }

  private func makeEntry(at date: Date) -> TasksLeftEntry {
    let store = loadStore()
    let metadata = store.readMetadata()
    let snapshot = store.readSnapshot()
    let locale = metadata?.locale ?? .systemDefault
    let model = TasksLeftComplicationModel.make(
      snapshot: snapshot,
      isSignedIn: metadata != nil,
      now: date,
      locale: locale
    )
    return TasksLeftEntry(date: date, model: model, locale: locale)
  }

  func placeholder(in context: Context) -> TasksLeftEntry {
    let locale = WatchLocale.systemDefault
    return TasksLeftEntry(
      date: Date(),
      model: TasksLeftComplicationModel(
        isSignedIn: true,
        remainingCount: 3,
        totalCount: 5,
        summaryText: WatchStrings.tasksLeftSummary(count: 3, locale: locale),
        topTaskTitle: WatchStrings.text(.priorityTasksSection, locale: locale),
        topTaskPriority: .high,
        hasOverdue: false
      ),
      locale: locale
    )
  }

  func getSnapshot(in context: Context, completion: @escaping (TasksLeftEntry) -> Void) {
    completion(makeEntry(at: Date()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<TasksLeftEntry>) -> Void) {
    let now = Date()
    let entry = makeEntry(at: now)
    let refreshDate = Calendar.current.date(byAdding: .minute, value: 30, to: now)
      ?? now.addingTimeInterval(1800)
    completion(Timeline(entries: [entry], policy: .after(refreshDate)))
  }
}

struct TasksLeftWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: TasksLeftEntry

  var body: some View {
    let hue = entry.model.hasOverdue
      ? SorbetWatchPalette.red
      : (entry.model.remainingCount == 0 ? SorbetWatchPalette.green : SorbetWatchPalette.hue(for: entry.model.topTaskPriority))

    switch family {
    case .accessoryCircular:
      Gauge(value: entry.model.completionFraction) {
        Image(systemName: "checkmark")
      } currentValueLabel: {
        Text("\(entry.model.remainingCount)")
          .font(.system(.title3, design: .monospaced).weight(.bold))
          .monospacedDigit()
      }
      .gaugeStyle(.accessoryCircular)
      .tint(hue.ink.color)
      .containerBackground(SorbetWatchPalette.background.color, for: .widget)
    case .accessoryCorner:
      Text("\(entry.model.remainingCount)")
        .font(.system(.title3, design: .monospaced).weight(.bold))
        .foregroundStyle(hue.ink.color)
        .widgetCurvesContent()
        .widgetLabel {
          Text(entry.model.summaryText)
        }
    case .accessoryInline:
      Text(entry.model.summaryText)
    default:
      VStack(alignment: .leading, spacing: 2) {
        HStack(spacing: 4) {
          Circle()
            .fill(hue.ink.color)
            .frame(width: 6, height: 6)
          Text(entry.model.summaryText)
            .font(.system(size: 11, weight: .bold, design: .rounded))
            .foregroundStyle(hue.ink.color)
            .lineLimit(1)
        }
        if let topTask = entry.model.topTaskTitle {
          Text(topTask)
            .font(.system(.footnote, design: .rounded).weight(.semibold))
            .foregroundStyle(SorbetWatchPalette.foreground.color)
            .lineLimit(2)
        } else {
          Text(WatchStrings.text(.noTasksToday, locale: entry.locale))
            .font(.system(.caption, design: .rounded))
            .foregroundStyle(SorbetWatchPalette.mutedForeground.color)
            .lineLimit(1)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .containerBackground(SorbetWatchPalette.background.color, for: .widget)
    }
  }
}

struct TasksLeftWidget: Widget {
  static let kind = "com.tuturuuu.watch.tasks-left"

  var body: some WidgetConfiguration {
    let locale = WatchLocale.systemDefault
    return StaticConfiguration(kind: Self.kind, provider: TasksLeftTimelineProvider()) { entry in
      TasksLeftWidgetView(entry: entry)
    }
    .configurationDisplayName(WatchStrings.text(.complicationTasksLeftTitle, locale: locale))
    .description(WatchStrings.text(.complicationTasksLeftDesc, locale: locale))
    .supportedFamilies([.accessoryCircular, .accessoryCorner, .accessoryInline, .accessoryRectangular])
  }
}
