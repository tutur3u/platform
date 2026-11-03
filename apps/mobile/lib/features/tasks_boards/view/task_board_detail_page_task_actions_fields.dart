part of 'task_board_detail_page.dart';

/// Assignees, labels and list rows of the quick sheet. Each row
/// shows the current value and opens that field's picker. While an edit
/// saves ([enabled] false) the rows dim and take no taps.
class _TaskQuickFieldsCard extends StatelessWidget {
  const _TaskQuickFieldsCard({
    required this.task,
    required this.board,
    required this.listName,
    required this.enabled,
    required this.callbacks,
  });

  final TaskBoardTask task;
  final TaskBoardDetail? board;
  final String listName;
  final bool enabled;
  final _TaskQuickActionCallbacks callbacks;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final assignees = _taskQuickAssignees(task, board);
    final labels = _taskQuickLabels(task, board);
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
