part of 'task_board_detail_page.dart';

class _TaskBoardEnhancedListView extends StatefulWidget {
  const _TaskBoardEnhancedListView({
    required this.boardId,
    required this.lists,
    required this.tasks,
    required this.state,
    required this.board,
    required this.bottomPadding,
    required this.scrollController,
    required this.onTaskTap,
    required this.onTaskMove,
    required this.isBulkSelectMode,
    required this.selectedTaskIds,
    required this.onToggleTaskSelection,
    required this.onLoadMore,
    required this.collapsedListIds,
    required this.onToggleListCollapsed,
  });

  final String boardId;
  final List<TaskBoardList> lists;
  final List<TaskBoardTask> tasks;
  final TaskBoardDetailState state;
  final TaskBoardDetail board;
  final double bottomPadding;
  final ScrollController scrollController;
  final void Function(TaskBoardTask task) onTaskTap;
  final void Function(TaskBoardTask task) onTaskMove;
  final bool isBulkSelectMode;
  final Set<String> selectedTaskIds;
  final void Function(TaskBoardTask task) onToggleTaskSelection;
  final VoidCallback onLoadMore;
  final Set<String> collapsedListIds;
  final void Function(String listId) onToggleListCollapsed;

  @override
  State<_TaskBoardEnhancedListView> createState() =>
      _TaskBoardEnhancedListViewState();
}

