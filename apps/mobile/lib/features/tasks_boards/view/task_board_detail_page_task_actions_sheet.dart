part of 'task_board_detail_page.dart';

/// Statuses the quick sheet offers, in board order. Documents lists hold
/// notes rather than work, so they are never a status target.
const List<String> _taskQuickActionStatusOrder = [
  'not_started',
  'active',
  'review',
  'done',
  'closed',
];

/// What the quick sheet runs. Each callback receives the task as it is now,
/// so consecutive edits never save a stale snapshot. Null callbacks hide or
/// disable the matching control.
class _TaskQuickActionCallbacks {
  const _TaskQuickActionCallbacks({
    required this.onStatus,
    required this.onPriority,
    required this.onDueDate,
    required this.onClearDueDate,
    required this.onOpenDetails,
    this.onAssignees,
    this.onLabels,
    this.onMove,
  });

  final void Function(TaskBoardTask task, String status) onStatus;

  /// A null priority clears it (the web's None).
  final void Function(TaskBoardTask task, String? priority) onPriority;
  final void Function(TaskBoardTask task) onDueDate;
  final void Function(TaskBoardTask task) onClearDueDate;
  final void Function(TaskBoardTask task) onOpenDetails;
  final void Function(TaskBoardTask task)? onAssignees;
  final void Function(TaskBoardTask task)? onLabels;
  final void Function(TaskBoardTask task)? onMove;
}

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

/// Tap-to-edit sheet for one task: status, priority, assignees, due date,
/// labels and list, then the full details.
///
/// The sheet follows the board cubit, so a priority or field edit updates
/// it in place and several edits can be made in a row.
class _TaskQuickActionsSheet extends StatelessWidget {
  const _TaskQuickActionsSheet({
    required this.task,
    required this.lists,
    required this.callbacks,
  });

  /// The task as it was tapped; used until the cubit has a newer snapshot.
  final TaskBoardTask task;
  final List<TaskBoardList> lists;
  final _TaskQuickActionCallbacks callbacks;

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
    final l10n = context.l10n;
    final title = live.name?.trim().isNotEmpty == true
        ? live.name!.trim()
        : l10n.taskBoardDetailUntitledTask;
    final list = lists.where((list) => list.id == live.listId).firstOrNull;
    final listName = list?.name?.trim().isNotEmpty == true
        ? list!.name!.trim()
        : l10n.taskBoardDetailUntitledList;
    final status = TaskBoardList.normalizeSupportedStatus(list?.status);
    final boardStatuses = {
      for (final candidate in lists)
        ?TaskBoardList.normalizeSupportedStatus(candidate.status),
    };
    final statuses = [
      for (final candidate in _taskQuickActionStatusOrder)
        if (boardStatuses.contains(candidate)) candidate,
    ];
    final priority = TaskPriorityLevel.tryParse(live.priority)?.value;

    return AppSheetScaffold(
      title: title,
      description: board == null
          ? listName
          : '${_taskReference(live, board)} · $listName',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (statuses.isNotEmpty) ...[
            _TaskQuickSectionCaption(l10n.taskQuickActionsStatus),
            _TaskQuickStatusGrid(
              statuses: statuses,
              selected: status,
              enabled: !busy,
              onSelected: (value) => callbacks.onStatus(live, value),
            ),
            const SizedBox(height: AppLayout.sectionGap),
          ],
          _TaskQuickSectionCaption(l10n.taskBoardDetailPriority),
          _TaskQuickPriorityGrid(
            selected: priority,
            enabled: !busy,
            onSelected: (value) => callbacks.onPriority(live, value),
          ),
          const SizedBox(height: AppLayout.sectionGap),
          _TaskQuickFieldsCard(
            task: live,
            board: board,
            list: list,
            listName: listName,
            enabled: !busy,
            callbacks: callbacks,
          ),
          const SizedBox(height: AppLayout.sectionGap),
          AppButton.outline(
            key: const ValueKey('task-quick-open-details'),
            enabled: !busy,
            onPressed: () => callbacks.onOpenDetails(live),
            leading: const Icon(LucideIcons.maximize2),
            child: Text(l10n.taskBoardDetailOpenFullDetails),
          ),
        ],
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
