import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/tasks_boards/utils/task_timeline_window.dart';
import 'package:mobile/features/tasks_boards/widgets/timeline/task_timeline_metrics.dart';
import 'package:mobile/l10n/l10n.dart';

/// The header's day strip: one cell per column, aligned with the body.
/// Swiping moves the window by a span; tapping a day recentres on it.
class TaskTimelineDayStrip extends StatefulWidget {
  const TaskTimelineDayStrip({
    required this.window,
    required this.today,
    required this.metrics,
    required this.onShift,
    required this.onCentre,
    super.key,
  });

  final TaskTimelineWindow window;
  final DateTime today;
  final TaskTimelineMetrics metrics;
  final ValueChanged<int> onShift;
  final ValueChanged<DateTime> onCentre;

  @override
  State<TaskTimelineDayStrip> createState() => _DayStripState();
}

class _DayStripState extends State<TaskTimelineDayStrip> {
  static const double _swipeDistance = 48;
  static const double _swipeVelocity = 300;
  double _drag = 0;

  @override
  Widget build(BuildContext context) {
    final metrics = widget.metrics;
    final narrow = metrics.columnWidth < 22;
    final compact = metrics.columnWidth < 28;
    return GestureDetector(
      key: const ValueKey('task-timeline-day-strip'),
      behavior: HitTestBehavior.opaque,
      onHorizontalDragStart: (_) => _drag = 0,
      onHorizontalDragUpdate: (details) => _drag += details.delta.dx,
      onHorizontalDragEnd: (details) {
        final velocity = details.primaryVelocity ?? 0;
        if (_drag.abs() >= _swipeDistance || velocity.abs() >= _swipeVelocity) {
          widget.onShift((_drag + velocity) < 0 ? 1 : -1);
        }
        _drag = 0;
      },
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: metrics.inset),
        child: Row(
          children: [
            for (var column = 0; column < metrics.days; column++)
              SizedBox(
                width: metrics.columnWidth,
                child: _DayCell(
                  day: widget.window.dayAt(column),
                  isToday: widget.window.dayAt(column) == widget.today,
                  narrow: narrow,
                  compact: compact,
                  onTap: () => widget.onCentre(widget.window.dayAt(column)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({
    required this.day,
    required this.isToday,
    required this.narrow,
    required this.compact,
    required this.onTap,
  });

  final DateTime day;
  final bool isToday;

  final bool narrow;
  final bool compact;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final locale = context.l10n.localeName;
    final weekday = DateFormat.EEEEE(locale).format(day);
    final numberStyle =
        (compact ? tokens.typography.xSmall : tokens.typography.small).copyWith(
          fontSize: narrow ? 10 : null,
          fontWeight: isToday ? FontWeight.w700 : FontWeight.w500,
          color: isToday ? c.background : c.foreground,
          fontFeatures: const [FontFeature.tabularFigures()],
        );
    final diameter = compact ? (narrow ? 20.0 : 22.0) : 30.0;
    return Semantics(
      button: true,
      selected: isToday,
      label: DateFormat.MMMMEEEEd(locale).format(day),
      excludeSemantics: true,
      child: GestureDetector(
        key: ValueKey(
          'task-timeline-day-${DateFormat('yyyy-MM-dd').format(day)}',
        ),
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  weekday,
                  maxLines: 1,
                  overflow: TextOverflow.clip,
                  style: tokens.typography.xSmall.copyWith(
                    fontSize: narrow ? 9 : null,
                    color: isToday ? c.foreground : c.mutedForeground,
                    fontWeight: isToday ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.xxs),
              Container(
                width: diameter,
                height: diameter,
                alignment: Alignment.center,
                decoration: isToday
                    ? BoxDecoration(color: c.foreground, shape: BoxShape.circle)
                    : null,
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(
                    '${day.day}',
                    maxLines: 1,
                    softWrap: false,
                    overflow: TextOverflow.visible,
                    style: numberStyle,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
