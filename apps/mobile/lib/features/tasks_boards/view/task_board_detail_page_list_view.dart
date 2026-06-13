part of 'task_board_detail_page.dart';

class _TaskBoardEnhancedListView extends StatefulWidget {
  const _TaskBoardEnhancedListView({
    required this.boardId,
    required this.lists,
    required this.tasks,
    required this.state,
    required this.board,
    required this.sort,
    required this.bottomPadding,
    required this.scrollController,
    required this.onTaskTap,
    required this.onTaskToggleDone,
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
  final TaskBoardListViewSortField sort;
  final double bottomPadding;
  final ScrollController scrollController;
  final void Function(TaskBoardTask task) onTaskTap;
  final void Function(TaskBoardTask task, String targetStatus) onTaskToggleDone;
  final bool isBulkSelectMode;
  final Set<String> selectedTaskIds;
  final void Function(TaskBoardTask task) onToggleTaskSelection;
  final VoidCallback onLoadMore;
  final Set<String> collapsedListIds;
  final void Function(TaskBoardList list) onToggleListCollapsed;

  @override
  State<_TaskBoardEnhancedListView> createState() =>
      _TaskBoardEnhancedListViewState();
}

class _TaskBoardEnhancedListViewState
    extends State<_TaskBoardEnhancedListView> {
  List<TaskBoardTask> get _sortedTasks {
    return sortTaskBoardListViewTasks(widget.tasks, widget.sort);
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
    return widget.lists.any((list) {
      if (_shouldDeferListLoading(list)) {
        return false;
      }
      return widget.state.listHasMoreById[list.id] ?? true;
    });
  }

  bool _shouldDeferListLoading(TaskBoardList list) {
    if (!_taskBoardListIsTerminalInListView(list)) {
      return false;
    }
    if (!widget.collapsedListIds.contains(list.id)) {
      return false;
    }
    return !widget.state.listTasksByListId.containsKey(list.id) &&
        !widget.state.loadedListIds.contains(list.id) &&
        !widget.state.loadingListIds.contains(list.id) &&
        !widget.state.listLoadErrorById.containsKey(list.id);
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final sortedTasks = _sortedTasks;
    final sections = _buildSections(sortedTasks);
    final hasMoreTasks = _hasMoreTasks;

    if (sections.isEmpty) {
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
      itemCount: sections.length + (hasMoreTasks ? 1 : 0),
      itemBuilder: (context, index) {
        final sectionIndex = index;

        if (sectionIndex == sections.length && hasMoreTasks) {
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

        if (sectionIndex >= sections.length) return const SizedBox.shrink();

        final section = sections[sectionIndex];
        return _TaskListStickySection(
          list: section.list,
          tasks: section.tasks,
          board: widget.board,
          lists: widget.lists,
          topPadding: sectionIndex == 0 ? 0 : 10,
          isCollapsed: section.isCollapsed,
          onToggleCollapsed: () => widget.onToggleListCollapsed(section.list),
          onTaskTap: widget.onTaskTap,
          onTaskToggleDone: widget.onTaskToggleDone,
          isBulkSelectMode: widget.isBulkSelectMode,
          selectedTaskIds: widget.selectedTaskIds,
          onToggleTaskSelection: widget.onToggleTaskSelection,
        );
      },
    );
  }

  List<_TaskBoardListViewSection> _buildSections(
    List<TaskBoardTask> sortedTasks,
  ) {
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
    final orderedLists = [...widget.lists, ...fallbackListsById.values];
    final sections = <_TaskBoardListViewSection>[];

    for (final list in orderedLists) {
      final listTasks = sortTaskBoardListViewTasksForList(
        list,
        grouped[list.id] ?? const <TaskBoardTask>[],
      );
      final isCollapsed = widget.collapsedListIds.contains(list.id);
      if (listTasks.isEmpty) {
        if (list.taskCount == 0) {
          continue;
        }
        final isDeferredTerminalList =
            list.taskCount == null &&
            _taskBoardListIsTerminalInListView(list) &&
            !widget.state.loadedListIds.contains(list.id) &&
            !widget.state.loadingListIds.contains(list.id) &&
            !widget.state.listLoadErrorById.containsKey(list.id);
        if (!isDeferredTerminalList) {
          continue;
        }
      }
      sections.add(
        _TaskBoardListViewSection(list, listTasks, isCollapsed: isCollapsed),
      );
    }

    return sections;
  }
}

class _TaskBoardListViewSection {
  const _TaskBoardListViewSection(
    this.list,
    this.tasks, {
    required this.isCollapsed,
  });

  final TaskBoardList list;
  final List<TaskBoardTask> tasks;
  final bool isCollapsed;
}

class _TaskListStickySection extends StatelessWidget {
  const _TaskListStickySection({
    required this.list,
    required this.tasks,
    required this.board,
    required this.lists,
    required this.topPadding,
    required this.isCollapsed,
    required this.onToggleCollapsed,
    required this.onTaskTap,
    required this.onTaskToggleDone,
    required this.isBulkSelectMode,
    required this.selectedTaskIds,
    required this.onToggleTaskSelection,
  });

  final TaskBoardList list;
  final List<TaskBoardTask> tasks;
  final TaskBoardDetail board;
  final List<TaskBoardList> lists;
  final double topPadding;
  final bool isCollapsed;
  final VoidCallback onToggleCollapsed;
  final void Function(TaskBoardTask task) onTaskTap;
  final void Function(TaskBoardTask task, String targetStatus) onTaskToggleDone;
  final bool isBulkSelectMode;
  final Set<String> selectedTaskIds;
  final void Function(TaskBoardTask task) onToggleTaskSelection;

  @override
  Widget build(BuildContext context) {
    final style = _taskBoardListVisualStyle(context, list);

    return Padding(
      padding: EdgeInsets.only(top: topPadding, bottom: 14),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: style.surface.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: style.surfaceBorder.withValues(alpha: 0.24),
          ),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: Column(
            children: [
              _ListSectionHeader(
                list: list,
                style: style,
                isCollapsed: isCollapsed,
                onToggleCollapsed: onToggleCollapsed,
              ),
              if (!isCollapsed)
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                  child: Column(
                    children: [
                      for (var index = 0; index < tasks.length; index++)
                        _TaskCard(
                          task: tasks[index],
                          board: board,
                          lists: lists,
                          listStyle: style,
                          isLast: index == tasks.length - 1,
                          onTap: () => onTaskTap(tasks[index]),
                          onToggleDone: (targetStatus) =>
                              onTaskToggleDone(tasks[index], targetStatus),
                          isBulkSelectMode: isBulkSelectMode,
                          isSelected: selectedTaskIds.contains(tasks[index].id),
                          onToggleSelected: () =>
                              onToggleTaskSelection(tasks[index]),
                        ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ListSectionHeader extends StatelessWidget {
  const _ListSectionHeader({
    required this.list,
    required this.style,
    required this.isCollapsed,
    required this.onToggleCollapsed,
  });

  final TaskBoardList list;
  final _TaskBoardListVisualStyle style;
  final bool isCollapsed;
  final VoidCallback onToggleCollapsed;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final title = list.name?.trim().isNotEmpty == true
        ? list.name!.trim()
        : context.l10n.taskBoardDetailUntitledList;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onToggleCollapsed,
        child: Ink(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 9),
          decoration: BoxDecoration(
            color: style.surface.withValues(alpha: 0.2),
            border: Border(
              bottom: isCollapsed
                  ? BorderSide.none
                  : BorderSide(
                      color: style.surfaceBorder.withValues(alpha: 0.2),
                    ),
            ),
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
                  size: 17,
                  color: style.accent,
                ),
              ),
              const shad.Gap(4),
              Icon(style.statusIcon, size: 15, color: style.accent),
              const shad.Gap(7),
              Expanded(
                child: Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.small.copyWith(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    height: 1.15,
                    color: style.accent,
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
