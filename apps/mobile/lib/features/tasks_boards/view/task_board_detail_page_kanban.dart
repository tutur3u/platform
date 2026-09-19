part of 'task_board_detail_page.dart';

class _TaskBoardKanbanView extends StatelessWidget {
  const _TaskBoardKanbanView({
    required this.boardId,
    required this.lists,
    required this.tasksByList,
    required this.state,
    required this.board,
    required this.bottomPadding,
    required this.viewportHeight,
    required this.kanbanVerticalScrollController,
    required this.kanbanHorizontalPageController,
    required this.onRequestInitialLoad,
    required this.onRequestListWindowLoad,
    required this.onLoadMore,
    required this.onRetryLoad,
    required this.onTaskTap,
    required this.onTaskMove,
    required this.isBulkSelectMode,
    required this.selectedTaskIds,
    required this.onToggleTaskSelection,
    required this.onCreateTask,
    required this.onEditList,
    required this.onFocusedListChanged,
  });

  final String boardId;
  final List<TaskBoardList> lists;
  final Map<String, List<TaskBoardTask>> tasksByList;
  final TaskBoardDetailState state;
  final TaskBoardDetail board;
  final double bottomPadding;
  final double viewportHeight;
  final ScrollController kanbanVerticalScrollController;
  final PageController kanbanHorizontalPageController;
  final void Function(
    String listId,
    int pageSizeHint,
    TaskBoardDetailState state,
  )
  onRequestInitialLoad;
  final void Function(
    int focusedIndex,
    int pageSizeHint,
    TaskBoardDetailState state,
  )
  onRequestListWindowLoad;
  final Future<void> Function(String listId, int pageSizeHint) onLoadMore;
  final Future<void> Function(String listId, int pageSizeHint) onRetryLoad;
  final Future<void> Function(TaskBoardTask task) onTaskTap;
  final Future<void> Function(TaskBoardTask task) onTaskMove;
  final bool isBulkSelectMode;
  final Set<String> selectedTaskIds;
  final void Function(TaskBoardTask task) onToggleTaskSelection;
  final Future<void> Function(String? listId) onCreateTask;
  final Future<void> Function(TaskBoardList list) onEditList;
  final ValueChanged<int> onFocusedListChanged;