class _TaskBoardEnhancedListViewState
    extends State<_TaskBoardEnhancedListView> {
  TaskBoardListViewSortField _sort = (field: 'created_at', ascending: false);

  List<TaskBoardTask> get _sortedTasks {
    return sortTaskBoardListViewTasks(widget.tasks, _sort);
  }

  @override
  void initState() {
    super.initState();
    widget.scrollController.addListener(_onScroll);
  }

  @override
  void didUpdateWidget(covariant _TaskBoardEnhancedListView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.scrollController == widget.scrollController) {
      return;
    }
    oldWidget.scrollController.removeListener(_onScroll);
    widget.scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    widget.scrollController.removeListener(_onScroll);
    super.dispose();
  }

  void _onScroll() {
    final controller = widget.scrollController;
    if (!controller.hasClients ||
        !_hasMoreTasks ||
        widget.state.isLoadingListTasks) {
      return;
    }

    final position = controller.position;
    if (position.pixels >= position.maxScrollExtent - 360) {
      widget.onLoadMore();
    }
  }

  bool get _hasMoreTasks {
    return widget.lists.any(
      (list) => widget.state.listHasMoreById[list.id] ?? true,
    );
  }

  void _showSortBottomSheet() {
    unawaited(
      showAdaptiveSheet<void>(
        context: context,
        backgroundColor: shad.Theme.of(context).colorScheme.background,
        builder: (context) => _SortBottomSheet(
          currentField: _sort.field,
          ascending: _sort.ascending,
          onSortSelected: (field, {required ascending}) {
            setState(() {
              _sort = (field: field, ascending: ascending);
            });
            Navigator.pop(context);
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final sortedTasks = _sortedTasks;
    final entries = _buildEntries(sortedTasks);
    final hasMoreTasks = _hasMoreTasks;

    if (sortedTasks.isEmpty) {
      return ListView(
        key: PageStorageKey<String>(
          'task-board-enhanced-list-empty-${widget.boardId}',
        ),
        controller: widget.scrollController,
        primary: false,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(16, 0, 16, widget.bottomPadding),
        children: [
          shad.Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.inbox_outlined,
                    size: 48,
                    color: theme.colorScheme.mutedForeground,
                  ),
                  const shad.Gap(16),
                  Text(
                    context.l10n.taskBoardDetailNoTasksInList,
                    style: theme.typography.large,
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
        ],
      );
    }

    return ListView.builder(
      key: PageStorageKey<String>('task-board-enhanced-list-${widget.boardId}'),
      controller: widget.scrollController,
      primary: false,
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.fromLTRB(16, 0, 16, widget.bottomPadding),
      itemCount: entries.length + 1 + (hasMoreTasks ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == 0) {
          return _buildListToolbar(sortedTasks.length);
        }

        final entryIndex = index - 1;

        if (entryIndex == entries.length && hasMoreTasks) {
          return Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Center(
              child: widget.state.isLoadingListTasks
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
          );
        }

        if (entryIndex >= entries.length) return const SizedBox.shrink();

        final entry = entries[entryIndex];
        final list = entry.list;
        if (entry.task == null) {
          return _ListSectionHeader(
            list: list,
            taskCount: entry.taskCount,
            topPadding: entryIndex == 0 ? 0 : 14,
            isCollapsed: entry.isCollapsed,
            onToggleCollapsed: () => widget.onToggleListCollapsed(list.id),
          );
        }

        final task = entry.task!;
        return _TaskCard(
          task: task,
          board: widget.board,
          lists: widget.lists,
          isLast: entry.isLastInSection,
          onTap: () => widget.onTaskTap(task),
          onMove: () => widget.onTaskMove(task),
          isBulkSelectMode: widget.isBulkSelectMode,
          isSelected: widget.selectedTaskIds.contains(task.id),
          onToggleSelected: () => widget.onToggleTaskSelection(task),
        );
      },
    );
  }

  List<_TaskBoardListViewEntry> _buildEntries(List<TaskBoardTask> sortedTasks) {
    final grouped = <String, List<TaskBoardTask>>{};
    for (final task in sortedTasks) {
      grouped.putIfAbsent(task.listId, () => <TaskBoardTask>[]).add(task);
    }

    final fallbackListsById = {
      for (final task in sortedTasks)
        if (!widget.lists.any((list) => list.id == task.listId))
          task.listId: TaskBoardList(
            id: task.listId,
            boardId: widget.board.id,
            name: context.l10n.taskBoardDetailUntitledList,
          ),
    };
    final orderedLists = [
      ...widget.lists,
      ...fallbackListsById.values,
    ];
    final entries = <_TaskBoardListViewEntry>[];

    for (final list in orderedLists) {
      final listTasks = grouped[list.id] ?? const <TaskBoardTask>[];
      if (listTasks.isEmpty) continue;
      final isCollapsed = widget.collapsedListIds.contains(list.id);
      entries.add(
        _TaskBoardListViewEntry.header(
          list,
          listTasks.length,
          isCollapsed: isCollapsed,
        ),
      );
      if (isCollapsed) continue;
      for (var index = 0; index < listTasks.length; index++) {
        entries.add(
          _TaskBoardListViewEntry.task(
            list,
            listTasks[index],
            isLastInSection: index == listTasks.length - 1,
          ),
        );
      }
    }

    return entries;
  }

  Widget _buildListToolbar(int taskCount) {
    final theme = shad.Theme.of(context);
    final sortLabel = taskBoardListViewSortFieldLabel(context, _sort.field);
    final isAscending = _sort.ascending;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: _showSortBottomSheet,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: theme.colorScheme.muted.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: theme.colorScheme.border.withValues(alpha: 0.5),
            ),
          ),
          child: Row(
            children: [
              shad.OutlineBadge(
                child: Text(context.l10n.taskBoardsTasksCount(taskCount)),
              ),
              const shad.Gap(8),
              Icon(
                Icons.sort,
                size: 16,
                color: theme.colorScheme.mutedForeground,
              ),
              const shad.Gap(6),
              Flexible(
                child: Text(
                  '${context.l10n.sort}: $sortLabel',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w500,
                    color: theme.colorScheme.foreground,
                  ),
                ),
              ),
              const shad.Gap(4),
              Icon(
                isAscending ? Icons.arrow_upward : Icons.arrow_downward,
                size: 14,
                color: theme.colorScheme.primary,
              ),
              const Spacer(),
              Icon(
                Icons.expand_more,
                size: 16,
                color: theme.colorScheme.mutedForeground,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TaskBoardListViewEntry {
  const _TaskBoardListViewEntry._({
    required this.list,
    required this.taskCount,
    required this.isLastInSection,
    required this.isCollapsed,
    this.task,
  });

  factory _TaskBoardListViewEntry.header(
    TaskBoardList list,
    int taskCount, {
    required bool isCollapsed,
  }) {
    return _TaskBoardListViewEntry._(
      list: list,
      taskCount: taskCount,
      isLastInSection: false,
      isCollapsed: isCollapsed,
    );
  }

  factory _TaskBoardListViewEntry.task(
    TaskBoardList list,
    TaskBoardTask task, {
    required bool isLastInSection,
  }) {
    return _TaskBoardListViewEntry._(
      list: list,
      task: task,
      taskCount: 0,
      isLastInSection: isLastInSection,
      isCollapsed: false,
    );
  }

  final TaskBoardList list;
  final TaskBoardTask? task;
  final int taskCount;
  final bool isLastInSection;
  final bool isCollapsed;
}

class _ListSectionHeader extends StatelessWidget {
  const _ListSectionHeader({
    required this.list,
    required this.taskCount,
    required this.topPadding,
    required this.isCollapsed,
    required this.onToggleCollapsed,
  });

  final TaskBoardList list;
  final int taskCount;
  final double topPadding;
  final bool isCollapsed;
  final VoidCallback onToggleCollapsed;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final style = _taskBoardListVisualStyle(context, list);
    final title = list.name?.trim().isNotEmpty == true
        ? list.name!.trim()
        : context.l10n.taskBoardDetailUntitledList;

    return Padding(
      padding: EdgeInsets.only(top: topPadding, bottom: 8),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onToggleCollapsed,
          borderRadius: BorderRadius.circular(8),
          child: Ink(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: style.surface.withValues(alpha: 0.42),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: style.surfaceBorder),
            ),
            child: Row(
              children: [
                Tooltip(
                  message: isCollapsed
                      ? context.l10n.taskBoardDetailExpandList
                      : context.l10n.taskBoardDetailCollapseList,
                  child: Icon(
                    isCollapsed
                        ? Icons.chevron_right_rounded
                        : Icons.expand_more_rounded,
                    size: 18,
                    color: style.statusBadge.textColor,
                  ),
                ),
                const shad.Gap(6),
                Icon(
                  style.statusIcon,
                  size: 16,
                  color: style.statusBadge.textColor,
                ),
                const shad.Gap(8),
                Expanded(
                  child: Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.typography.p.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const shad.Gap(8),
                Text(
                  style.statusLabel,
                  style: theme.typography.small.copyWith(
                    color: style.statusBadge.textColor,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const shad.Gap(8),
                shad.OutlineBadge(
                  child: Text(context.l10n.taskBoardsTasksCount(taskCount)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
