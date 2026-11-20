import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/features/tasks_boards/utils/task_timeline_projection.dart';
import 'package:mobile/features/tasks_boards/widgets/timeline/task_timeline_caption_row.dart';
import 'package:mobile/features/tasks_boards/widgets/timeline/task_timeline_grid_painter.dart';
import 'package:mobile/features/tasks_boards/widgets/timeline/task_timeline_metrics.dart';
import 'package:mobile/features/tasks_boards/widgets/timeline/task_timeline_rows.dart';
import 'package:mobile/l10n/l10n.dart';

/// The bars under the day strip: a painted day grid behind one lazily built
/// list of captions and task rows.
class TaskTimelineBody extends StatelessWidget {
  const TaskTimelineBody({
    required this.projection,
    required this.metrics,
    required this.viewportLeft,
    required this.viewportWidth,
    required this.listNames,
    required this.listColors,
    required this.scrollController,
    required this.onTaskTap,
    this.onBarShift,
    this.tall = false,
    this.footer,
    super.key,
  });

  final TaskTimelineProjection projection;
  final TaskTimelineMetrics metrics;
  final double viewportLeft;
  final double viewportWidth;
  final Map<String, String> listNames;
  final Map<String, Color> listColors;
  final ScrollController scrollController;
  final ValueChanged<TaskBoardTask> onTaskTap;
  final Future<void> Function(TaskBoardTask task, int columnDelta)? onBarShift;

  /// Tablet rows: full-height bars with titles inside.
  final bool tall;

  /// Shown after the last row, such as a paging indicator.
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    final window = projection.window;
    final todayColumn = window.contains(projection.today)
        ? window.columnOf(projection.today)
        : null;
    final rows = projection.rows;
    final footer = this.footer;
    final l10n = context.l10n;
    return Stack(
      children: [
        Positioned.fill(
          child: CustomPaint(
            key: const ValueKey('task-timeline-grid'),
            painter: TaskTimelineGridPainter(
              metrics: metrics,
              todayColumn: todayColumn,
              lineColor: c.border.withValues(alpha: 0.5),
              todayFill: c.muted.withValues(alpha: 0.5),
              todayLine: c.mutedForeground.withValues(alpha: 0.6),
            ),
          ),
        ),
        ListView.builder(
          key: const ValueKey('task-timeline-body'),
          controller: scrollController,
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.only(
            top: AppSpacing.xs,
            bottom:
                AppPageInsets.contentBottomClearance(context) +
                AppLayout.scrollEndGap,
          ),
          itemCount: rows.length + (footer == null ? 0 : 1),
          itemBuilder: (context, index) {
            if (index == rows.length) {
              return Padding(padding: _viewportPadding, child: footer);
            }
            return switch (rows[index]) {
              final TaskTimelineCaption caption => Padding(
                padding: _viewportPadding,
                child: TaskTimelineCaptionRow(
                  caption: caption,
                  metrics: metrics,
                  label: caption.isOverdue
                      ? l10n.taskTimelineOverdueCount(caption.overdueCount!)
                      : listNames[caption.listId] ?? '',
                ),
              ),
              final TaskTimelineLane lane => TaskTimelineLaneRow(
                bars: lane.bars,
                metrics: metrics,
                viewportLeft: viewportLeft,
                viewportWidth: viewportWidth,
                tall: tall,
                listColors: listColors,
                onTaskTap: onTaskTap,
                onBarShift: onBarShift,
              ),
              final TaskTimelineBar bar => TaskTimelineBarRow(
                bar: bar,
                metrics: metrics,
                viewportLeft: viewportLeft,
                viewportWidth: viewportWidth,
                tall: tall,
                color: listColors[bar.task.listId] ?? c.mutedForeground,
                onTap: () => onTaskTap(bar.task),
                onBarShift: onBarShift == null
                    ? null
                    : (delta) => onBarShift!(bar.task, delta),
              ),
            };
          },
        ),
      ],
    );
  }

  EdgeInsets get _viewportPadding => EdgeInsets.only(
    left: viewportLeft,
    right: (metrics.width - viewportLeft - viewportWidth).clamp(
      0,
      double.infinity,
    ),
  );
}
