part of 'task_board_detail_page.dart';

enum _TimelineDragMode { move, resizeStart, resizeEnd }

class _TimelineDraft extends Equatable {
  const _TimelineDraft({
    required this.listId,
    required this.startDate,
    required this.endDate,
  });

  final String listId;
  final DateTime startDate;
  final DateTime endDate;

  @override
  List<Object?> get props => [listId, startDate, endDate];
}

class _TimelineInteraction extends Equatable {
  const _TimelineInteraction({
    required this.taskId,
    required this.mode,
    required this.originGlobalX,
    required this.originalListId,
    required this.originalStartDate,
    required this.originalEndDate,
  });

  final String taskId;
  final _TimelineDragMode mode;
  final double originGlobalX;
  final String originalListId;
  final DateTime originalStartDate;
  final DateTime originalEndDate;

  @override
  List<Object?> get props => [
    taskId,
    mode,
    originGlobalX,
    originalListId,
    originalStartDate,
    originalEndDate,
  ];
}

class _TimelineTaskLayout {
  const _TimelineTaskLayout({
    required this.task,
    required this.startDate,
    required this.endDate,
    required this.lane,
  });

  final TaskBoardTask task;
  final DateTime startDate;
  final DateTime endDate;
  final int lane;
}

class _TimelineScheduledTask {
  const _TimelineScheduledTask({
    required this.task,
    required this.listId,
    required this.startDate,
    required this.endDate,
  });

  final TaskBoardTask task;
  final String listId;
  final DateTime startDate;
  final DateTime endDate;
}

class _TimelineData {
  const _TimelineData({
    required this.lists,
    required this.scheduledTasks,
    required this.unscheduledTasks,
    required this.layoutsByListId,
    required this.startDate,
    required this.endDate,
  });

  final List<TaskBoardList> lists;
  final List<_TimelineScheduledTask> scheduledTasks;
  final List<TaskBoardTask> unscheduledTasks;
  final Map<String, List<_TimelineTaskLayout>> layoutsByListId;
  final DateTime startDate;
  final DateTime endDate;
}

int _timelineDayStride(int dayCount) {
  if (dayCount > 730) return 14;
  if (dayCount > 240) return 7;
  return 1;
}

class _TaskBoardTimelineView extends StatefulWidget {
  const _TaskBoardTimelineView({
    required this.board,
    required this.lists,
    required this.tasksByList,
    required this.bottomPadding,
    required this.hasMoreTasks,
    required this.isLoadingMoreTasks,
    required this.verticalScrollController,
    required this.horizontalScrollController,
    required this.onLoadMore,
    required this.onTaskTap,
    required this.onTimelineTaskCommit,
  });

  final TaskBoardDetail board;
  final List<TaskBoardList> lists;
  final Map<String, List<TaskBoardTask>> tasksByList;
  final double bottomPadding;
  final bool hasMoreTasks;
  final bool isLoadingMoreTasks;
  final ScrollController verticalScrollController;
  final ScrollController horizontalScrollController;
  final VoidCallback onLoadMore;
  final Future<void> Function(TaskBoardTask task) onTaskTap;
  final Future<void> Function({
    required TaskBoardTask task,
    required String listId,
    required DateTime startDate,
    required DateTime endDate,
  })
  onTimelineTaskCommit;

  @override
  State<_TaskBoardTimelineView> createState() => _TaskBoardTimelineViewState();
}

class _TaskBoardTimelineViewState extends State<_TaskBoardTimelineView> {
  static const double _sidebarWidth = 172;
  static const double _dayWidth = 74;
  static const double _headerHeight = 52;
  static const double _laneHeight = 44;
  static const double _rowVerticalPadding = 12;
  static const double _taskBarHeight = 32;
  static const double _resizeHandleWidth = 14;

