import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/features/tasks_boards/utils/task_timeline_projection.dart';
import 'package:mobile/features/tasks_boards/widgets/timeline/task_timeline_metrics.dart';
import 'package:mobile/l10n/l10n.dart';

/// One task: its title over a thin bar on phones, or a full-height bar with
/// the title inside (when it spans three days or more) on tablets.
class TaskTimelineBarRow extends StatelessWidget {
  const TaskTimelineBarRow({
    required this.bar,
    required this.color,
    required this.metrics,
    required this.onTap,
    this.tall = false,
    this.onBarShift,
    super.key,
  });

  static const double thinBarHeight = 6;
  static const double tallBarHeight = 36;

  /// Title room kept before the right edge when a bar starts late.
  static const double minTitleWidth = 120;

  final TaskTimelineBar bar;

  /// The list colour; overdue bars use the destructive token instead.
  final Color color;
  final TaskTimelineMetrics metrics;
  final VoidCallback onTap;
  final bool tall;
  final Future<void> Function(int columnDelta)? onBarShift;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final l10n = context.l10n;
    final accent = bar.overdue ? c.destructive : color;
    final title = bar.task.name?.trim().isNotEmpty == true
        ? bar.task.name!.trim()
        : l10n.taskBoardDetailUntitledTask;
    final titleStyle = tokens.typography.small.copyWith(
      color: c.foreground,
      fontWeight: FontWeight.w500,
      decoration: bar.done ? TextDecoration.lineThrough : null,
      decorationColor: c.mutedForeground,
    );
    final late = bar.overdue
        ? Text(
            tall
                ? l10n.taskTimelineDaysLateLong(bar.daysLate)
                : l10n.taskTimelineDaysLate(bar.daysLate),
            maxLines: 1,
            style: tokens.typography.xSmall.copyWith(
              color: c.destructive,
              fontWeight: FontWeight.w700,
            ),
          )
        : null;
    final barLeft = metrics.left(bar.firstColumn);
    final barWidth = math.max(
      metrics.columnWidth * bar.columnSpan - 2,
      thinBarHeight,
    );
    final row = tall
        ? _tallRow(context, title, titleStyle, late, accent, barLeft, barWidth)
        : _thinRow(title, titleStyle, late, accent, barLeft, barWidth);
    return Semantics(
      button: true,
      label: title,
      child: _TimelineBarInteractions(
        taskId: bar.task.id,
        metrics: metrics,
        columnSpan: bar.columnSpan,
        enabled: onBarShift != null && !bar.done,
        onTap: onTap,
        onBarShift: onBarShift,
        child: Opacity(opacity: bar.done ? 0.5 : 1, child: row),
      ),
    );
  }

  Widget _thinRow(
    String title,
    TextStyle titleStyle,
    Widget? late,
    Color accent,
    double barLeft,
    double barWidth,
  ) {
    final titleLeft = math.max(
      metrics.inset,
      math.min(barLeft, metrics.width - metrics.inset - minTitleWidth),
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: EdgeInsets.only(left: titleLeft, right: metrics.inset),
            child: _TitleLine(title: title, style: titleStyle, late: late),
          ),
          const SizedBox(height: AppSpacing.xs),
          Padding(
            padding: EdgeInsets.only(left: barLeft + 1),
            child: Container(
              key: ValueKey('task-timeline-bar-${bar.task.id}'),
              width: barWidth,
              height: thinBarHeight,
              decoration: BoxDecoration(
                color: accent,
                borderRadius: BorderRadius.circular(thinBarHeight / 2),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _tallRow(
    BuildContext context,
    String title,
    TextStyle titleStyle,
    Widget? late,
    Color accent,
    double barLeft,
    double barWidth,
  ) {
    final inside = bar.columnSpan >= 3;
    final surface = AppTokens.of(context).colorScheme.background;
    final box = ClipRRect(
      key: ValueKey('task-timeline-bar-${bar.task.id}'),
      borderRadius: BorderRadius.circular(AppRadius.xs),
      child: SizedBox(
        width: barWidth,
        height: tallBarHeight,
        child: ColoredBox(
          color: Color.alphaBlend(accent.withValues(alpha: 0.24), surface),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(width: 3, child: ColoredBox(color: accent)),
              if (inside)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.sm,
                    ),
                    child: Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: _TitleLine(
                        title: title,
                        style: titleStyle,
                        late: late,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
    final outsideWidth =
        metrics.width - metrics.inset - barLeft - barWidth - AppSpacing.sm;
    final titleAfter = outsideWidth >= minTitleWidth;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: SizedBox(
        height: tallBarHeight,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned(left: barLeft + 1, top: 0, child: box),
            if (!inside)
              Positioned(
                top: 0,
                bottom: 0,
                left: titleAfter
                    ? barLeft + barWidth + AppSpacing.sm
                    : metrics.inset,
                right: titleAfter
                    ? metrics.inset
                    : metrics.width - barLeft + AppSpacing.sm,
                child: Align(
                  alignment: titleAfter
                      ? AlignmentDirectional.centerStart
                      : AlignmentDirectional.centerEnd,
                  child: _TitleLine(
                    title: title,
                    style: titleStyle,
                    late: late,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _TimelineBarInteractions extends StatefulWidget {
  const _TimelineBarInteractions({
    required this.taskId,
    required this.metrics,
    required this.columnSpan,
    required this.enabled,
    required this.onTap,
    required this.onBarShift,
    required this.child,
  });

  final String taskId;
  final TaskTimelineMetrics metrics;
  final int columnSpan;
  final bool enabled;
  final VoidCallback onTap;
  final Future<void> Function(int columnDelta)? onBarShift;
  final Widget child;

  @override
  State<_TimelineBarInteractions> createState() =>
      _TimelineBarInteractionsState();
}

class _TimelineBarInteractionsState extends State<_TimelineBarInteractions> {
  double _dragDx = 0;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: ValueKey('task-timeline-row-${widget.taskId}'),
      behavior: HitTestBehavior.opaque,
      onTap: widget.onTap,
      onHorizontalDragStart: widget.enabled ? (_) => _dragDx = 0 : null,
      onHorizontalDragUpdate: widget.enabled
          ? (details) => _dragDx += details.delta.dx
          : null,
      onHorizontalDragEnd: widget.enabled
          ? (_) {
              final columnWidth = widget.metrics.columnWidth;
              if (columnWidth <= 0 || widget.onBarShift == null) return;
              final delta = (_dragDx / columnWidth).round();
              _dragDx = 0;
              if (delta != 0) {
                unawaited(widget.onBarShift!(delta));
              }
            }
          : null,
      child: widget.child,
    );
  }
}

/// Several non-overlapping bars on one horizontal lane.
class TaskTimelineLaneRow extends StatelessWidget {
  const TaskTimelineLaneRow({
    required this.bars,
    required this.metrics,
    required this.listColors,
    required this.onTaskTap,
    this.tall = false,
    this.onBarShift,
    super.key,
  });

  final List<TaskTimelineBar> bars;
  final TaskTimelineMetrics metrics;
  final Map<String, Color> listColors;
  final ValueChanged<TaskBoardTask> onTaskTap;
  final bool tall;
  final Future<void> Function(TaskBoardTask task, int columnDelta)? onBarShift;

  @override
  Widget build(BuildContext context) {
    if (bars.length == 1) {
      final bar = bars.single;
      final c = AppTokens.of(context).colorScheme;
      return TaskTimelineBarRow(
        bar: bar,
        metrics: metrics,
        tall: tall,
        color: listColors[bar.task.listId] ?? c.mutedForeground,
        onTap: () => onTaskTap(bar.task),
        onBarShift: onBarShift == null
            ? null
            : (delta) => onBarShift!(bar.task, delta),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final bar in bars)
          TaskTimelineBarRow(
            bar: bar,
            metrics: metrics,
            tall: tall,
            color:
                listColors[bar.task.listId] ??
                AppTokens.of(context).colorScheme.mutedForeground,
            onTap: () => onTaskTap(bar.task),
            onBarShift: onBarShift == null
                ? null
                : (delta) => onBarShift!(bar.task, delta),
          ),
      ],
    );
  }
}

class _TitleLine extends StatelessWidget {
  const _TitleLine({required this.title, required this.style, this.late});

  final String title;
  final TextStyle style;
  final Widget? late;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Flexible(
        child: Text(
          title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: style,
        ),
      ),
      if (late case final late?) ...[
        const SizedBox(width: AppSpacing.xs + AppSpacing.xxs),
        late,
      ],
    ],
  );
}
