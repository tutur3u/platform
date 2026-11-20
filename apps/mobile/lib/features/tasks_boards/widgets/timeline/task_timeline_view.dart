import 'dart:async';
import 'dart:math' as math;

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
import 'package:mobile/features/tasks_boards/widgets/timeline/task_timeline_day_strip.dart';
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
    this.onScheduleTask,
    this.onBarShift,
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

  /// Opens the create-task sheet when the range is empty.
  final VoidCallback? onScheduleTask;

  /// Shifts a task's dates by whole columns after a horizontal drag.
  final Future<void> Function(TaskBoardTask task, int deltaDays)? onBarShift;

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
  double _pinchScale = 1;
  DateTime? _focusedDay;
  int _rangeRevision = 0;

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
        final viewportWidth = constraints.maxWidth;
        final inset = AppPageInsets.gutterOf(context, width: viewportWidth);
        final dayWidth = MediaQuery.textScalerOf(
          context,
        ).scale(span == TaskTimelineSpan.week ? 36 : 44);
        final metrics = TaskTimelineMetrics(
          width: math.max(viewportWidth, inset * 2 + dayWidth * window.days),
          inset: inset,
          days: window.days,
        );
        final scrollsHorizontally = metrics.width > viewportWidth;
        final focusedDay =
            _focusedDay ?? (window.contains(today) ? today : window.start);
        final axis = TaskTimelineDayStrip(
          window: window,
          today: today,
          metrics: metrics,
          onShift: scrollsHorizontally
              ? null
              : (steps) => _show(window.shift(steps)),
          onCentre: (day) => scrollsHorizontally
              ? _show(window, focus: day)
              : _show(TaskTimelineWindow.centredOn(span, day)),
        );
        final empty = projection.isEmpty
            ? TaskTimelineEmpty(
                span: span,
                undatedCount: projection.undatedCount,
                loading: widget.hasMoreTasks && widget.isLoadingMoreTasks,
                onShowUndated: widget.onShowUndated,
                onScheduleTask: widget.onScheduleTask,
                onLoadMore: widget.hasMoreTasks && !widget.hasLoadError
                    ? widget.onLoadMore
                    : null,
              )
            : null;
        Widget body({double offset = 0}) => TaskTimelineBody(
          projection: projection,
          metrics: metrics,
          viewportLeft: offset,
          viewportWidth: viewportWidth,
          tall: tablet && !scrollsHorizontally,
          listNames: _listNames(context),
          listColors: {
            for (final list in widget.lists)
              list.id: taskBoardListColor(context, list.color),
          },
          scrollController: widget.scrollController,
          onTaskTap: (task) => unawaited(widget.onTaskTap(task)),
          onBarShift: widget.onBarShift,
          footer: _footer(context),
        );

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TaskTimelineHeader(
              window: window,
              inset: inset,
              dayStrip: scrollsHorizontally ? null : axis,
              showRangeArrows: scrollsHorizontally,
              onSpanChanged: (picked) => _showSpan(picked, window, today),
              onShift: (steps) => _show(window.shift(steps)),
              onToday: !scrollsHorizontally && window.contains(today)
                  ? null
                  : () => _show(
                      TaskTimelineWindow.around(span, today),
                      focus: today,
                    ),
            ),
            if (widget.hasLoadError)
              Padding(
                padding: EdgeInsets.fromLTRB(inset, AppSpacing.sm, inset, 0),
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
              child: GestureDetector(
                behavior: HitTestBehavior.deferToChild,
                onScaleStart: (_) => _pinchScale = 1,
                onScaleUpdate: (details) {
                  if (details.pointerCount < 2) return;
                  final delta = details.scale - _pinchScale;
                  _pinchScale = details.scale;
                  if (delta.abs() < 0.02) return;
                  if (details.scale < 0.92) {
                    _zoomSpan(-1, window, today);
                  } else if (details.scale > 1.08) {
                    _zoomSpan(1, window, today);
                  }
                },
                child: scrollsHorizontally
                    ? _TimelineHorizontalViewport(
                        key: ValueKey((
                          window,
                          _rangeRevision,
                          viewportWidth,
                          metrics.width,
                        )),
                        contentWidth: metrics.width,
                        initialOffset:
                            (metrics.centre(window.columnOf(focusedDay)) -
                                    viewportWidth / 2)
                                .clamp(0.0, metrics.width - viewportWidth),
                        axis: axis,
                        body: empty == null
                            ? (offset) => body(offset: offset)
                            : null,
                        empty: empty,
                      )
                    : empty ?? body(),
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

  void _show(TaskTimelineWindow window, {DateTime? focus}) {
    if (focus != null && window == _window) {
      setState(() {
        _focusedDay = focus;
        _rangeRevision++;
      });
      return;
    }
    setState(() {
      _window = window;
      _focusedDay = focus;
      _rangeRevision++;
    });
    final controller = widget.scrollController;
    if (controller.hasClients) controller.jumpTo(0);
  }

  /// Keeps today in view when the range holds it, otherwise the middle of
  /// the current range.
  void _zoomSpan(int direction, TaskTimelineWindow window, DateTime today) {
    const order = TaskTimelineSpan.values;
    final current = _chosenSpan ?? window.span;
    final index = order.indexOf(current);
    final next = (index + direction).clamp(0, order.length - 1);
    if (next == index) return;
    _showSpan(order[next], window, today);
  }

  void _showSpan(
    TaskTimelineSpan picked,
    TaskTimelineWindow window,
    DateTime today,
  ) {
    final anchor = window.contains(today)
        ? today
        : window.dayAt(window.days ~/ 2);
    _chosenSpan = picked;
    _show(TaskTimelineWindow.around(picked, anchor));
  }
}

class _TimelineHorizontalViewport extends StatefulWidget {
  const _TimelineHorizontalViewport({
    required this.contentWidth,
    required this.initialOffset,
    required this.axis,
    required this.body,
    required this.empty,
    super.key,
  });

  final double contentWidth;
  final double initialOffset;
  final Widget axis;
  final Widget Function(double offset)? body;
  final Widget? empty;

  @override
  State<_TimelineHorizontalViewport> createState() =>
      _TimelineHorizontalViewportState();
}

class _TimelineHorizontalViewportState
    extends State<_TimelineHorizontalViewport> {
  late final _controller = ScrollController(
    initialScrollOffset: widget.initialOffset,
    keepScrollOffset: false,
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final body = widget.body;
    return LayoutBuilder(
      builder: (context, constraints) {
        final viewport = SingleChildScrollView(
          key: const ValueKey('task-timeline-horizontal-viewport'),
          controller: _controller,
          scrollDirection: Axis.horizontal,
          child: SizedBox(
            width: widget.contentWidth,
            height: body == null ? null : constraints.maxHeight,
            child: Column(
              children: [
                widget.axis,
                if (body != null)
                  Expanded(
                    child: NotificationListener<ScrollMetricsNotification>(
                      onNotification: (notification) {
                        if (notification.depth != 0 ||
                            notification.metrics.axis != Axis.vertical) {
                          return false;
                        }
                        notification.dispatch(context);
                        return true;
                      },
                      child: NotificationListener<ScrollNotification>(
                        onNotification: (notification) {
                          if (notification.depth != 0 ||
                              notification.metrics.axis != Axis.vertical) {
                            return false;
                          }
                          // The body is the page's primary vertical scrollable.
                          // Keep depth zero past the horizontal viewport.
                          notification.dispatch(context);
                          return true;
                        },
                        child: ListenableBuilder(
                          listenable: _controller,
                          builder: (context, _) => body(
                            _controller.hasClients
                                ? _controller.offset
                                : widget.initialOffset,
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
        return widget.empty == null
            ? viewport
            : Column(
                children: [
                  viewport,
                  Expanded(child: widget.empty!),
                ],
              );
      },
    );
  }
}
