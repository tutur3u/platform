part of 'task_board_detail_page.dart';

class _TaskCard extends StatelessWidget {
  const _TaskCard({
    required this.task,
    required this.board,
    required this.lists,
    required this.listStyle,
    required this.isLast,
    required this.onTap,
    required this.onToggleDone,
    required this.isBulkSelectMode,
    required this.isSelected,
    required this.onToggleSelected,
  });

  final TaskBoardTask task;
  final TaskBoardDetail board;
  final List<TaskBoardList> lists;
  final _TaskBoardListVisualStyle listStyle;
  final bool isLast;
  final VoidCallback onTap;
  final void Function(String targetStatus) onToggleDone;
  final bool isBulkSelectMode;
  final bool isSelected;
  final VoidCallback onToggleSelected;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final list = lists.firstWhere(
      (l) => l.id == task.listId,
      orElse: () =>
          TaskBoardList(id: task.listId, boardId: board.id, name: 'Unknown'),
    );
    final isOverdue = _taskIsOverdueForList(task, list);
    final isCompleted = _taskIsCompletedInBoard(task, list);
    final normalizedStatus = TaskBoardList.normalizeSupportedStatus(
      list.status,
    );
    final doneTargetStatus = normalizedStatus == 'done'
        ? 'not_started'
        : 'done';
    final borderColor = isSelected
        ? listStyle.accent.withValues(alpha: 0.36)
        : listStyle.surfaceBorder.withValues(alpha: 0.18);
    final titleColor =
        Color.lerp(theme.colorScheme.foreground, listStyle.accent, 0.16) ??
        theme.colorScheme.foreground;

    return Padding(
      padding: EdgeInsets.only(bottom: isLast ? 0 : 2),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: isBulkSelectMode ? onToggleSelected : onTap,
          onLongPress: onToggleSelected,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: isSelected
                  ? listStyle.accent.withValues(alpha: 0.08)
                  : Colors.transparent,
              border: Border(
                bottom: isLast
                    ? BorderSide.none
                    : BorderSide(color: borderColor),
              ),
            ),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(2, 10, 2, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      if (isBulkSelectMode)
                        _TaskSelectionToggle(
                          isSelected: isSelected,
                          listStyle: listStyle,
                          onPressed: onToggleSelected,
                        )
                      else
                        _TaskCompletionToggle(
                          task: task,
                          list: list,
                          listStyle: listStyle,
                          targetStatus: doneTargetStatus,
                          enabled: normalizedStatus != 'closed',
                          onPressed: () => onToggleDone(doneTargetStatus),
                        ),
                      const shad.Gap(8),
                      Expanded(
                        child: Text(
                          task.name?.trim().isNotEmpty == true
                              ? task.name!.trim()
                              : context.l10n.taskBoardDetailUntitledTask,
                          style: theme.typography.small.copyWith(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            height: 1.18,
                            decoration: isCompleted
                                ? TextDecoration.lineThrough
                                : null,
                            color: isCompleted
                                ? theme.colorScheme.mutedForeground
                                : titleColor,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  const shad.Gap(5),
                  Padding(
                    padding: const EdgeInsets.only(left: 29),
                    child: Row(
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
                          const shad.Gap(6),
                          _ListViewAssigneeAvatarStack(
                            assignees: task.assignees,
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TaskSelectionToggle extends StatelessWidget {
  const _TaskSelectionToggle({
    required this.isSelected,
    required this.listStyle,
    required this.onPressed,
  });

  final bool isSelected;
  final _TaskBoardListVisualStyle listStyle;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Semantics(
      button: true,
      checked: isSelected,
      child: InkResponse(
        onTap: onPressed,
        radius: 22,
        child: SizedBox.square(
          dimension: 21,
          child: Center(
            child: Icon(
              isSelected ? Icons.check_box : Icons.check_box_outline_blank,
              size: 19,
              color: isSelected
                  ? listStyle.accent
                  : theme.colorScheme.mutedForeground,
            ),
          ),
        ),
      ),
    );
  }
}

class _TaskCompletionToggle extends StatelessWidget {
  const _TaskCompletionToggle({
    required this.task,
    required this.list,
    required this.listStyle,
    required this.targetStatus,
    required this.enabled,
    required this.onPressed,
  });

  final TaskBoardTask task;
  final TaskBoardList list;
  final _TaskBoardListVisualStyle listStyle;
  final String targetStatus;
  final bool enabled;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = context.dynamicColors;
    final normalizedStatus = TaskBoardList.normalizeSupportedStatus(
      list.status,
    );
    final isChecked =
        normalizedStatus == 'done' ||
        normalizedStatus == 'closed' ||
        task.closedAt != null;

    return Tooltip(
      message: _taskBoardListStatusLabel(context, targetStatus),
      child: Semantics(
        button: true,
        checked: isChecked,
        child: InkResponse(
          onTap: enabled ? onPressed : null,
          radius: 22,
          child: SizedBox.square(
            dimension: 21,
            child: Center(
              child: Icon(
                isChecked ? Icons.check_circle : Icons.radio_button_unchecked,
                size: 19,
                color: isChecked
                    ? colors.green
                    : listStyle.accent.withValues(alpha: enabled ? 0.82 : 0.42),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