  final Map<String, GlobalKey> _rowKeys = <String, GlobalKey>{};
  final Map<String, _TimelineDraft> _drafts = <String, _TimelineDraft>{};
  _TimelineInteraction? _interaction;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final now = DateTime.now();
    final timelineData = _buildTimelineData(now);
    final scheduledTasks = timelineData.scheduledTasks;
    final unscheduledTasks = timelineData.unscheduledTasks;
    final dayCount =
        timelineData.endDate.difference(timelineData.startDate).inDays + 1;
    final timelineWidth = math.max(dayCount * _dayWidth, 420);
    final todayIndex = _normalizeDay(
      now,
    ).difference(timelineData.startDate).inDays;

    return NotificationListener<ScrollNotification>(
      onNotification: (notification) {
        final metrics = notification.metrics;
        if (notification.depth == 0 &&
            widget.hasMoreTasks &&
            !widget.isLoadingMoreTasks &&
            metrics.pixels >= metrics.maxScrollExtent - 420) {
          widget.onLoadMore();
        }
        return false;
      },
      child: ListView(
        controller: widget.verticalScrollController,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(16, 0, 16, widget.bottomPadding),
        children: [
          Container(
            decoration: BoxDecoration(
              color: theme.colorScheme.card,
              borderRadius: BorderRadius.circular(22),
              border: Border.all(
                color: theme.colorScheme.border.withValues(alpha: 0.72),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          context.l10n.taskBoardDetailTimelineView,
                          style: theme.typography.large.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      if (scheduledTasks.isNotEmpty)
                        shad.OutlineBadge(
                          child: Text(
                            context.l10n.taskBoardsTasksCount(
                              scheduledTasks.length,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                const shad.Gap(12),
                if (scheduledTasks.isEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    child: _TaskBoardTimelineEmptyState(
                      unscheduledTasks: unscheduledTasks,
                      onTaskTap: widget.onTaskTap,
                    ),
                  )
                else
                  ClipRRect(
                    borderRadius: const BorderRadius.vertical(
                      bottom: Radius.circular(22),
                    ),
                    child: SingleChildScrollView(
                      controller: widget.horizontalScrollController,
                      scrollDirection: Axis.horizontal,
                      child: SizedBox(
                        width: _sidebarWidth + timelineWidth,
                        child: Column(
                          children: [
                            _TimelineHeader(
                              startDate: timelineData.startDate,
                              dayCount: dayCount,
                              todayIndex: todayIndex,
                            ),
                            RepaintBoundary(
                              child: Column(
                                children: [
                                  for (final list in timelineData.lists)
                                    _TimelineListRow(
                                      key: _rowKeyFor(list.id),
                                      list: list,
                                      layouts:
                                          timelineData.layoutsByListId[list
                                              .id] ??
                                          const <_TimelineTaskLayout>[],
                                      timelineStart: timelineData.startDate,
                                      dayCount: dayCount,
                                      todayIndex: todayIndex,
                                      dayWidth: _dayWidth,
                                      sidebarWidth: _sidebarWidth,
                                      rowVerticalPadding: _rowVerticalPadding,
                                      laneHeight: _laneHeight,
                                      taskBarHeight: _taskBarHeight,
                                      resizeHandleWidth: _resizeHandleWidth,
                                      onTaskTap: widget.onTaskTap,
                                      onInteractionStart:
                                          (
                                            task,
                                            mode,
                                            details,
                                          ) => _onInteractionStart(
                                            task: task,
                                            mode: mode,
                                            details: details,
                                          ),
                                      onInteractionUpdate:
                                          (
                                            task,
                                            mode,
                                            details,
                                          ) => _onInteractionUpdate(
                                            task: task,
                                            mode: mode,
                                            details: details,
                                          ),
                                      onInteractionEnd: _onInteractionEnd,
                                    ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          if (scheduledTasks.isNotEmpty && unscheduledTasks.isNotEmpty) ...[
            const shad.Gap(12),
            _TaskBoardTimelineUnscheduledSection(
              tasks: unscheduledTasks,
              onTaskTap: widget.onTaskTap,
            ),
          ],
          if (widget.hasMoreTasks || widget.isLoadingMoreTasks) ...[
            const shad.Gap(12),
            Center(
              child: widget.isLoadingMoreTasks
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: shad.CircularProgressIndicator(strokeWidth: 2),
                    )
                  : shad.OutlineButton(
                      onPressed: widget.onLoadMore,
                      child: Text(context.l10n.timerHistoryLoadMore),
                    ),
            ),
          ],
        ],
      ),
    );
  }

  GlobalKey _rowKeyFor(String listId) =>
      _rowKeys.putIfAbsent(listId, GlobalKey.new);

  _TimelineData _buildTimelineData(DateTime now) {
    final visibleLists = widget.lists
        .where((list) => !_taskListDone(list))
        .toList(growable: false);
    final visibleListIds = visibleLists.map((list) => list.id).toSet();
    final scheduledTasks = <_TimelineScheduledTask>[];
    final unscheduledTasks = <TaskBoardTask>[];

    for (final list in visibleLists) {
      final tasks = widget.tasksByList[list.id] ?? const <TaskBoardTask>[];
      for (final task in tasks) {
        final draft = _drafts[task.id];
        final effectiveListId = draft?.listId ?? task.listId;
        if (!visibleListIds.contains(effectiveListId)) {
          continue;
        }
        final schedule = _scheduleForTask(task, draft: draft);
        if (schedule == null) {
          unscheduledTasks.add(task);
          continue;
        }
        scheduledTasks.add(
          _TimelineScheduledTask(
            task: task,
            listId: effectiveListId,
            startDate: schedule.$1,
            endDate: schedule.$2,
          ),
        );
      }
    }

    final bounds = _resolveTimelineBounds(scheduledTasks, now);
    return _TimelineData(
      lists: visibleLists,
      scheduledTasks: scheduledTasks,
      unscheduledTasks: unscheduledTasks,
      layoutsByListId: _buildTaskLayoutsByList(scheduledTasks),
      startDate: bounds.$1,
      endDate: bounds.$2,
    );
  }

  Map<String, List<_TimelineTaskLayout>> _buildTaskLayoutsByList(
    List<_TimelineScheduledTask> scheduledTasks,
  ) {
    final grouped = <String, List<_TimelineScheduledTask>>{};
    for (final task in scheduledTasks) {
      grouped
          .putIfAbsent(task.listId, () => <_TimelineScheduledTask>[])
          .add(
            task,
          );
    }

    return {
      for (final entry in grouped.entries)
        entry.key: _layoutScheduled(entry.value),
    };
  }

  List<_TimelineTaskLayout> _layoutScheduled(
    List<_TimelineScheduledTask> scheduledTasks,
  ) {
    final scheduled = List<_TimelineScheduledTask>.from(scheduledTasks)
      ..sort((a, b) {
        final byStart = a.startDate.compareTo(b.startDate);
        if (byStart != 0) return byStart;
        return a.endDate.compareTo(b.endDate);
      });

    final laneEnds = <DateTime>[];
    final layouts = <_TimelineTaskLayout>[];

    for (final entry in scheduled) {
      var lane = 0;
      while (lane < laneEnds.length &&
          !entry.startDate.isAfter(
            laneEnds[lane].add(const Duration(days: 1)),
          )) {
        lane += 1;
      }
      if (lane == laneEnds.length) {
        laneEnds.add(entry.endDate);
      } else {
        laneEnds[lane] = entry.endDate;
      }
      layouts.add(
        _TimelineTaskLayout(
          task: entry.task,
          startDate: entry.startDate,
          endDate: entry.endDate,
          lane: lane,
        ),
      );
    }

    return layouts;
  }

  void _onInteractionStart({
    required TaskBoardTask task,
    required _TimelineDragMode mode,
    required DragStartDetails details,
  }) {
    final schedule = _scheduleForTask(task, draft: _drafts[task.id]);
    if (schedule == null) return;

    setState(() {
      _interaction = _TimelineInteraction(
        taskId: task.id,
        mode: mode,
        originGlobalX: details.globalPosition.dx,
        originalListId: _drafts[task.id]?.listId ?? task.listId,
        originalStartDate: schedule.$1,
        originalEndDate: schedule.$2,
      );
    });
  }

  void _onInteractionUpdate({
    required TaskBoardTask task,
    required _TimelineDragMode mode,
    required DragUpdateDetails details,
  }) {
    final interaction = _interaction;
    if (interaction == null || interaction.taskId != task.id) {
      return;
    }

    final deltaDays =
        ((details.globalPosition.dx - interaction.originGlobalX) / _dayWidth)
            .round();
    final hoveredListId =
        _resolveHoveredListId(details.globalPosition) ??
        interaction.originalListId;
    var nextStart = interaction.originalStartDate;
    var nextEnd = interaction.originalEndDate;

    switch (mode) {
      case _TimelineDragMode.move:
        nextStart = _normalizeDay(
          interaction.originalStartDate.add(Duration(days: deltaDays)),
        );
        nextEnd = _normalizeDay(
          interaction.originalEndDate.add(Duration(days: deltaDays)),
        );
      case _TimelineDragMode.resizeStart:
        nextStart = _normalizeDay(
          interaction.originalStartDate.add(Duration(days: deltaDays)),
        );
        if (nextStart.isAfter(nextEnd)) {
          nextStart = nextEnd;
        }
      case _TimelineDragMode.resizeEnd:
        nextEnd = _normalizeDay(
          interaction.originalEndDate.add(Duration(days: deltaDays)),
        );
        if (nextEnd.isBefore(nextStart)) {
          nextEnd = nextStart;
        }
    }

    setState(() {
      _drafts[task.id] = _TimelineDraft(
        listId: hoveredListId,
        startDate: nextStart,
        endDate: nextEnd,
      );
    });
  }

  void _onInteractionEnd(TaskBoardTask task) {
    final interaction = _interaction;
    if (interaction == null || interaction.taskId != task.id) {
      return;
    }

    final draft = _drafts[task.id];
    final draftChanged =
        draft != null &&
        (draft.listId != interaction.originalListId ||
            draft.startDate != interaction.originalStartDate ||
            draft.endDate != interaction.originalEndDate);

    setState(() {
      _interaction = null;
    });

    if (!draftChanged) {
      setState(() {
        _drafts.remove(task.id);
      });
      return;
    }

    unawaited(_commitDraft(task, draft));
  }

  Future<void> _commitDraft(TaskBoardTask task, _TimelineDraft draft) async {
    try {
      await widget.onTimelineTaskCommit(
        task: task,
        listId: draft.listId,
        startDate: draft.startDate,
        endDate: draft.endDate,
      );
    } finally {
      if (mounted) {
        setState(() {
          _drafts.remove(task.id);
        });
      }
    }
  }

  String? _resolveHoveredListId(Offset globalPosition) {
    for (final list in widget.lists) {
      if (_taskListDone(list)) continue;
      final rowContext = _rowKeys[list.id]?.currentContext;
      final rowBox = rowContext?.findRenderObject() as RenderBox?;
      if (rowBox == null || !rowBox.hasSize) {
        continue;
      }
      final topLeft = rowBox.localToGlobal(Offset.zero);
      final rect = topLeft & rowBox.size;
      if (rect.contains(globalPosition)) {
        return list.id;
      }
    }
    return null;
  }

  (DateTime, DateTime)? _scheduleForTask(
    TaskBoardTask task, {
    _TimelineDraft? draft,
  }) {
    final startDate = draft?.startDate ?? task.startDate ?? task.endDate;
    final endDate = draft?.endDate ?? task.endDate ?? task.startDate;
    if (startDate == null || endDate == null) {
      return null;
    }

    final normalizedStart = _normalizeDay(startDate);
    final normalizedEnd = _normalizeDay(endDate);
    return normalizedStart.isBefore(normalizedEnd)
        ? (normalizedStart, normalizedEnd)
        : (normalizedEnd, normalizedStart);
  }

  (DateTime, DateTime) _resolveTimelineBounds(
    List<_TimelineScheduledTask> tasks,
    DateTime now,
  ) {
    DateTime? earliest;
    DateTime? latest;

    for (final task in tasks) {
      earliest = earliest == null || task.startDate.isBefore(earliest)
          ? task.startDate
          : earliest;
      latest = latest == null || task.endDate.isAfter(latest)
          ? task.endDate
          : latest;
    }

    final today = _normalizeDay(now);
    final start = (earliest ?? today).subtract(const Duration(days: 3));
    final end = (latest ?? today).add(const Duration(days: 7));
    return (start, end);
  }

  DateTime _normalizeDay(DateTime value) =>
      DateTime(value.year, value.month, value.day);
}

class _TimelineHeader extends StatelessWidget {
  const _TimelineHeader({
    required this.startDate,
    required this.dayCount,
    required this.todayIndex,
  });

  final DateTime startDate;
  final int dayCount;
  final int todayIndex;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final textStyle = theme.typography.small.copyWith(
      fontWeight: FontWeight.w600,
      color: theme.colorScheme.foreground,
    );

    return Container(
      height: _TaskBoardTimelineViewState._headerHeight,
      decoration: BoxDecoration(
        color: theme.colorScheme.muted.withValues(alpha: 0.36),
        border: Border(
          bottom: BorderSide(
            color: theme.colorScheme.border.withValues(alpha: 0.72),
          ),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: _TaskBoardTimelineViewState._sidebarWidth,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            alignment: Alignment.centerLeft,
            child: Text(
              context.l10n.taskBoardsTitle,
              style: theme.typography.small.copyWith(
                fontWeight: FontWeight.w700,
                color: theme.colorScheme.mutedForeground,
              ),
            ),
          ),
          Expanded(
            child: CustomPaint(
              painter: _TimelineHeaderPainter(
                startDate: startDate,
                dayCount: dayCount,
                todayIndex: todayIndex,
                dayWidth: _TaskBoardTimelineViewState._dayWidth,
                locale: locale,
                textStyle: textStyle,
                lineColor: theme.colorScheme.border.withValues(alpha: 0.46),
                todayColor: theme.colorScheme.primary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TimelineHeaderPainter extends CustomPainter {
  const _TimelineHeaderPainter({
    required this.startDate,
    required this.dayCount,
    required this.todayIndex,
    required this.dayWidth,
    required this.locale,
    required this.textStyle,
    required this.lineColor,
    required this.todayColor,
  });

  final DateTime startDate;
  final int dayCount;
  final int todayIndex;
  final double dayWidth;
  final String locale;
  final TextStyle textStyle;
  final Color lineColor;
  final Color todayColor;

  @override
  void paint(Canvas canvas, Size size) {
    final linePaint = Paint()
      ..color = lineColor
      ..strokeWidth = 1;
    final todayPaint = Paint()
      ..color = todayColor.withValues(alpha: 0.1)
      ..style = PaintingStyle.fill;
    final todayLinePaint = Paint()
      ..color = todayColor.withValues(alpha: 0.58)
      ..strokeWidth = 2;
    final formatter = DateFormat.MMMd(locale);
    final stride = _timelineDayStride(dayCount);

    if (todayIndex >= 0 && todayIndex < dayCount) {
      final todayLeft = todayIndex * dayWidth;
      canvas
        ..drawRect(
          Rect.fromLTWH(todayLeft, 0, dayWidth, size.height),
          todayPaint,
        )
        ..drawLine(
          Offset(todayLeft, 0),
          Offset(todayLeft, size.height),
          todayLinePaint,
        );
    }

    for (var dayIndex = 0; dayIndex < dayCount; dayIndex += stride) {
      final left = dayIndex * dayWidth;
      canvas.drawLine(Offset(left, 0), Offset(left, size.height), linePaint);

      final label = formatter.format(startDate.add(Duration(days: dayIndex)));
      final textPainter = TextPainter(
        text: TextSpan(text: label, style: textStyle),
        maxLines: 1,
        textAlign: TextAlign.center,
        textDirection: ui.TextDirection.ltr,
      )..layout(maxWidth: dayWidth - 8);
      textPainter.paint(
        canvas,
        Offset(
          left + (dayWidth - textPainter.width) / 2,
          (size.height - textPainter.height) / 2,
        ),
      );
    }
  }

  @override
  bool shouldRepaint(covariant _TimelineHeaderPainter oldDelegate) {
    return startDate != oldDelegate.startDate ||
        dayCount != oldDelegate.dayCount ||
        todayIndex != oldDelegate.todayIndex ||
        dayWidth != oldDelegate.dayWidth ||
        locale != oldDelegate.locale ||
        textStyle != oldDelegate.textStyle ||
        lineColor != oldDelegate.lineColor ||
        todayColor != oldDelegate.todayColor;
  }
}

class _TimelineListRow extends StatelessWidget {
  const _TimelineListRow({
    required this.list,
    required this.layouts,
    required this.timelineStart,
    required this.dayCount,
    required this.todayIndex,
    required this.dayWidth,
    required this.sidebarWidth,
    required this.rowVerticalPadding,
    required this.laneHeight,
    required this.taskBarHeight,
    required this.resizeHandleWidth,
    required this.onTaskTap,
    required this.onInteractionStart,
    required this.onInteractionUpdate,
    required this.onInteractionEnd,
    super.key,
  });

  final TaskBoardList list;
  final List<_TimelineTaskLayout> layouts;
  final DateTime timelineStart;
  final int dayCount;
  final int todayIndex;
  final double dayWidth;
  final double sidebarWidth;
  final double rowVerticalPadding;
  final double laneHeight;
  final double taskBarHeight;
  final double resizeHandleWidth;
  final Future<void> Function(TaskBoardTask task) onTaskTap;
  final void Function(
    TaskBoardTask task,
    _TimelineDragMode mode,
    DragStartDetails details,
  )
  onInteractionStart;
  final void Function(
    TaskBoardTask task,
    _TimelineDragMode mode,
    DragUpdateDetails details,
  )
  onInteractionUpdate;
  final void Function(TaskBoardTask task) onInteractionEnd;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final laneCount = math.max(
      1,
      layouts.fold<int>(
        0,
        (maxLane, layout) => math.max(maxLane, layout.lane + 1),
      ),
    );
    final rowHeight = rowVerticalPadding * 2 + laneCount * laneHeight;

    return Container(
      height: rowHeight,
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(
            color: theme.colorScheme.border.withValues(alpha: 0.5),
          ),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: sidebarWidth,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              border: Border(
                right: BorderSide(
                  color: theme.colorScheme.border.withValues(alpha: 0.5),
                ),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  list.name?.trim().isNotEmpty == true
                      ? list.name!.trim()
                      : context.l10n.taskBoardDetailUntitledList,
                  style: theme.typography.p.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const shad.Gap(4),
                Text(
                  context.l10n.taskBoardsTasksCount(layouts.length),
                  style: theme.typography.small.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: Stack(
              children: [
                Positioned.fill(
                  child: CustomPaint(
                    painter: _TimelineGridPainter(
                      dayCount: dayCount,
                      todayIndex: todayIndex,
                      dayWidth: dayWidth,
                      lineColor: theme.colorScheme.border.withValues(
                        alpha: 0.28,
                      ),
                      todayColor: theme.colorScheme.primary,
                    ),
                  ),
                ),
                for (final layout in layouts)
                  Positioned(
                    left:
                        layout.startDate.difference(timelineStart).inDays *
                            dayWidth +
                        6,
                    top: rowVerticalPadding + layout.lane * laneHeight + 6,
                    width: math.max(
                      dayWidth - 12,
                      (layout.endDate.difference(layout.startDate).inDays + 1) *
                              dayWidth -
                          12,
                    ),
                    height: taskBarHeight,
                    child: _TimelineTaskBar(
                      task: layout.task,
                      onTap: () => unawaited(onTaskTap(layout.task)),
                      onMoveStart: (details) => onInteractionStart(
                        layout.task,
                        _TimelineDragMode.move,
                        details,
                      ),
                      onMoveUpdate: (details) => onInteractionUpdate(
                        layout.task,
                        _TimelineDragMode.move,
                        details,
                      ),
                      onResizeStartBegin: (details) => onInteractionStart(
                        layout.task,
                        _TimelineDragMode.resizeStart,
                        details,
                      ),
                      onResizeStartUpdate: (details) => onInteractionUpdate(
                        layout.task,
                        _TimelineDragMode.resizeStart,
                        details,
                      ),
                      onResizeEndBegin: (details) => onInteractionStart(
                        layout.task,
                        _TimelineDragMode.resizeEnd,
                        details,
                      ),
                      onResizeEndUpdate: (details) => onInteractionUpdate(
                        layout.task,
                        _TimelineDragMode.resizeEnd,
                        details,
                      ),
                      onInteractionEnd: () => onInteractionEnd(layout.task),
                      resizeHandleWidth: resizeHandleWidth,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TimelineGridPainter extends CustomPainter {
  const _TimelineGridPainter({
    required this.dayCount,
    required this.todayIndex,
    required this.dayWidth,
    required this.lineColor,
    required this.todayColor,
  });

  final int dayCount;
  final int todayIndex;
  final double dayWidth;
  final Color lineColor;
  final Color todayColor;

  @override
  void paint(Canvas canvas, Size size) {
    final linePaint = Paint()
      ..color = lineColor
      ..strokeWidth = 1;
    final todayPaint = Paint()
      ..color = todayColor.withValues(alpha: 0.06)
      ..style = PaintingStyle.fill;
    final todayLinePaint = Paint()
      ..color = todayColor.withValues(alpha: 0.42)
      ..strokeWidth = 1.5;
    final stride = _timelineDayStride(dayCount);

    if (todayIndex >= 0 && todayIndex < dayCount) {
      final todayLeft = todayIndex * dayWidth;
      canvas
        ..drawRect(
          Rect.fromLTWH(todayLeft, 0, dayWidth, size.height),
          todayPaint,
        )
        ..drawLine(
          Offset(todayLeft, 0),
          Offset(todayLeft, size.height),
          todayLinePaint,
        );
    }

    for (var dayIndex = 0; dayIndex < dayCount; dayIndex += stride) {
      final left = dayIndex * dayWidth;
      canvas.drawLine(Offset(left, 0), Offset(left, size.height), linePaint);
    }
  }

  @override
  bool shouldRepaint(covariant _TimelineGridPainter oldDelegate) {
    return dayCount != oldDelegate.dayCount ||
        todayIndex != oldDelegate.todayIndex ||
        dayWidth != oldDelegate.dayWidth ||
        lineColor != oldDelegate.lineColor ||
        todayColor != oldDelegate.todayColor;
  }
}

class _TimelineTaskBar extends StatelessWidget {
  const _TimelineTaskBar({
    required this.task,
    required this.onTap,
    required this.onMoveStart,
    required this.onMoveUpdate,
    required this.onResizeStartBegin,
    required this.onResizeStartUpdate,
    required this.onResizeEndBegin,
    required this.onResizeEndUpdate,
    required this.onInteractionEnd,
    required this.resizeHandleWidth,
  });

  final TaskBoardTask task;
  final VoidCallback onTap;
  final void Function(DragStartDetails details) onMoveStart;
  final void Function(DragUpdateDetails details) onMoveUpdate;
  final void Function(DragStartDetails details) onResizeStartBegin;
  final void Function(DragUpdateDetails details) onResizeStartUpdate;
  final void Function(DragStartDetails details) onResizeEndBegin;
  final void Function(DragUpdateDetails details) onResizeEndUpdate;
  final VoidCallback onInteractionEnd;
  final double resizeHandleWidth;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final priorityStyle = _taskPriorityStyle(context, task.priority);
    final accent = priorityStyle.foreground;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Ink(
          decoration: BoxDecoration(
            color: accent.withValues(alpha: 0.16),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: accent.withValues(alpha: 0.38)),
          ),
          child: Stack(
            children: [
              Positioned.fill(
                child: GestureDetector(
                  behavior: HitTestBehavior.translucent,
                  onPanStart: onMoveStart,
                  onPanUpdate: onMoveUpdate,
                  onPanEnd: (_) => onInteractionEnd(),
                  child: Padding(
                    padding: EdgeInsets.symmetric(
                      horizontal: resizeHandleWidth,
                      vertical: 6,
                    ),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        task.name?.trim().isNotEmpty == true
                            ? task.name!.trim()
                            : context.l10n.taskBoardDetailUntitledTask,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.typography.small.copyWith(
                          fontWeight: FontWeight.w700,
                          color: accent,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              _TimelineResizeHandle(
                alignment: Alignment.centerLeft,
                width: resizeHandleWidth,
                onPanStart: onResizeStartBegin,
                onPanUpdate: onResizeStartUpdate,
                onPanEnd: (_) => onInteractionEnd(),
              ),
              _TimelineResizeHandle(
                alignment: Alignment.centerRight,
                width: resizeHandleWidth,
                onPanStart: onResizeEndBegin,
                onPanUpdate: onResizeEndUpdate,
                onPanEnd: (_) => onInteractionEnd(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TimelineResizeHandle extends StatelessWidget {
  const _TimelineResizeHandle({
    required this.alignment,
    required this.width,
    required this.onPanStart,
    required this.onPanUpdate,
    required this.onPanEnd,
  });

  final Alignment alignment;
  final double width;
  final void Function(DragStartDetails details) onPanStart;
  final void Function(DragUpdateDetails details) onPanUpdate;
  final void Function(DragEndDetails details) onPanEnd;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Align(
      alignment: alignment,
      child: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onPanStart: onPanStart,
        onPanUpdate: onPanUpdate,
        onPanEnd: onPanEnd,
        child: SizedBox(
          width: width,
          child: Center(
            child: Container(
              width: 3,
              height: 16,
              decoration: BoxDecoration(
                color: theme.colorScheme.foreground.withValues(alpha: 0.68),
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TaskBoardTimelineEmptyState extends StatelessWidget {
  const _TaskBoardTimelineEmptyState({
    required this.unscheduledTasks,
    required this.onTaskTap,
  });

  final List<TaskBoardTask> unscheduledTasks;
  final Future<void> Function(TaskBoardTask task) onTaskTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.muted.withValues(alpha: 0.22),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.72),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.l10n.taskBoardDetailTimelineEmptyTitle,
            style: theme.typography.p.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const shad.Gap(6),
          Text(
            context.l10n.taskBoardDetailTimelineEmptyDescription,
            style: theme.typography.textSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
          if (unscheduledTasks.isNotEmpty) ...[
            const shad.Gap(12),
            _TaskBoardTimelineUnscheduledSection(
              tasks: unscheduledTasks,
              onTaskTap: onTaskTap,
              embedded: true,
            ),
          ],
        ],
      ),
    );
  }
}

class _TaskBoardTimelineUnscheduledSection extends StatelessWidget {
  const _TaskBoardTimelineUnscheduledSection({
    required this.tasks,
    required this.onTaskTap,
    this.embedded = false,
  });

  final List<TaskBoardTask> tasks;
  final Future<void> Function(TaskBoardTask task) onTaskTap;
  final bool embedded;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final child = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          context.l10n.taskBoardDetailTimelineUnscheduledTitle,
          style: theme.typography.p.copyWith(
            fontWeight: FontWeight.w700,
          ),
        ),
        const shad.Gap(8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: tasks
              .map(
                (task) => shad.OutlineButton(
                  onPressed: () => unawaited(onTaskTap(task)),
                  child: Text(
                    task.name?.trim().isNotEmpty == true
                        ? task.name!.trim()
                        : context.l10n.taskBoardDetailUntitledTask,
                  ),
                ),
              )
              .toList(growable: false),
        ),
      ],
    );

    if (embedded) {
      return child;
    }

    return shad.Card(child: child);
  }
}
