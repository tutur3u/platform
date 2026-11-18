import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
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
/// the range button, a Today button while the window leaves today, and the
/// day strip that doubles as the body's axis. It draws no edge or shadow;
/// the shell adds the one hairline below it once the body scrolls.
class TaskTimelineHeader extends StatelessWidget {
  const TaskTimelineHeader({
    required this.window,
    required this.today,
    required this.metrics,
    required this.onRangePressed,
    required this.onShift,
    required this.onCentre,
    this.onToday,
    super.key,
  });

  final TaskTimelineWindow window;
  final DateTime today;
  final TaskTimelineMetrics metrics;
  final VoidCallback onRangePressed;

  /// Moves the window by whole spans; negative goes back.
  final ValueChanged<int> onShift;

  /// Recentres the window on a tapped day.
  final ValueChanged<DateTime> onCentre;

  /// Returns to the window holding today; null hides the button.
  final VoidCallback? onToday;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
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
              AppSpacing.xs,
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (onToday case final onToday?) ...[
                  Flexible(
                    child: AppButton.ghost(
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
                  ),
                  const SizedBox(width: AppSpacing.xs),
                ],
                Flexible(
                  flex: 2,
                  child: AppButton.secondary(
                    key: const ValueKey('task-timeline-range-button'),
                    size: AppButtonSize.small,
                    density: AppButtonDensity.compact,
                    onPressed: onRangePressed,
                    trailing: const Icon(LucideIcons.chevronDown),
                    child: Text(
                      taskTimelineRangeLabel(window, l10n.localeName),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
              ],
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
