part of 'task_board_detail_page.dart';

class _TaskCard extends StatelessWidget {
  const _TaskCard({
    required this.task,
    required this.board,
    required this.list,
    required this.today,
    required this.zone,
    required this.onTap,
    required this.onToggleDone,
    required this.rowActions,
    required this.isBulkSelectMode,
    required this.isSelected,
    required this.onToggleSelected,
  });

  final TaskBoardTask task;
  final TaskBoardDetail board;
  final TaskBoardList list;
  final DateTime today;
  final String? zone;
  final VoidCallback onTap;
  final void Function(String targetStatus) onToggleDone;
  final _TaskRowActionHandlers rowActions;
  final bool isBulkSelectMode;
  final bool isSelected;
  final VoidCallback onToggleSelected;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final l10n = context.l10n;
    final isCompleted = !taskListTaskIsOpen(task, list);
    final target = _taskRowDoneTarget(list);
    final endDate = task.endDate;
    final dueDay = endDate == null ? null : taskDay(endDate, zone);
    final isOverdue =
        !isCompleted &&
        !list.suppressesDeadlines &&
        (dueDay?.isBefore(today) ?? false);
    final fleet = fleetMetaOrNull(task, listStatus: list.status);
    final toggleLabel = target == 'done'
        ? l10n.taskBoardDetailCompleteTask
        : l10n.taskBoardDetailReopenTask;

    return PendingSyncFrame(
      workspaceId: board.wsId,
      feature: 'tasks',
      entityId: task.id,
      child: _TaskRowSwipe(
        task: task,
        list: list,
        enabled: !isBulkSelectMode,
        onToggleDone: onToggleDone,
        rowActions: rowActions,
        child: Material(
          type: MaterialType.transparency,
          child: Ink(
            decoration: BoxDecoration(color: isSelected ? colors.muted : null),
            child: InkWell(
              onTap: isBulkSelectMode ? onToggleSelected : onTap,
              onLongPress: () {
                unawaited(AppHaptics.pickup());
                if (isBulkSelectMode) {
                  onToggleSelected();
                } else {
                  rowActions.onContextMenu(task);
                }
              },
              child: Padding(
                padding: const EdgeInsetsDirectional.fromSTEB(
                  AppSpacing.xs,
                  AppSpacing.sm,
                  AppSpacing.md,
                  AppSpacing.sm,
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (isBulkSelectMode)
                      AppCheckbox(
                        value: isSelected,
                        onChanged: (_) => onToggleSelected(),
                      )
                    else
                      AppCheckbox(
                        key: ValueKey('task-board-list-complete-${task.id}'),
                        value: isCompleted,
                        semanticLabel: target == null ? null : toggleLabel,
                        onChanged: target == null
                            ? null
                            : (_) => onToggleDone(target),
                      ),
                    const SizedBox(width: AppSpacing.xs),
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          vertical: AppSpacing.xs,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              task.name?.trim().isNotEmpty == true
                                  ? task.name!.trim()
                                  : l10n.taskBoardDetailUntitledTask,
                              style: tokens.typography.body.copyWith(
                                fontWeight: FontWeight.w600,
                                color: isCompleted
                                    ? colors.mutedForeground
                                    : colors.foreground,
                                decoration: isCompleted
                                    ? TextDecoration.lineThrough
                                    : null,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            _TaskMetadataRow(
                              task: task,
                              board: board,
                              dueDay: dueDay,
                              today: today,
                              isOverdue: isOverdue,
                            ),
                            if (fleet != null)
                              Padding(
                                padding: const EdgeInsets.only(
                                  top: AppSpacing.xs,
                                ),
                                child: FleetTaskTileBlock(meta: fleet),
                              ),
                          ],
                        ),
                      ),
                    ),
                    if (task.assignees.isNotEmpty) ...[
                      const SizedBox(width: AppSpacing.sm),
                      _ListViewAssigneeAvatarStack(assignees: task.assignees),
                    ],
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
