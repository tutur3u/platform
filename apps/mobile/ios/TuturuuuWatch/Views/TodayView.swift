import SwiftUI
import TuturuuuWatchKit

struct TodayView: View {
  @ObservedObject var viewModel: WatchAppViewModel
  @State private var showQuickCapture = false
  @State private var showMira = false

  var body: some View {
    Group {
      if !viewModel.isSignedIn {
        SignedOutView(viewModel: viewModel)
      } else {
        ScrollView {
          snapshotContent
        }
        .background(SorbetWatchPalette.background.color.ignoresSafeArea())
        .navigationTitle(viewModel.text(.todayTitle))
        .toolbar {
          ToolbarItem(placement: .topBarTrailing) {
            Button {
              Task { await viewModel.refreshToday() }
            } label: {
              Image(systemName: "arrow.clockwise")
                .font(.caption.weight(.semibold))
            }
            .accessibilityLabel(viewModel.text(.refreshAction))
          }
        }
        .sheet(isPresented: $showQuickCapture) {
          QuickCaptureView(viewModel: viewModel)
        }
        .sheet(isPresented: $showMira) {
          MiraQuickAskView(viewModel: viewModel)
        }
        .task {
          await viewModel.refreshToday()
        }
      }
    }
  }

  /// Pure SwiftUI content stack shared by live runtime and simulator snapshot tests.
  var snapshotContent: some View {
    VStack(alignment: .leading, spacing: 10) {
      summaryHeader
      actionStrip
      nextEventsSection
      priorityTasksSection
    }
    .padding(.horizontal, 4)
    .padding(.bottom, 12)
  }

  private var summaryHeader: some View {
    let remaining = viewModel.snapshot?.remainingTasksCount ?? 0
    let summary = WatchStrings.tasksLeftSummary(count: remaining, locale: viewModel.locale)
    let workspace = viewModel.metadata?.workspaceName ?? viewModel.text(.appTitle)

    return HStack(spacing: 8) {
      VStack(alignment: .leading, spacing: 2) {
        Text(workspace)
          .font(.system(.caption2, design: .rounded).weight(.semibold))
          .foregroundStyle(SorbetWatchPalette.mutedForeground.color)
          .lineLimit(1)
        Text(summary)
          .font(.system(.headline, design: .rounded).weight(.bold))
          .foregroundStyle(SorbetWatchPalette.foreground.color)
          .lineLimit(1)
      }
      Spacer(minLength: 4)
      if viewModel.isLoading {
        ProgressView()
          .tint(SorbetWatchPalette.blue.ink.color)
      }
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 8)
    .background(
      RoundedRectangle(cornerRadius: SorbetWatchPalette.cardCornerRadius, style: .continuous)
        .fill(SorbetWatchPalette.surface.color)
    )
  }

  private var actionStrip: some View {
    HStack(spacing: 6) {
      Button {
        showQuickCapture = true
      } label: {
        Label(viewModel.text(.quickCaptureAction), systemImage: "plus")
          .font(.system(.caption2, design: .rounded).weight(.bold))
          .lineLimit(1)
          .frame(maxWidth: .infinity)
          .padding(.vertical, 8)
      }
      .buttonStyle(.plain)
      .foregroundStyle(SorbetWatchPalette.primaryForeground.color)
      .background(Capsule().fill(SorbetWatchPalette.primary.color))

      Button {
        showMira = true
      } label: {
        Label(viewModel.text(.miraTitle), systemImage: "sparkles")
          .font(.system(.caption2, design: .rounded).weight(.bold))
          .lineLimit(1)
          .frame(maxWidth: .infinity)
          .padding(.vertical, 8)
      }
      .buttonStyle(.plain)
      .foregroundStyle(SorbetWatchPalette.blue.ink.color)
      .background(
        Capsule().fill(SorbetWatchPalette.blue.activeFill(calmColors: viewModel.calmColors).color)
      )
    }
  }

  private var nextEventsSection: some View {
    let now = Date()
    let events = viewModel.snapshot?.upcomingEvents(after: now, limit: 3) ?? []

    return VStack(alignment: .leading, spacing: 6) {
      sectionHeader(viewModel.text(.nextEventsSection), hue: SorbetWatchPalette.blue)

      if events.isEmpty {
        emptyCard(viewModel.text(.noEventsToday))
      } else {
        ForEach(events) { event in
          eventRow(event)
        }
      }
    }
  }

  private var priorityTasksSection: some View {
    let now = Date()
    let tasks = Array((viewModel.snapshot?.prioritizedTasks(now: now) ?? []).prefix(6))

    return VStack(alignment: .leading, spacing: 6) {
      sectionHeader(viewModel.text(.priorityTasksSection), hue: SorbetWatchPalette.green)

      if tasks.isEmpty {
        emptyCard(viewModel.text(.noTasksToday))
      } else {
        ForEach(tasks) { task in
          taskRow(task, now: now)
        }
      }

      if let statusMessage = viewModel.statusMessage {
        Text(statusMessage)
          .font(.system(.caption2, design: .rounded).weight(.semibold))
          .foregroundStyle(SorbetWatchPalette.mutedForeground.color)
          .padding(.horizontal, 6)
      }
    }
  }

  private func sectionHeader(_ title: String, hue: SorbetWatchHue) -> some View {
    HStack(spacing: 5) {
      Circle()
        .fill(hue.ink.color)
        .frame(width: 6, height: 6)
      Text(title.uppercased())
        .font(.system(size: 10, weight: .bold, design: .monospaced))
        .foregroundStyle(SorbetWatchPalette.mutedForeground.color)
        .lineLimit(1)
    }
    .padding(.horizontal, 4)
    .padding(.top, 2)
  }

