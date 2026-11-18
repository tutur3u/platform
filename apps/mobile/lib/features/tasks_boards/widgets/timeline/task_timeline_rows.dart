import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
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
      child: GestureDetector(
        key: ValueKey('task-timeline-row-${bar.task.id}'),
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
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
