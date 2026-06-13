part of 'task_board_detail_page.dart';

const List<String> _taskQuickActionPriorityOptions = [
  'critical',
  'high',
  'normal',
  'low',
];

class _TaskQuickActionsSheet extends StatelessWidget {
  const _TaskQuickActionsSheet({
    required this.task,
    required this.lists,
    required this.onMove,
    required this.onMarkStatus,
    required this.onPriorityChanged,
    required this.onOpenDetails,
  });

  final TaskBoardTask task;
  final List<TaskBoardList> lists;
  final VoidCallback onMove;
  final ValueChanged<String> onMarkStatus;
  final ValueChanged<String> onPriorityChanged;
  final VoidCallback onOpenDetails;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final title = task.name?.trim().isNotEmpty == true
        ? task.name!.trim()
        : context.l10n.taskBoardDetailUntitledTask;
    final list = lists.firstWhere(
      (list) => list.id == task.listId,
      orElse: () => TaskBoardList(
        id: task.listId,
        boardId: '',
        name: context.l10n.taskBoardDetailUntitledList,
      ),
    );
    final status = TaskBoardList.normalizeSupportedStatus(list.status);
    final doneTargetStatus = status == 'done' ? 'not_started' : 'done';
    final closedTargetStatus = status == 'closed' ? 'not_started' : 'closed';

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 18),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              context.l10n.taskBoardDetailQuickActions,
              style: theme.typography.small.copyWith(
                color: theme.colorScheme.mutedForeground,
                fontWeight: FontWeight.w600,
              ),
            ),
            const shad.Gap(6),
            Text(
              title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: theme.typography.large.copyWith(
                fontWeight: FontWeight.w700,
                height: 1.15,
              ),
            ),
            const shad.Gap(12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _TaskQuickActionButton(
                  icon: Icons.drive_file_move_outlined,
                  label: context.l10n.taskBoardDetailMoveTask,
                  onPressed: onMove,
                ),
                _TaskQuickActionButton(
                  icon: status == 'done'
                      ? Icons.radio_button_unchecked
                      : Icons.check_circle_outline,
                  label: status == 'done'
                      ? context.l10n.taskBoardDetailMarkNotStarted
                      : context.l10n.taskBoardDetailBulkMarkDone,
                  onPressed: () => onMarkStatus(doneTargetStatus),
                ),
                _TaskQuickActionButton(
                  icon: status == 'closed'
                      ? Icons.radio_button_unchecked
                      : Icons.cancel_outlined,
                  label: status == 'closed'
                      ? context.l10n.taskBoardDetailMarkNotStarted
                      : context.l10n.taskBoardDetailBulkMarkClosed,
                  onPressed: () => onMarkStatus(closedTargetStatus),
                ),
              ],
            ),
            const shad.Gap(14),
            Text(
              context.l10n.taskBoardDetailChangePriority,
              style: theme.typography.small.copyWith(
                color: theme.colorScheme.mutedForeground,
                fontWeight: FontWeight.w600,
              ),
            ),
            const shad.Gap(8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final priority in _taskQuickActionPriorityOptions)
                  _TaskQuickPriorityButton(
                    priority: priority,
                    selected:
                        _normalizeTaskPriority(
                          task.priority,
                          _taskQuickActionPriorityOptions,
                        ) ==
                        priority,
                    onPressed: () => onPriorityChanged(priority),
                  ),
              ],
            ),
            const shad.Gap(14),
            SizedBox(
              width: double.infinity,
              child: shad.OutlineButton(
                onPressed: onOpenDetails,
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.open_in_full_rounded, size: 16),
                      const shad.Gap(8),
                      Text(context.l10n.taskBoardDetailOpenFullDetails),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TaskQuickActionButton extends StatelessWidget {
  const _TaskQuickActionButton({
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  final IconData icon;
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return shad.OutlineButton(
      onPressed: onPressed,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [Icon(icon, size: 16), const shad.Gap(6), Text(label)],
      ),
    );
  }
}

class _TaskQuickPriorityButton extends StatelessWidget {
  const _TaskQuickPriorityButton({
    required this.priority,
    required this.selected,
    required this.onPressed,
  });

  final String priority;
  final bool selected;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final style = _taskPriorityStyle(context, priority);
    return shad.OutlineButton(
      onPressed: selected ? null : onPressed,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(style.icon, size: 15, color: selected ? style.foreground : null),
          const shad.Gap(5),
          Text(
            style.label,
            style: TextStyle(
              color: selected ? style.foreground : null,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
