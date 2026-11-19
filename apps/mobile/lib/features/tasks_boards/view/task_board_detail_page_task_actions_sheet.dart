part of 'task_board_detail_page.dart';

/// The latest snapshot of [taskId] in the board state, or null once the
/// task is gone (deleted or moved out of every loaded list).
TaskBoardTask? _taskQuickActionsLiveTask(
  TaskBoardDetailState state,
  String taskId,
) {
  for (final task in state.board?.tasks ?? const <TaskBoardTask>[]) {
    if (task.id == taskId) return task;
  }
  for (final tasks in state.listTasksByListId.values) {
    for (final task in tasks) {
      if (task.id == taskId) return task;
    }
  }
  return null;
}

/// The task sheet a tap opens: the shared detail content in the shared
/// sheet, which opens at its middle detent and drags up to full height.
///
/// The sheet follows the board cubit, so an edit updates it in place and
/// several edits can be made in a row.
class _TaskDetailSheet extends StatelessWidget {
  const _TaskDetailSheet({
    required this.task,
    required this.lists,
    required this.actions,
    required this.isPersonalWorkspace,
  });

  /// The task as it was tapped; used until the cubit has a newer snapshot.
  final TaskBoardTask task;
  final List<TaskBoardList> lists;
  final _TaskDetailActions actions;
  final bool isPersonalWorkspace;

  @override
  Widget build(BuildContext context) {
    final live = context.select<TaskBoardDetailCubit, TaskBoardTask>(
      (cubit) => _taskQuickActionsLiveTask(cubit.state, task.id) ?? task,
    );
    final board = context.select<TaskBoardDetailCubit, TaskBoardDetail?>(
      (cubit) => cubit.state.board,
    );
    final busy = context.select<TaskBoardDetailCubit, bool>(
      (cubit) => cubit.state.isMutating,
    );
    final list = lists.where((list) => list.id == live.listId).firstOrNull;
    return AppSheetScaffold(
      title: board == null
          ? _taskDetailListName(context, list)
          : _taskReference(live, board),
      headerActions: [
        if (actions.onOpenDetails case final openDetails?)
          AppIconButton(
            key: const ValueKey('task-quick-open-details'),
            tooltip: context.l10n.taskBoardDetailOpenFullDetails,
            icon: const Icon(LucideIcons.maximize2, size: 18),
            onPressed: busy ? null : () => openDetails(live),
          ),
        _TaskDetailMoreButton(task: live, enabled: !busy, actions: actions),
      ],
      child: _TaskDetailContent(
        task: live,
        board: board,
        lists: lists,
        actions: actions,
        isPersonalWorkspace: isPersonalWorkspace,
        enabled: !busy,
        inSheet: true,
      ),
    );
  }
}

class _TaskQuickSectionCaption extends StatelessWidget {
  const _TaskQuickSectionCaption(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    return Padding(
      padding: const EdgeInsets.only(
        left: AppSpacing.xs,
        bottom: AppLayout.sectionCaptionGap,
      ),
      child: Semantics(
        header: true,
        child: Text(
          text,
          style: tokens.typography.small.copyWith(
            color: tokens.colorScheme.mutedForeground,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}