  private func eventRow(_ event: WatchCalendarEvent) -> some View {
    let hue = SorbetWatchPalette.hue(forCalendarColor: event.color)
    let timeText = event.isAllDay
      ? viewModel.text(.allDay)
      : "\(WatchStrings.format24HourTime(event.startAt))–\(WatchStrings.format24HourTime(event.endAt))"

    return VStack(alignment: .leading, spacing: 3) {
      Text(timeText)
        .font(.system(size: 11, weight: .bold, design: .monospaced))
        .foregroundStyle(hue.ink.color)
        .monospacedDigit()
      Text(event.title)
        .font(.system(.footnote, design: .rounded).weight(.semibold))
        .foregroundStyle(SorbetWatchPalette.foreground.color)
        .lineLimit(2)
      if let location = event.location {
        Text(location)
          .font(.system(.caption2, design: .rounded))
          .foregroundStyle(SorbetWatchPalette.mutedForeground.color)
          .lineLimit(1)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 10)
    .padding(.vertical, 8)
    .background(
      RoundedRectangle(cornerRadius: SorbetWatchPalette.rowCornerRadius, style: .continuous)
        .fill(hue.activeFill(calmColors: true).color)
    )
  }

  private func taskRow(_ task: WatchTaskItem, now: Date) -> some View {
    let isOverdue = task.isOverdue(relativeTo: now)
    let hue = isOverdue ? SorbetWatchPalette.red : SorbetWatchPalette.hue(for: task.priority)
    let isCompleting = viewModel.completingTaskIds.contains(task.id)
    let badgeText = isOverdue
      ? viewModel.text(.overdue)
      : WatchStrings.priorityLabel(task.priority, locale: viewModel.locale)

    return Button {
      Task { await viewModel.markTaskDone(task) }
    } label: {
      HStack(alignment: .top, spacing: 8) {
        Image(systemName: isCompleting ? "checkmark.circle.fill" : "circle")
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(isCompleting ? SorbetWatchPalette.green.ink.color : hue.ink.color)
          .padding(.top, 1)

        VStack(alignment: .leading, spacing: 3) {
          Text(task.name)
            .font(.system(.footnote, design: .rounded).weight(.semibold))
            .foregroundStyle(SorbetWatchPalette.foreground.color)
            .lineLimit(2)
            .multilineTextAlignment(.leading)

          if isOverdue || task.priority != .none {
            Text(badgeText)
              .font(.system(size: 10, weight: .bold, design: .rounded))
              .foregroundStyle(hue.ink.color)
              .padding(.horizontal, 6)
              .padding(.vertical, 2)
              .background(
                Capsule().fill(hue.activeFill(calmColors: viewModel.calmColors).color)
              )
          }
        }
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 10)
      .padding(.vertical, 8)
      .background(
        RoundedRectangle(cornerRadius: SorbetWatchPalette.rowCornerRadius, style: .continuous)
          .fill(SorbetWatchPalette.surface.color)
      )
    }
    .buttonStyle(.plain)
    .disabled(isCompleting)
  }

  private func emptyCard(_ message: String) -> some View {
    Text(message)
      .font(.system(.caption, design: .rounded))
      .foregroundStyle(SorbetWatchPalette.mutedForeground.color)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 10)
      .padding(.vertical, 10)
      .background(
        RoundedRectangle(cornerRadius: SorbetWatchPalette.rowCornerRadius, style: .continuous)
          .fill(SorbetWatchPalette.surfaceSunken.color)
      )
  }
}

struct SignedOutView: View {
  @ObservedObject var viewModel: WatchAppViewModel

  var body: some View {
    ScrollView {
      snapshotContent
    }
    .background(SorbetWatchPalette.background.color.ignoresSafeArea())
    .navigationTitle(viewModel.text(.appTitle))
  }

  var snapshotContent: some View {
    VStack(alignment: .leading, spacing: 10) {
      Image(systemName: "iphone.and.arrow.forward")
        .font(.title3)
        .foregroundStyle(SorbetWatchPalette.blue.ink.color)
        .padding(8)
        .background(Circle().fill(SorbetWatchPalette.blue.fill.color))

      Text(viewModel.text(.signedOutTitle))
        .font(.system(.headline, design: .rounded).weight(.bold))
        .foregroundStyle(SorbetWatchPalette.foreground.color)

      Text(viewModel.text(.signedOutBody))
        .font(.system(.caption, design: .rounded))
        .foregroundStyle(SorbetWatchPalette.mutedForeground.color)

      Button {
        Task { await viewModel.syncFromPhone() }
      } label: {
        HStack(spacing: 6) {
          if viewModel.isSyncingPhone {
            ProgressView()
              .tint(SorbetWatchPalette.primaryForeground.color)
          }
          Text(viewModel.isSyncingPhone ? viewModel.text(.syncWaiting) : viewModel.text(.syncFromPhone))
            .font(.system(.caption, design: .rounded).weight(.bold))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
      }
      .buttonStyle(.plain)
      .foregroundStyle(SorbetWatchPalette.primaryForeground.color)
      .background(Capsule().fill(SorbetWatchPalette.primary.color))
      .disabled(viewModel.isSyncingPhone)
    }
    .padding(8)
  }
}
