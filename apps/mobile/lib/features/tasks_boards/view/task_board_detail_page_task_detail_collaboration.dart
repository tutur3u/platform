part of 'task_board_detail_page.dart';

/// Sharing, comments, linked resources and activity for one task, as web's
/// task dialog has them. Keyed by task so each task reads its own.
///
/// The phone sheet stays a quick view: it offers sharing and a row that
/// opens the detail screen, where the sections read and write. A
/// personal-board task placed from another workspace is left out: these
/// routes address the board's workspace, where that task does not live.
class _TaskDetailCollaboration extends StatelessWidget {
  const _TaskDetailCollaboration({
    required this.task,
    required this.board,
    required this.enabled,
    required this.inSheet,
    required this.onOpenDetails,
  });

  final TaskBoardTask task;
  final TaskBoardDetail board;
  final bool enabled;
  final bool inSheet;
  final void Function(TaskBoardTask task)? onOpenDetails;

  @override
  Widget build(BuildContext context) {
    if (task.isPersonalExternal) return const SizedBox.shrink();
    final l10n = context.l10n;
    final wsId = board.wsId;
    final openDetails = onOpenDetails;
    final rows = AppGroupedCard(
      children: [
        AppGroupedRow(
          key: const ValueKey('task-detail-share'),
          leading: const AppIconTile(icon: LucideIcons.share2),
          title: Text(l10n.taskShareTitle),
          showChevron: true,
          onTap: enabled
              ? () => unawaited(
                  showTaskShareSheet(
                    context,
                    wsId: wsId,
                    taskId: task.id,
                    taskName: _taskBoardTaskTitle(context, task),
                  ),
                )
              : null,
        ),
        if (inSheet && openDetails != null)
          AppGroupedRow(
            key: const ValueKey('task-detail-discussion'),
            leading: const AppIconTile(icon: LucideIcons.messageSquare),
            title: Text(l10n.taskCollabOpenDiscussion),
            showChevron: true,
            onTap: enabled ? () => openDetails(task) : null,
          ),
      ],
    );
    if (inSheet) return rows;
    // The viewer does not change while a task is open.
    final currentUserId = context.read<AuthCubit?>()?.state.user?.id;
    return KeyedSubtree(
      key: ValueKey('task-collaboration-${task.id}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppLayout.sectionGap,
        children: [
          rows,
          TaskCommentsSection(
            wsId: wsId,
            taskId: task.id,
            currentUserId: currentUserId,
            enabled: enabled,
          ),
          TaskLinksSection(wsId: wsId, taskId: task.id, enabled: enabled),
          TaskActivitySection(
            wsId: wsId,
            task: task,
            enabled: enabled,
            onReverted: () =>
                unawaited(context.read<TaskBoardDetailCubit>().reload()),
          ),
        ],
      ),
    );
  }
}
