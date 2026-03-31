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

class _TaskBoardTimelineView extends StatefulWidget {
  const _TaskBoardTimelineView({
    required this.board,
    required this.lists,
    required this.tasksByList,
    required this.bottomPadding,
    required this.onTaskTap,
    required this.onTimelineTaskCommit,
  });

  final TaskBoardDetail board;
  final List<TaskBoardList> lists;
  final Map<String, List<TaskBoardTask>> tasksByList;
  final double bottomPadding;
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

  final ScrollController _horizontalScrollController = ScrollController();
  final Map<String, GlobalKey> _rowKeys = <String, GlobalKey>{};
  final Map<String, _TimelineDraft> _drafts = <String, _TimelineDraft>{};
  _TimelineInteraction? _interaction;

  @override
  void dispose() {
    _horizontalScrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final now = DateTime.now();
    final allVisibleTasks = widget.lists
        .expand(
          (list) => widget.tasksByList[list.id] ?? const <TaskBoardTask>[],
        )
        .toList(growable: false);
    final scheduledTasks = allVisibleTasks
        .where(_hasSchedule)
        .toList(
          growable: false,
        );
    final unscheduledTasks = allVisibleTasks
        .where((task) => !_hasSchedule(task))
        .toList(growable: false);
    final timelineBounds = _resolveTimelineBounds(scheduledTasks, now);
    final dayCount = timelineBounds.$2.difference(timelineBounds.$1).inDays + 1;
    final timelineWidth = math.max(dayCount * _dayWidth, 420);
    final listLayouts = <String, List<_TimelineTaskLayout>>{
      for (final list in widget.lists)
        list.id: _buildTaskLayoutsForList(list.id),
    };

    return ListView(
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
                    controller: _horizontalScrollController,
                    scrollDirection: Axis.horizontal,
                    child: SizedBox(
                      width: _sidebarWidth + timelineWidth,
                      child: Column(
                        children: [
                          _TimelineHeader(
                            startDate: timelineBounds.$1,
                            dayCount: dayCount,
                          ),
                          for (final list in widget.lists)
                            _TimelineListRow(
                              key: _rowKeyFor(list.id),
                              list: list,
                              layouts:
                                  listLayouts[list.id] ??
                                  const <_TimelineTaskLayout>[],
                              timelineStart: timelineBounds.$1,
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
      ],
    );
  }

  GlobalKey _rowKeyFor(String listId) =>
      _rowKeys.putIfAbsent(listId, GlobalKey.new);

  List<_TimelineTaskLayout> _buildTaskLayoutsForList(String listId) {
    final allTasks = widget.lists
        .expand(
          (list) => widget.tasksByList[list.id] ?? const <TaskBoardTask>[],
        )
        .toList(growable: false);
    final scheduled =
        allTasks
            .map((task) {
              final draft = _drafts[task.id];
              final effectiveListId = draft?.listId ?? task.listId;
              if (effectiveListId != listId) {
                return null;
              }
              final schedule = _scheduleForTask(task, draft: draft);
              if (schedule == null) return null;
              return (task: task, start: schedule.$1, end: schedule.$2);
            })
            .whereType<({TaskBoardTask task, DateTime start, DateTime end})>()
            .toList(growable: false)
          ..sort((a, b) {
            final byStart = a.start.compareTo(b.start);
            if (byStart != 0) return byStart;
            return a.end.compareTo(b.end);
          });

    final laneEnds = <DateTime>[];
    final layouts = <_TimelineTaskLayout>[];

    for (final entry in scheduled) {
      var lane = 0;
      while (lane < laneEnds.length &&
          !entry.start.isAfter(laneEnds[lane].add(const Duration(days: 1)))) {
        lane += 1;
      }
      if (lane == laneEnds.length) {
        laneEnds.add(entry.end);
      } else {
        laneEnds[lane] = entry.end;
      }
      layouts.add(
        _TimelineTaskLayout(
          task: entry.task,
          startDate: entry.start,
          endDate: entry.end,
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

  bool _hasSchedule(TaskBoardTask task) =>
      task.startDate != null || task.endDate != null;

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
    List<TaskBoardTask> tasks,
    DateTime now,
  ) {
    DateTime? earliest;
    DateTime? latest;

    for (final task in tasks) {
      final schedule = _scheduleForTask(task);
      if (schedule == null) continue;
      earliest = earliest == null || schedule.$1.isBefore(earliest)
          ? schedule.$1
          : earliest;
      latest = latest == null || schedule.$2.isAfter(latest)
          ? schedule.$2
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
  });

  final DateTime startDate;
  final int dayCount;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();

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
          for (var dayIndex = 0; dayIndex < dayCount; dayIndex++)
            Container(
              width: _TaskBoardTimelineViewState._dayWidth,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                border: Border(
                  left: BorderSide(
                    color: theme.colorScheme.border.withValues(alpha: 0.46),
                  ),
                ),
              ),
              child: Text(
                DateFormat.MMMd(locale).format(
                  startDate.add(Duration(days: dayIndex)),
                ),
                style: theme.typography.small.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _TimelineListRow extends StatelessWidget {
  const _TimelineListRow({
    required this.list,
    required this.layouts,
    required this.timelineStart,
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
    final accent = switch (task.priority) {
      'critical' => theme.colorScheme.destructive,
      'high' => const Color(0xFFF59E0B),
      'low' => theme.colorScheme.primary.withValues(alpha: 0.76),
      _ => const Color(0xFF6366F1),
    };

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
