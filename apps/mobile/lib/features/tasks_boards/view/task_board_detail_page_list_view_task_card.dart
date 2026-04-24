part of 'task_board_detail_page.dart';

class _TaskCard extends StatelessWidget {
  const _TaskCard({
    required this.task,
    required this.board,
    required this.lists,
    required this.isLast,
    required this.onTap,
    required this.onMove,
    required this.isBulkSelectMode,
    required this.isSelected,
    required this.onToggleSelected,
  });

  final TaskBoardTask task;
  final TaskBoardDetail board;
  final List<TaskBoardList> lists;
  final bool isLast;
  final VoidCallback onTap;
  final VoidCallback onMove;
  final bool isBulkSelectMode;
  final bool isSelected;
  final VoidCallback onToggleSelected;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final list = lists.firstWhere(
      (l) => l.id == task.listId,
      orElse: () => TaskBoardList(
        id: task.listId,
        boardId: board.id,
        name: 'Unknown',
      ),
    );
    final listStyle = _taskBoardListVisualStyle(context, list);
    final isOverdue = _taskIsOverdueForList(task, list);
    final isCompleted = _taskIsCompletedInBoard(task, list);
    final borderColor = isSelected
        ? theme.colorScheme.primary
        : theme.colorScheme.border.withValues(alpha: 0.35);

    return Padding(
      padding: EdgeInsets.only(bottom: isLast ? 0 : 8),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: Material(
          color: theme.colorScheme.card,
          child: InkWell(
            onTap: isBulkSelectMode ? onToggleSelected : onTap,
            onLongPress: onToggleSelected,
            child: Container(
              decoration: BoxDecoration(
                border: Border(
                  top: BorderSide(color: borderColor),
                  right: BorderSide(color: borderColor),
                  bottom: BorderSide(color: borderColor),
                  left: BorderSide(
                    color: listStyle.accent.withValues(alpha: 0.8),
                    width: 4,
                  ),
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 10,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        if (isBulkSelectMode) ...[
                          Center(
                            child: Icon(
                              isSelected
                                  ? Icons.check_circle
                                  : Icons.radio_button_unchecked,
                              size: 20,
                              color: isSelected
                                  ? theme.colorScheme.primary
                                  : theme.colorScheme.mutedForeground,
                            ),
                          ),
                          const shad.Gap(8),
                        ],
                        Center(
                          child: _TaskStatusIcon(task: task, list: list),
                        ),
                        const shad.Gap(8),
                        Expanded(
                          child: Text(
                            task.name?.trim().isNotEmpty == true
                                ? task.name!.trim()
                                : context.l10n.taskBoardDetailUntitledTask,
                            style: theme.typography.p.copyWith(
                              fontWeight: FontWeight.w600,
                              decoration: isCompleted
                                  ? TextDecoration.lineThrough
                                  : null,
                              color: isCompleted
                                  ? theme.colorScheme.mutedForeground
                                  : theme.colorScheme.foreground,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    const shad.Gap(8),
                    const Divider(height: 1),
                    const shad.Gap(8),
                    Row(
                      children: [
                        Expanded(
                          child: _TaskMetadataRow(
                            task: task,
                            board: board,
                            isOverdue: isOverdue,
                            isCompleted: isCompleted,
                          ),
                        ),
                        if (task.assignees.isNotEmpty) ...[
                          const shad.Gap(8),
                          _ListViewAssigneeAvatarStack(
                            assignees: task.assignees,
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TaskStatusIcon extends StatelessWidget {
  const _TaskStatusIcon({required this.task, required this.list});

  final TaskBoardTask task;
  final TaskBoardList list;

  @override
  Widget build(BuildContext context) {
    final colors = context.dynamicColors;

    // Board lists are the canonical workflow state, so tasks in done/closed
    // lists should read as completed even when their task row still has dates.
    if (_taskIsCompletedInBoard(task, list)) {
      return Icon(
        Icons.check_circle,
        color: colors.green,
        size: 18,
      );
    }

    return switch (TaskBoardList.normalizeSupportedStatus(list.status)) {
      'done' => Icon(
        Icons.check_circle_outline,
        color: colors.green,
        size: 18,
      ),
      'not_started' => Icon(
        Icons.radio_button_unchecked,
        color: colors.gray,
        size: 18,
      ),
      'active' => Icon(
        Icons.pending_outlined,
        color: colors.blue,
        size: 18,
      ),
      'closed' => Icon(
        Icons.block_outlined,
        color: colors.gray,
        size: 18,
      ),
      _ =>
        task.completed == true
            ? Icon(
                Icons.check_circle_outline,
                color: colors.yellow,
                size: 18,
              )
            : Icon(
                Icons.circle_outlined,
                color: Theme.of(
                  context,
                ).colorScheme.onSurface.withValues(alpha: 0.4),
                size: 18,
              ),
    };
  }
}
