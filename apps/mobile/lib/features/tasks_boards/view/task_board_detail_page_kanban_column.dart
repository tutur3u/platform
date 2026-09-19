part of 'task_board_detail_page.dart';

class _KanbanColumn extends StatelessWidget {
  const _KanbanColumn({
    required this.board,
    required this.list,
    required this.tasks,
    required this.isTasksLoaded,
    required this.height,
    required this.isLoadingTasks,
    required this.hasLoadError,
    required this.hasMoreTasks,
    required this.onTaskTap,
    required this.onTaskMove,
    required this.isBulkSelectMode,
    required this.selectedTaskIds,
    required this.onToggleTaskSelection,
    required this.onCreateTask,
    this.onLoadMoreTasks,
    this.onEditList,
  });

  final TaskBoardDetail board;
  final TaskBoardList list;
  final List<TaskBoardTask> tasks;
  final bool isTasksLoaded;
  final double height;
  final bool isLoadingTasks;
  final bool hasLoadError;
  final bool hasMoreTasks;
  final VoidCallback? onLoadMoreTasks;
  final void Function(TaskBoardTask task) onTaskTap;
  final void Function(TaskBoardTask task) onTaskMove;
  final bool isBulkSelectMode;
  final Set<String> selectedTaskIds;
  final void Function(TaskBoardTask task) onToggleTaskSelection;
  final VoidCallback onCreateTask;
  final VoidCallback? onEditList;

