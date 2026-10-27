part of 'task_board_detail_page.dart';

/// Assignees, due date, labels and list rows of the quick sheet. Each row
/// shows the current value and opens that field's picker. While an edit
/// saves ([enabled] false) the rows dim and take no taps.
class _TaskQuickFieldsCard extends StatelessWidget {
  const _TaskQuickFieldsCard({
    required this.task,
    required this.board,
    required this.list,
    required this.listName,
    required this.enabled,
    required this.callbacks,
  });

  final TaskBoardTask task;
  final TaskBoardDetail? board;
  final TaskBoardList? list;
  final String listName;
  final bool enabled;
  final _TaskQuickActionCallbacks callbacks;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final c = AppTokens.of(context).colorScheme;
    final assignees = _taskQuickAssignees(task, board);
    final labels = _taskQuickLabels(task, board);
    final zone = taskTimezone(context);
    final endDate = task.endDate == null ? null : taskDay(task.endDate!, zone);
    final overdue =
        taskIsOverdue(endDate: task.endDate, now: DateTime.now(), zone: zone) &&
        !_taskIsCompletedInBoard(task, list);
    final onAssignees = enabled ? callbacks.onAssignees : null;
    final onLabels = enabled ? callbacks.onLabels : null;
    final onMove = enabled ? callbacks.onMove : null;

    final card = AppGroupedCard(
      children: [
        if (callbacks.onAssignees != null)
          AppGroupedRow(
            key: const ValueKey('task-quick-assignees'),
            leading: const AppIconTile(
              icon: LucideIcons.users,
              tone: AppTone.primary,
            ),
            title: Text(l10n.taskBoardDetailTaskAssignees),
            subtitle: Text(
              assignees.isEmpty
                  ? l10n.taskQuickActionsUnassigned
                  : assignees.map((member) => member.name).join(', '),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            trailing: assignees.isEmpty
                ? null
                : _TaskQuickAvatarStack(assignees: assignees),
            showChevron: true,
            onTap: onAssignees == null ? null : () => onAssignees(task),
          ),
        AppGroupedRow(
          key: const ValueKey('task-quick-due-date'),
          leading: AppIconTile(
            icon: LucideIcons.calendarClock,
            tone: overdue ? AppTone.destructive : AppTone.info,
          ),
          title: Text(l10n.taskQuickActionsDueDate),
          subtitle: Text(
            endDate == null
                ? l10n.taskQuickActionsNoDueDate
                : '${DateFormat.yMMMd(l10n.localeName).format(endDate)}'
                      ' · ${_taskSmartDate(context, endDate)}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: overdue ? TextStyle(color: c.destructive) : null,
          ),
          trailing: endDate == null
              ? null
              : AppIconButton(
                  key: const ValueKey('task-quick-clear-due-date'),
                  tooltip: l10n.taskBoardDetailRemoveDueDate,
                  icon: const Icon(LucideIcons.x),
                  onPressed: enabled
                      ? () => callbacks.onClearDueDate(task)
                      : null,
                ),
          showChevron: endDate == null,
          onTap: enabled ? () => callbacks.onDueDate(task) : null,
        ),
        if (callbacks.onLabels != null)
          AppGroupedRow(
            key: const ValueKey('task-quick-labels'),
            leading: const AppIconTile(
              icon: LucideIcons.tag,
              tone: AppTone.warning,
            ),
            title: Text(l10n.taskBoardDetailTaskLabels),
            subtitle: labels.isEmpty
                ? Text(l10n.taskQuickActionsNoLabels)
                : _TaskQuickLabelLine(labels: labels),
            showChevron: true,
            onTap: onLabels == null ? null : () => onLabels(task),
          ),
        AppGroupedRow(
          key: const ValueKey('task-quick-list'),
          leading: const AppIconTile(icon: LucideIcons.folderInput),
          title: Text(l10n.taskBoardDetailMoveTask),
          subtitle: Text(
            listName,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          showChevron: callbacks.onMove != null,
          onTap: onMove == null ? null : () => onMove(task),
        ),
      ],
    );
    return enabled ? card : Opacity(opacity: 0.55, child: card);
  }
}
