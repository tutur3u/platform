part of 'task_board_detail_page.dart';

/// Swipe affordances for one List-view task row: the leading swipe
/// completes or reopens, the trailing buttons schedule, change priority and
/// delete. Each runs the same handler as the row's context menu.
class _TaskRowSwipe extends StatelessWidget {
  const _TaskRowSwipe({
    required this.task,
    required this.list,
    required this.enabled,
    required this.onToggleDone,
    required this.rowActions,
    required this.child,
  });

  final TaskBoardTask task;
  final TaskBoardList list;
  final bool enabled;
  final void Function(String targetStatus) onToggleDone;
  final _TaskRowActionHandlers rowActions;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final doneTarget = _taskRowDoneTarget(list);
    return AppSwipeActions(
      key: ValueKey('task-row-swipe-${task.id}'),
      enabled: enabled,
      leading: doneTarget == null
          ? null
          : AppSwipeAction(
              label: doneTarget == 'done'
                  ? l10n.taskBoardDetailCompleteTask
                  : l10n.taskBoardDetailReopenTask,
              icon: doneTarget == 'done'
                  ? LucideIcons.circleCheck
                  : LucideIcons.rotateCcw,
              tone: AppTone.success,
              onPressed: () => onToggleDone(doneTarget),
            ),
      trailing: [
        AppSwipeAction(
          key: const ValueKey('task-row-swipe-schedule'),
          label: l10n.taskBoardDetailScheduleTask,
          icon: LucideIcons.calendarClock,
          tone: AppTone.info,
          onPressed: () => rowActions.onSchedule(task),
        ),
        AppSwipeAction(
          key: const ValueKey('task-row-swipe-priority'),
          label: l10n.taskBoardDetailPriority,
          icon: LucideIcons.flag,
          tone: AppTone.warning,
          onPressed: () => rowActions.onPriority(task),
        ),
        AppSwipeAction(
          key: const ValueKey('task-row-swipe-delete'),
          label: l10n.taskBoardDetailDeleteTask,
          icon: LucideIcons.trash2,
          tone: AppTone.destructive,
          onPressed: () => rowActions.onDelete(task),
        ),
      ],
      child: child,
    );
  }
}
