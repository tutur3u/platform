import SwiftUI
import TuturuuuWatchKit
import WidgetKit

struct NextEventEntry: TimelineEntry {
  let date: Date
  let model: NextEventComplicationModel
  let locale: WatchLocale
}

struct NextEventTimelineProvider: TimelineProvider {
  private func loadStore() -> AppGroupWatchSnapshotStore {
    let groupId = Bundle.main.object(forInfoDictionaryKey: "WatchAppGroupIdentifier") as? String
    return AppGroupWatchSnapshotStore(appGroupIdentifier: groupId)
  }

  private func makeEntry(at date: Date) -> NextEventEntry {
    let store = loadStore()
    let metadata = store.readMetadata()
    let snapshot = store.readSnapshot()
    let locale = metadata?.locale ?? .systemDefault
    let isSignedIn = metadata != nil
    let model = NextEventComplicationModel.make(
      snapshot: snapshot,
      isSignedIn: isSignedIn,
      now: date,
      locale: locale
    )
    return NextEventEntry(date: date, model: model, locale: locale)
  }

  func placeholder(in context: Context) -> NextEventEntry {
    let locale = WatchLocale.systemDefault
    return NextEventEntry(
      date: Date(),
      model: NextEventComplicationModel(
        isSignedIn: true,
        title: WatchStrings.text(.nextEventsSection, locale: locale),
        timeLabel: "14:00",
        location: nil,
        calendarColor: "blue",
        isAllDay: false
      ),
      locale: locale
    )
  }

  func getSnapshot(in context: Context, completion: @escaping (NextEventEntry) -> Void) {
    completion(makeEntry(at: Date()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<NextEventEntry>) -> Void) {
    let now = Date()
    let store = loadStore()
    let snapshot = store.readSnapshot()
    var dates: [Date] = [now]

    if let events = snapshot?.upcomingEvents(after: now, limit: 4) {
      for event in events {
        if event.startAt > now { dates.append(event.startAt) }
        if event.endAt > now { dates.append(event.endAt) }
      }
    }

    let sortedDates = Array(Set(dates)).sorted().prefix(6)
    let entries = sortedDates.map { makeEntry(at: $0) }
    let refreshDate = Calendar.current.date(byAdding: .minute, value: 30, to: now)
      ?? now.addingTimeInterval(1800)
    completion(Timeline(entries: entries, policy: .after(refreshDate)))
  }
}

struct NextEventWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: NextEventEntry

  var body: some View {
    let hue = SorbetWatchPalette.hue(forCalendarColor: entry.model.calendarColor)

    switch family {
    case .accessoryInline:
      if let time = entry.model.timeLabel {
        Text("\(time) \(entry.model.title)")
      } else {
        Text(entry.model.title)
      }
    case .accessoryCorner:
      Text(entry.model.timeLabel ?? "--:--")
        .font(.system(.caption, design: .monospaced).weight(.bold))
        .foregroundStyle(hue.ink.color)
        .widgetCurvesContent()
        .widgetLabel {
          Text(entry.model.title)
        }
    default:
      VStack(alignment: .leading, spacing: 2) {
        HStack(spacing: 4) {
          Circle()
            .fill(hue.ink.color)
            .frame(width: 6, height: 6)
          Text(
            entry.model.timeLabel
              ?? WatchStrings.text(.nextEventsSection, locale: entry.locale)
          )
          .font(.system(size: 11, weight: .bold, design: .monospaced))
          .foregroundStyle(hue.ink.color)
          .monospacedDigit()
          .lineLimit(1)
        }
        Text(entry.model.title)
          .font(.system(.footnote, design: .rounded).weight(.bold))
          .foregroundStyle(SorbetWatchPalette.foreground.color)
          .lineLimit(2)
        if let location = entry.model.location {
          Text(location)
            .font(.system(.caption2, design: .rounded))
            .foregroundStyle(SorbetWatchPalette.mutedForeground.color)
            .lineLimit(1)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .containerBackground(SorbetWatchPalette.background.color, for: .widget)
    }
  }
}

struct NextEventWidget: Widget {
  static let kind = "com.tuturuuu.watch.next-event"

  var body: some WidgetConfiguration {
    let locale = WatchLocale.systemDefault
    return StaticConfiguration(kind: Self.kind, provider: NextEventTimelineProvider()) { entry in
      NextEventWidgetView(entry: entry)
    }
    .configurationDisplayName(WatchStrings.text(.complicationNextEventTitle, locale: locale))
    .description(WatchStrings.text(.complicationNextEventDesc, locale: locale))
    .supportedFamilies([.accessoryRectangular, .accessoryInline, .accessoryCorner])
  }
}