  @override
  Widget build(BuildContext context) {
    final pageSizeHint = _tasksPageSizeHintForViewport(viewportHeight);

    if (state.filteredTasks.isEmpty &&
        (state.searchQuery.trim().isNotEmpty ||
            state.filters.hasAdvancedFilters)) {
      if (state.isLoadingListTasks) {
        return ListView(
          key: PageStorageKey<String>('task-board-kanban-empty-$boardId'),
          controller: kanbanVerticalScrollController,
          primary: false,
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.fromLTRB(16, 0, 16, bottomPadding),
          children: [
            shad.Card(
              child: Row(
                children: [
                  const SizedBox(
                    width: 16,
                    height: 16,
                    child: shad.CircularProgressIndicator(strokeWidth: 2),
                  ),
                  const shad.Gap(10),
                  Text(context.l10n.notificationsLoadingMore),
                ],
              ),
            ),
          ],
        );
      }

      return ListView(
        key: PageStorageKey<String>('task-board-kanban-empty-$boardId'),
        controller: kanbanVerticalScrollController,
        primary: false,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(16, 0, 16, bottomPadding),
        children: [
          if (state.listLoadErrorById.isNotEmpty)
            shad.Card(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(context.l10n.commonSomethingWentWrong),
                  const shad.Gap(10),
                  shad.OutlineButton(
                    onPressed: () => unawaited(
                      context
                          .read<TaskBoardDetailCubit>()
                          .ensureAllListsLoaded(),
                    ),
                    child: Text(context.l10n.commonRetry),
                  ),
                ],
              ),
            )
          else
            shad.Card(child: Text(context.l10n.taskBoardDetailNoMatchingTasks)),
        ],
      );
    }

    final columnHeight = context.isCompact
        ? viewportHeight.clamp(280.0, 2000.0)
        : math.max<double>(280, viewportHeight);

    return LayoutBuilder(
      builder: (context, constraints) {
        final viewportWidth = constraints.maxWidth.isFinite
            ? constraints.maxWidth
            : MediaQuery.sizeOf(context).width;
        if (!context.isCompact) {
          final columns = math.max(2, (viewportWidth / 340).floor());
          final columnWidth = (viewportWidth - 24) / columns;
          return ListView(
            controller: kanbanVerticalScrollController,
            physics: const AlwaysScrollableScrollPhysics(),
            padding: EdgeInsets.zero,
            children: [
              SizedBox(
                height: columnHeight,
                child: NotificationListener<ScrollUpdateNotification>(
                  onNotification: (notification) {
                    if (notification.metrics.axis == Axis.horizontal) {
                      final index = (notification.metrics.pixels / columnWidth)
                          .floor()
                          .clamp(0, math.max(0, lists.length - 1))
                          .toInt();
                      onFocusedListChanged(index);
                      onRequestListWindowLoad(index, pageSizeHint, state);
                    }
                    return false;
                  },
                  child: ListView.builder(
                    key: PageStorageKey<String>(
                      'task-board-wide-kanban-$boardId',
                    ),
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    itemExtent: columnWidth,
                    itemCount: lists.length,
                    itemBuilder: (context, index) => Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      child: _buildColumn(
                        index,
                        pageSizeHint,
                        columnHeight,
                        contentBottomPadding:
                            math.max<double>(
                              96,
                              MediaQuery.paddingOf(context).bottom,
                            ) +
                            8,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          );
        }
        final columnWidth = math.max<double>(288, viewportWidth - 24);

        return ListView(
          key: PageStorageKey<String>('task-board-kanban-$boardId'),
          controller: kanbanVerticalScrollController,
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.only(bottom: bottomPadding),
          children: [
            SizedBox(
              height: columnHeight,
              child: PageView.builder(
                key: PageStorageKey<String>(
                  'task-board-kanban-horizontal-$boardId',
                ),
                controller: kanbanHorizontalPageController,
                physics: const BouncingScrollPhysics(),
                itemCount: lists.length,
                onPageChanged: (index) {
                  onFocusedListChanged(index);
                  onRequestListWindowLoad(index, pageSizeHint, state);
                },
                itemBuilder: (context, index) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: SizedBox(
                        width: columnWidth,
                        child: _buildColumn(
                          index,
                          pageSizeHint,
                          columnHeight,
                          contentBottomPadding:
                              math.max<double>(
                                96,
                                MediaQuery.paddingOf(context).bottom,
                              ) +
                              8,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildColumn(
    int index,
    int pageSizeHint,
    double columnHeight, {
    double contentBottomPadding = 8,
  }) {
    final list = lists[index];
    onRequestInitialLoad(list.id, pageSizeHint, state);
    final hasLoadError = state.listLoadErrorById.containsKey(list.id);
    final listTasks = tasksByList[list.id] ?? const <TaskBoardTask>[];
    return _KanbanColumn(
      board: board,
      list: list,
      tasks: listTasks,
      isTasksLoaded: state.loadedListIds.contains(list.id),
      height: columnHeight,
      contentBottomPadding: contentBottomPadding,
      isLoadingTasks: state.loadingListIds.contains(list.id),
      hasLoadError: hasLoadError,
      hasMoreTasks: state.listHasMoreById[list.id] ?? true,
      onLoadMoreTasks: hasLoadError && listTasks.isEmpty
          ? () => unawaited(onRetryLoad(list.id, pageSizeHint))
          : () => unawaited(onLoadMore(list.id, pageSizeHint)),
      onTaskTap: (task) => unawaited(onTaskTap(task)),
      onTaskMove: (task) => unawaited(onTaskMove(task)),
      isBulkSelectMode: isBulkSelectMode,
      selectedTaskIds: selectedTaskIds,
      onToggleTaskSelection: onToggleTaskSelection,
      onCreateTask: () => unawaited(onCreateTask(list.id)),
      onEditList: () => unawaited(onEditList(list)),
    );
  }
}
