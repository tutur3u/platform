import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/tasks_boards/utils/task_timeline_window.dart';
import 'package:mobile/features/tasks_boards/widgets/timeline/task_timeline_day_strip.dart';
import 'package:mobile/features/tasks_boards/widgets/timeline/task_timeline_metrics.dart';
import 'package:mobile/l10n/l10n.dart';

/// "Nov 16 – 22", "Nov 30 – Dec 6", or with years when they differ.
String taskTimelineRangeLabel(TaskTimelineWindow window, String locale) {
  final start = window.start;
  final end = window.end;
  if (start.year != end.year) {
    final format = DateFormat.yMMMd(locale);
    return '${format.format(start)} – ${format.format(end)}';
  }
  final startLabel = DateFormat.MMMd(locale).format(start);
  final endLabel = start.month == end.month
      ? DateFormat.d(locale).format(end)
      : DateFormat.MMMd(locale).format(end);
  return '$startLabel – $endLabel';
}

/// The timeline's part of the page header, directly under the shell title:
/// the span control, the range with a Today button while the window leaves
/// today, and the day strip that doubles as the body's axis. It draws no edge
/// or shadow; the shell adds the one hairline below it once the body scrolls.
class TaskTimelineHeader extends StatelessWidget {
  const TaskTimelineHeader({
    required this.window,
    required this.today,
    required this.metrics,
    required this.onSpanChanged,
    required this.onShift,
    required this.onCentre,
    this.onToday,
    super.key,
  });

  final TaskTimelineWindow window;
  final DateTime today;
  final TaskTimelineMetrics metrics;

  /// Shows Week, 2 weeks or Month around the current range.
  final ValueChanged<TaskTimelineSpan> onSpanChanged;

  /// Moves the window by whole spans; negative goes back.
  final ValueChanged<int> onShift;

  /// Recentres the window on a tapped day.
  final ValueChanged<DateTime> onCentre;

  /// Returns to the window holding today; null hides the button.
  final VoidCallback? onToday;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    return KeyedSubtree(
      key: const ValueKey('task-timeline-header'),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: EdgeInsets.fromLTRB(
              metrics.inset,
              AppSpacing.xs,
              metrics.inset,
              0,
            ),
            child: Semantics(
              container: true,
              label: l10n.taskTimelineRangeTitle,
              child: AppSegmentedControl<TaskTimelineSpan>(
                key: const ValueKey('task-timeline-span-control'),
                segments: [
                  AppSegment(
                    value: TaskTimelineSpan.week,
                    label: l10n.taskTimelineRangeWeek,
                  ),
                  AppSegment(
                    value: TaskTimelineSpan.twoWeeks,
                    label: l10n.taskTimelineRangeTwoWeeks,
                  ),
                  AppSegment(
                    value: TaskTimelineSpan.month,
                    label: l10n.taskTimelineRangeMonth,
                  ),
                ],
                selected: window.span,
                onChanged: (span) {
                  if (span != window.span) onSpanChanged(span);
                },
              ),
            ),
          ),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: metrics.inset),
            // Holds the Today button's height, so the strip never moves
            // when the button appears.
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: kAppMinTapTarget),
              child: Row(
                children: [
                  Expanded(
                    child: Semantics(
                      header: true,
                      child: Text(
                        taskTimelineRangeLabel(window, l10n.localeName),
                        key: const ValueKey('task-timeline-range-label'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: tokens.typography.base.copyWith(
                          color: tokens.colorScheme.foreground,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                  if (onToday case final onToday?)
                    AppButton.ghost(
                      key: const ValueKey('task-timeline-today-button'),
                      size: AppButtonSize.small,
                      density: AppButtonDensity.compact,
                      onPressed: onToday,
                      child: Text(
                        l10n.taskTimelineTodayButton,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                ],
              ),
            ),
          ),
          TaskTimelineDayStrip(
            window: window,
            today: today,
            metrics: metrics,
            onShift: onShift,
            onCentre: onCentre,
          ),
        ],
      ),
    );
  }
}
