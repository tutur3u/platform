import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/features/tasks_boards/utils/task_due_dates.dart';
import 'package:mobile/features/tasks_boards/utils/task_timeline_projection.dart';
import 'package:mobile/features/tasks_boards/utils/task_timeline_window.dart';
import 'package:mobile/features/tasks_boards/widgets/task_board_list_colors.dart';
import 'package:mobile/features/tasks_boards/widgets/timeline/task_timeline_body.dart';
import 'package:mobile/features/tasks_boards/widgets/timeline/task_timeline_empty.dart';
import 'package:mobile/features/tasks_boards/widgets/timeline/task_timeline_header.dart';
import 'package:mobile/features/tasks_boards/widgets/timeline/task_timeline_metrics.dart';
import 'package:mobile/l10n/l10n.dart';

/// The board timeline: a range header whose day strip is the axis, over
/// bars grouped by list with overdue work first.
///
/// Phones open on the current week, tablets (from the shell's tablet
/// breakpoint) on two weeks with full-height bars. "Today" is the day in
/// the user's timezone setting and re-anchors at its midnight. The
/// projection is memoised, so rebuilds that keep the tasks reuse it.
///
/// The header draws no edge of its own: once the body scrolls, the shell
/// draws one hairline at the top of the body's viewport, the bottom of the
/// composite header, and its scroll notifications keep the dock auto-hide.
class TaskTimelineView extends StatefulWidget {
  const TaskTimelineView({
    required this.lists,
    required this.tasksByList,
    required this.hasMoreTasks,
    required this.hasLoadError,
    required this.isLoadingMoreTasks,
    required this.scrollController,
    required this.onLoadMore,
    required this.onTaskTap,
    this.onShowUndated,
    this.clock = DateTime.now,
    super.key,
  });

  /// The board's lists in board order; groups follow it.
  final List<TaskBoardList> lists;
  final Map<String, List<TaskBoardTask>> tasksByList;

  /// Open lists still have unloaded pages: the view then never says a range
  /// is empty.
  final bool hasMoreTasks;
  final bool hasLoadError;
  final bool isLoadingMoreTasks;
  final ScrollController scrollController;
  final VoidCallback onLoadMore;
  final Future<void> Function(TaskBoardTask task) onTaskTap;

  /// Opens the board's tasks that have no dates.
  final VoidCallback? onShowUndated;

  /// The current instant; tests pin it.
  final DateTime Function() clock;

  @override
  State<TaskTimelineView> createState() => _TaskTimelineViewState();
}

class _TaskTimelineViewState extends State<TaskTimelineView> {
  final TaskTimelineProjectionCache _cache = TaskTimelineProjectionCache();
  TaskTimelineSpan? _chosenSpan;
  TaskTimelineWindow? _window;
  Timer? _midnight;

  @override
  void dispose() {
    _midnight?.cancel();
    super.dispose();
  }

  bool _isTablet(BuildContext context) =>
      MediaQuery.sizeOf(context).width >= ShellDockMetrics.tabletBreakpoint;

  @override
  Widget build(BuildContext context) {
    final zone = taskTimezone(context);
    final now = widget.clock();
    _midnight ??= Timer(
      taskTimeUntilNextDay(now, zone) + const Duration(seconds: 1),
      () {
        _midnight = null;
        if (mounted) setState(() {});
      },
    );
    final today = taskDay(now, zone);
    final tablet = _isTablet(context);
    final span =
        _chosenSpan ??
        (tablet ? TaskTimelineSpan.twoWeeks : TaskTimelineSpan.week);
    final current = _window;
    final window = current != null && current.span == span
        ? current
        : TaskTimelineWindow.around(span, today);
    final projection = _cache.resolve(
      lists: widget.lists,
      tasksByList: widget.tasksByList,
      window: window,
      today: today,
      zone: zone,
    );
    final l10n = context.l10n;

    return LayoutBuilder(
      builder: (context, constraints) {
        final metrics = TaskTimelineMetrics(
          width: constraints.maxWidth,
          inset: AppPageInsets.gutterOf(context, width: constraints.maxWidth),
          days: window.days,
        );
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TaskTimelineHeader(
              window: window,
              today: today,
              metrics: metrics,
              onRangePressed: () => unawaited(_pickSpan(span, window, today)),
              onShift: (steps) => _show(window.shift(steps)),
              onCentre: (day) => _show(TaskTimelineWindow.centredOn(span, day)),
              onToday: window.contains(today)
                  ? null
                  : () => _show(TaskTimelineWindow.around(span, today)),
            ),
            if (widget.hasLoadError)
              Padding(
                padding: EdgeInsets.fromLTRB(
                  metrics.inset,
                  AppSpacing.sm,
                  metrics.inset,
                  0,
                ),
                child: Row(
                  children: [
                    Expanded(child: Text(l10n.commonSomethingWentWrong)),
                    AppButton.outline(
                      key: const ValueKey('task-timeline-retry'),
                      onPressed: widget.isLoadingMoreTasks
                          ? null
                          : widget.onLoadMore,
                      child: Text(l10n.commonRetry),
                    ),
                  ],
                ),
              ),
            Expanded(
              child: projection.isEmpty
                  ? TaskTimelineEmpty(
                      span: span,
                      undatedCount: projection.undatedCount,
                      loading: widget.hasMoreTasks && widget.isLoadingMoreTasks,
                      onShowUndated: widget.onShowUndated,
                      onLoadMore: widget.hasMoreTasks && !widget.hasLoadError
                          ? widget.onLoadMore
                          : null,
                    )
                  : TaskTimelineBody(
                      projection: projection,
                      metrics: metrics,
                      tall: tablet,
                      listNames: _listNames(context),
                      listColors: {
                        for (final list in widget.lists)
                          list.id: taskBoardListColor(context, list.color),
                      },
                      scrollController: widget.scrollController,
                      onTaskTap: (task) => unawaited(widget.onTaskTap(task)),
                      footer: _footer(context),
                    ),
            ),
          ],
        );
      },
    );
  }

  Map<String, String> _listNames(BuildContext context) => {
    for (final list in widget.lists)
      list.id: list.name?.trim().isNotEmpty == true
          ? list.name!.trim()
          : context.l10n.taskBoardDetailUntitledList,
  };

  Widget? _footer(BuildContext context) {
    if (widget.isLoadingMoreTasks) {
      return const Padding(
        padding: EdgeInsets.only(top: AppSpacing.lg),
        child: Center(child: AppLoadingIndicator()),
      );
    }
    if (!widget.hasMoreTasks || widget.hasLoadError) return null;
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.lg),
      child: Center(
        child: AppButton.outline(
          key: const ValueKey('task-timeline-load-more'),
          onPressed: widget.onLoadMore,
          child: Text(context.l10n.timerHistoryLoadMore),
        ),
      ),
    );
  }

  void _show(TaskTimelineWindow window) {
    setState(() => _window = window);
    final controller = widget.scrollController;
    if (controller.hasClients) controller.jumpTo(0);
  }

  Future<void> _pickSpan(
    TaskTimelineSpan current,
    TaskTimelineWindow window,
    DateTime today,
  ) async {
    final picked = await showTaskTimelineSpanSheet(context, current);
    if (picked == null || !mounted) return;
    final anchor = window.contains(today)
        ? today
        : window.dayAt(window.days ~/ 2);
    _chosenSpan = picked;
    _show(TaskTimelineWindow.around(picked, anchor));
  }
}