  @override
  Widget build(BuildContext context) {
    final title = list.name?.trim().isNotEmpty == true
        ? list.name!.trim()
        : context.l10n.taskBoardDetailUntitledList;
    final style = _taskBoardListVisualStyle(context, list);
    final theme = shad.Theme.of(context);

    return SizedBox(
      width: double.infinity,
      height: height,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: shad.Card(
          padding: EdgeInsets.zero,
          child: ColoredBox(
            color: style.accent.withValues(alpha: 0.05),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        decoration: BoxDecoration(
                          border: Border(
                            bottom: BorderSide(color: style.surfaceBorder),
                          ),
                        ),
                        padding: const EdgeInsets.fromLTRB(10, 8, 6, 8),
                        child: Row(
                          children: [
                            Icon(
                              style.statusIcon,
                              size: 14,
                              color: style.statusBadge.textColor,
                            ),
                            const shad.Gap(6),
                            Expanded(
                              child: Text(
                                title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: theme.typography.small.copyWith(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            const shad.Gap(4),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 7,
                                vertical: 3,
                              ),
                              decoration: BoxDecoration(
                                color: theme.colorScheme.background.withValues(
                                  alpha: 0.72,
                                ),
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(
                                  color: style.accent.withValues(alpha: 0.2),
                                ),
                              ),
                              child: Text(
                                context.l10n.taskBoardsTasksCount(tasks.length),
                                style: theme.typography.small.copyWith(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            shad.IconButton.ghost(
                              icon: Icon(Icons.add, color: style.accent),
                              onPressed: onCreateTask,
                            ),
                            if (onEditList != null)
                              PopupMenuButton<_BoardListMenuAction>(
                                tooltip:
                                    context.l10n.taskBoardDetailListActions,
                                onSelected: (action) {
                                  if (action == _BoardListMenuAction.edit) {
                                    onEditList?.call();
                                  }
                                },
                                itemBuilder: (context) => [
                                  PopupMenuItem<_BoardListMenuAction>(
                                    value: _BoardListMenuAction.edit,
                                    child: Text(
                                      context.l10n.taskBoardDetailEditList,
                                    ),
                                  ),
                                ],
                                child: const Padding(
                                  padding: EdgeInsets.only(left: 6),
                                  child: Icon(Icons.more_horiz, size: 18),
                                ),
                              ),
                          ],
                        ),
                      ),
                      Expanded(
                        child: tasks.isEmpty && isLoadingTasks
                            ? _PaginatedPlaceholder(
                                minHeight: 170,
                                horizontalPadding: const EdgeInsets.all(10),
                                style: style,
                                state: _PaginatedPlaceholderState.loading,
                                onCreateTask: onCreateTask,
                              )
                            : tasks.isEmpty && hasLoadError
                            ? _PaginatedPlaceholder(
                                minHeight: 170,
                                horizontalPadding: const EdgeInsets.all(10),
                                style: style,
                                state: _PaginatedPlaceholderState.error,
                                onCreateTask: onCreateTask,
                                onRetry: onLoadMoreTasks,
                              )
                            : tasks.isEmpty && !isTasksLoaded
                            ? _PaginatedPlaceholder(
                                minHeight: 170,
                                horizontalPadding: const EdgeInsets.all(10),
                                style: style,
                                state: _PaginatedPlaceholderState.notLoaded,
                                onCreateTask: onCreateTask,
                              )
                            : tasks.isEmpty
                            ? _PaginatedPlaceholder(
                                minHeight: 170,
                                horizontalPadding: const EdgeInsets.all(10),
                                style: style,
                                state: _PaginatedPlaceholderState.empty,
                                onCreateTask: onCreateTask,
                              )
                            : NotificationListener<ScrollNotification>(
                                onNotification: (notification) {
                                  final metrics = notification.metrics;
                                  if (notification.depth == 0 &&
                                      hasMoreTasks &&
                                      !isLoadingTasks &&
                                      metrics.pixels >=
                                          metrics.maxScrollExtent - 320) {
                                    onLoadMoreTasks?.call();
                                  }
                                  return false;
                                },
                                child: ListView.separated(
                                  key: PageStorageKey<String>(
                                    'kanban-tasks-${board.id}-${list.id}',
                                  ),
                                  primary: false,
                                  physics:
                                      const AlwaysScrollableScrollPhysics(),
                                  padding: const EdgeInsets.fromLTRB(
                                    8,
                                    8,
                                    8,
                                    8,
                                  ),
                                  itemCount:
                                      tasks.length +
                                      ((isLoadingTasks || hasMoreTasks)
                                          ? 1
                                          : 0),
                                  separatorBuilder: (_, _) => const shad.Gap(6),
                                  itemBuilder: (context, index) {
                                    if (index >= tasks.length) {
                                      if (isLoadingTasks) {
                                        return const Center(
                                          child: SizedBox(
                                            width: 16,
                                            height: 16,
                                            child:
                                                shad.CircularProgressIndicator(
                                                  strokeWidth: 2,
                                                ),
                                          ),
                                        );
                                      }
                                      return Center(
                                        child: shad.OutlineButton(
                                          onPressed: onLoadMoreTasks,
                                          child: Text(
                                            context.l10n.timerHistoryLoadMore,
                                          ),
                                        ),
                                      );
                                    }
                                    final task = tasks[index];
                                    return _BoardTaskTile(
                                      board: board,
                                      list: list,
                                      listStyle: style,
                                      task: task,
                                      onTap: () => onTaskTap(task),
                                      onMove: () => onTaskMove(task),
                                      isBulkSelectMode: isBulkSelectMode,
                                      isSelected: selectedTaskIds.contains(
                                        task.id,
                                      ),
                                      onToggleSelected: () =>
                                          onToggleTaskSelection(task),
                                    );
                                  },
                                ),
                              ),
                      ),
                      // Container(
                      //   decoration: BoxDecoration(
                      //     border: Border(
                      //       top: BorderSide(color: style.surfaceBorder),
                      //     ),
                      //   ),
                      //   padding: const EdgeInsets.all(8),
                      //   child: InkWell(
                      //     borderRadius: BorderRadius.circular(8),
                      //     onTap: onCreateTask,
                      //     child: Container(
                      //       width: double.infinity,
                      //       padding: const EdgeInsets.symmetric(
                      //         vertical: 7,
                      //         horizontal: 10,
                      //       ),
                      //       decoration: BoxDecoration(
                      //         borderRadius: BorderRadius.circular(8),
                      //         border: Border.all(color: style.surfaceBorder),
                      //       ),
                      //       child: Row(
                      //         mainAxisSize: MainAxisSize.min,
                      //         children: [
                      //           Icon(
                      //             Icons.add,
                      //             size: 14,
                      //             color: theme.colorScheme.mutedForeground,
                      //           ),
                      //           const shad.Gap(4),
                      //           Text(
                      //             context.l10n.taskBoardDetailCreateTask,
                      //             style: theme.typography.small.copyWith(
                      //               fontSize: 12,
                      //               color: theme.colorScheme.mutedForeground,
                      //             ),
                      //           ),
                      //         ],
                      //       ),
                      //     ),
                      //   ),
                      // ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

enum _PaginatedPlaceholderState { loading, notLoaded, empty, error }
