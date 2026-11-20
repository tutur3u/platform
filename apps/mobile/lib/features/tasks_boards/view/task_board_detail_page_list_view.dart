part of 'task_board_detail_page.dart';

class _TaskBoardEnhancedListView extends StatefulWidget {
  const _TaskBoardEnhancedListView({
    required this.boardId,
    required this.lists,
    required this.tasks,
    required this.state,
    required this.board,
    required this.sort,
    required this.scrollController,
    required this.onTaskTap,
    required this.onTaskToggleDone,
    required this.rowActions,
    required this.isBulkSelectMode,
    required this.selectedTaskIds,
    required this.onToggleTaskSelection,
    required this.onLoadMore,
    required this.onQuickAdd,
    required this.clock,
  });

  final String boardId;
  final List<TaskBoardList> lists;
  final List<TaskBoardTask> tasks;
  final TaskBoardDetailState state;
  final TaskBoardDetail board;
  final TaskBoardListViewSortField sort;
  final ScrollController scrollController;
  final void Function(TaskBoardTask task) onTaskTap;
  final void Function(TaskBoardTask task, String targetStatus) onTaskToggleDone;
  final _TaskRowActionHandlers rowActions;
  final bool isBulkSelectMode;
  final Set<String> selectedTaskIds;
  final void Function(TaskBoardTask task) onToggleTaskSelection;
  final VoidCallback onLoadMore;
  final VoidCallback onQuickAdd;
  final DateTime Function() clock;

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
    return widget.lists.any(
      (list) => widget.state.listHasMoreById[list.id] ?? true,
    );
  }

  String _sectionTitle(BuildContext context, TaskListDateBucket bucket) {
    final l10n = context.l10n;
    return switch (bucket) {
      TaskListDateBucket.overdue => l10n.taskBoardListGroupOverdue,
      TaskListDateBucket.today => l10n.taskBoardDetailToday,
      TaskListDateBucket.upcoming => l10n.taskBoardListGroupUpcoming,
      TaskListDateBucket.noDate => l10n.taskBoardListGroupNoDate,
    };
  }

  @override
  Widget build(BuildContext context) {
    final sortedTasks = _sortedTasks;
    final zone = taskTimezone(context);
    final now = widget.clock();
    final today = taskDay(now, zone);
    final sections = buildTaskListDateGroups(
      tasks: sortedTasks,
      lists: widget.lists,
      now: now,
      zone: zone,
    );
    final hasMoreTasks = _hasMoreTasks;
    final loading =
        widget.state.isLoadingListTasks &&
        sortedTasks.isEmpty &&
        sections.isEmpty;

    if (loading) {
      return AppPageListView(
        key: PageStorageKey<String>(
          'task-board-enhanced-list-loading-${widget.boardId}',
        ),
        controller: widget.scrollController,
        primary: false,
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [AppSkeletonRows(count: 5)],
      );
    }

    if (sections.isEmpty) {
      return AppPageListView(
        key: PageStorageKey<String>(
          'task-board-enhanced-list-empty-${widget.boardId}',
        ),
        controller: widget.scrollController,
        primary: false,
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          AppStateMessage.inline(
            key: const ValueKey('task-board-list-empty'),
            icon: LucideIcons.listTodo,
            title: context.l10n.taskBoardListEmptyTitle,
            message: context.l10n.taskBoardDetailNoTasksInList,
            actionLabel: context.l10n.taskBoardDetailCreateTask,
            onAction: widget.onQuickAdd,
          ),
        ],
      );
    }

    var itemCount = hasMoreTasks ? 1 : 0;
    for (final section in sections) {
      itemCount += 1 + section.tasks.length;
    }

    return AppPageListView.builder(
      key: PageStorageKey<String>('task-board-enhanced-list-${widget.boardId}'),
      controller: widget.scrollController,
      primary: false,
      physics: const AlwaysScrollableScrollPhysics(),
      itemCount: itemCount,
      itemBuilder: (context, index) {
        if (hasMoreTasks && index == itemCount - 1) {
          return Padding(
            padding: const EdgeInsets.only(top: AppSpacing.sm),
            child: Center(
              child: widget.state.isLoadingListTasks
                  ? const AppLoadingIndicator()
                  : AppButton.outline(
                      onPressed: widget.onLoadMore,
                      child: Text(context.l10n.timerHistoryLoadMore),
                    ),
            ),
          );
        }

        var cursor = 0;
        for (
          var sectionIndex = 0;
          sectionIndex < sections.length;
          sectionIndex++
        ) {
          final section = sections[sectionIndex];
          if (index == cursor) {
            return Padding(
              padding: EdgeInsets.only(
                top: sectionIndex == 0 ? 0 : AppSpacing.md,
                bottom: AppSpacing.xs,
              ),
              child: AppSectionHeader(
                title: _sectionTitle(context, section.bucket),
                count: section.tasks.length,
              ),
            );
          }
          cursor++;

          for (
            var taskIndex = 0;
            taskIndex < section.tasks.length;
            taskIndex++
          ) {
            if (index != cursor) {
              cursor++;
              continue;
            }

            final task = section.tasks[taskIndex];
            final list = widget.lists.firstWhere(
              (candidate) => candidate.id == task.listId,
              orElse: () => TaskBoardList(
                id: task.listId,
                boardId: widget.board.id,
                name: context.l10n.taskBoardDetailUntitledList,
              ),
            );
            final sliceCount = section.tasks.length;

            return AppGroupedSlice(
              key: ValueKey(task.id),
              position: AppSlicePosition.of(taskIndex, sliceCount),
              child: _TaskCard(
                task: task,
                board: widget.board,
                list: list,
                today: today,
                zone: zone,
                onTap: () => widget.onTaskTap(task),
                onToggleDone: (targetStatus) =>
                    widget.onTaskToggleDone(task, targetStatus),
                rowActions: widget.rowActions,
                isBulkSelectMode: widget.isBulkSelectMode,
                isSelected: widget.selectedTaskIds.contains(task.id),
                onToggleSelected: () => widget.onToggleTaskSelection(task),
              ),
            );
          }
        }

        return const SizedBox.shrink();
      },
    );
  }
}
