part of 'task_board_detail_page.dart';

/// What the task detail surfaces run. Each callback receives the task as it
/// is now, so consecutive edits never save a stale snapshot. Null callbacks
/// hide the matching control.
///
/// The phone sheet and the task detail screen share one set, built by
/// [_TaskDetailEdits._taskDetailActions], so both edit through the same
/// board mutations as the row menu.
class _TaskDetailActions {
  const _TaskDetailActions({
    required this.onPickList,
    required this.onPickPriority,
    required this.onPickDate,
    required this.onClearDate,
    required this.onRename,
    required this.onDelete,
    required this.onNavigateRelatedTask,
    this.onAssignees,
    this.onLabels,
    this.onProjects,
    this.onEstimate,
    this.onOpenDetails,
    this.onFocus,
  });

  final void Function(TaskBoardTask task) onPickList;
  final void Function(TaskBoardTask task) onPickPriority;
  final void Function(TaskBoardTask task, _TaskQuickDate field) onPickDate;
  final void Function(TaskBoardTask task, _TaskQuickDate field) onClearDate;
  final void Function(TaskBoardTask task, String name) onRename;
  final void Function(TaskBoardTask task) onDelete;
  final ValueChanged<RelatedTaskInfo> onNavigateRelatedTask;
  final void Function(TaskBoardTask task)? onAssignees;
  final void Function(TaskBoardTask task)? onLabels;
  final void Function(TaskBoardTask task)? onProjects;
  final void Function(TaskBoardTask task)? onEstimate;

  /// Expands the sheet into the task detail screen; null on that screen.
  final void Function(TaskBoardTask task)? onOpenDetails;
  final void Function(TaskBoardTask task)? onFocus;
}

/// Builds the detail actions and the property pickers behind them.
extension _TaskDetailEdits on _TaskBoardDetailPageViewState {
  /// [closeOverlay] closes the sheet that hosts the actions before a
  /// navigation or after a delete; the detail screen passes its own close.
  _TaskDetailActions _taskDetailActions(
    BuildContext context,
    List<TaskBoardList> lists, {
    required Future<void> Function() closeOverlay,
    bool canOpenDetails = true,
  }) {
    final cubit = context.read<TaskBoardDetailCubit>();
    final assignBoard = _taskRowAssignBoard(context);
    final board = cubit.state.board;

    // The board runs one mutation at a time; an edit tapped while another
    // saves is dropped rather than failing. Controls also disable while
    // the cubit is busy.
    void whenIdle(Future<void> Function() action) {
      if (!context.mounted || cubit.state.isMutating) return;
      unawaited(action());
    }

    void closeThen(Future<void> Function() action) {
      unawaited(closeOverlay().then((_) => action()));
    }

    return _TaskDetailActions(
      onPickList: (task) =>
          whenIdle(() => _pickTaskDetailList(context, task, lists)),
      onPickPriority: (task) => whenIdle(
        () => _pickTaskPriority(
          context,
          task,
          announce: false,
          keyPrefix: 'task-quick-priority',
        ),
      ),
      onPickDate: (task, field) =>
          whenIdle(() => _pickTaskQuickDate(context, task, field)),
      onClearDate: (task, field) =>
          whenIdle(() => _clearTaskQuickDate(context, task, field)),
      onRename: (task, name) => whenIdle(
        () =>
            _runTaskRowUpdate(context, task, successMessage: null, name: name),
      ),
      onDelete: (task) {
        if (cubit.state.isMutating) return;
        unawaited(() async {
          if (await _confirmDeleteTask(context, task)) await closeOverlay();
        }());
      },
      onNavigateRelatedTask: (related) => closeThen(() async {
        final targetBoard = related.boardId?.trim();
        if (!context.mounted) return;
        context.go(
          Routes.taskBoardTaskDetailPath(
            targetBoard == null || targetBoard.isEmpty
                ? widget.boardId
                : targetBoard,
            related.id,
          ),
        );
      }),
      onAssignees: assignBoard == null
          ? null
          : (task) => whenIdle(
              () => _pickTaskAssignees(
                context,
                task,
                assignBoard,
                announce: false,
              ),
            ),
      onLabels: board == null || board.labels.isEmpty
          ? null
          : (task) => whenIdle(() => _pickTaskLabels(context, task, board)),
      onProjects: board == null || board.projects.isEmpty
          ? null
          : (task) => whenIdle(() => _pickTaskProjects(context, task, board)),
      onEstimate: board == null
          ? null
          : (task) => whenIdle(() => _pickTaskEstimate(context, task, board)),
      onOpenDetails: canOpenDetails
          ? (task) => closeThen(() => _openTaskDetails(context, task))
          : null,
      onFocus: (task) => closeThen(() => _startTaskFocus(context, task)),
    );
  }

  /// Moves the task to another list. Each list shows its status, so this
  /// one picker sets both the list and the status.
  Future<void> _pickTaskDetailList(
    BuildContext context,
    TaskBoardTask task,
    List<TaskBoardList> lists,
  ) async {
    final l10n = context.l10n;
    final selected = await showAppChoiceSheet<String>(
      context: context,
      title: l10n.taskBoardDetailTaskListLabel,
      selected: task.listId,
      choices: [
        for (final list in lists)
          AppSheetChoice(
            key: ValueKey('task-quick-list-${list.id}'),
            value: list.id,
            label: list.name?.trim().isNotEmpty == true
                ? list.name!.trim()
                : l10n.taskBoardDetailUntitledList,
            subtitle: switch (TaskBoardList.normalizeSupportedStatus(
              list.status,
            )) {
              final status? => _taskBoardListStatusLabel(context, status),
              null => null,
            },
            icon: _taskQuickStatusIcon(
              TaskBoardList.normalizeSupportedStatus(list.status) ?? '',
            ),
          ),
      ],
    );
    if (selected == null || selected == task.listId || !context.mounted) {
      return;
    }
    final cubit = context.read<TaskBoardDetailCubit>();
    final fallbackErrorMessage = l10n.commonSomethingWentWrong;
    try {
      await cubit.moveTask(taskId: task.id, listId: selected);
    } on ApiException catch (error) {
      if (!context.mounted) return;
      showAppToast(
        context,
        message: error.message.trim().isEmpty
            ? fallbackErrorMessage
            : error.message,
        variant: AppAlertVariant.destructive,
      );
    } on Exception {
      if (!context.mounted) return;
      showAppToast(
        context,
        message: fallbackErrorMessage,
        variant: AppAlertVariant.destructive,
      );
    }
  }

  Future<void> _pickTaskProjects(
    BuildContext context,
    TaskBoardTask task,
    TaskBoardDetail board,
  ) async {
    final current = task.projectIds.toSet();
    final selected = await showAdaptiveSheet<Set<String>>(
      context: context,
      builder: (_) => _FilterSelectionSheet(
        title: context.l10n.taskBoardDetailTaskProjects,
        options: [
          for (final project in board.projects)
            _FilterMenuOption(
              id: project.id,
              label: project.name.trim().isEmpty ? project.id : project.name,
            ),
        ],
        initialSelectedIds: current,
        applyLabel: context.l10n.commonSave,
        clearLabel: context.l10n.commonClear,
      ),
    );
    if (selected == null || !context.mounted) return;
    if (selected.length == current.length && selected.containsAll(current)) {
      return;
    }
    await _runTaskRowUpdate(
      context,
      task,
      successMessage: null,
      projectIds: selected.toList(growable: false),
    );
  }

  Future<void> _pickTaskEstimate(
    BuildContext context,
    TaskBoardTask task,
    TaskBoardDetail board,
  ) async {
    // The choice sheet needs a non-null value; -1 stands for no estimate.
    const none = -1;
    final selected = await showAppChoiceSheet<int>(
      context: context,
      title: context.l10n.taskBoardDetailTaskEstimation,
      selected: task.estimationPoints ?? none,
      choices: [
        AppSheetChoice(
          key: const ValueKey('task-quick-estimate-none'),
          value: none,
          label: context.l10n.taskDetailNoEstimate,
        ),
        for (final points in _taskEstimationOptions(board))
          AppSheetChoice(
            key: ValueKey('task-quick-estimate-$points'),
            value: points,
            label: _taskEstimationPointLabel(points: points, board: board),
          ),
      ],
    );
    if (selected == null || !context.mounted) return;
    final next = selected == none ? null : selected;
    if (next == task.estimationPoints) return;
    await _runTaskRowUpdate(
      context,
      task,
      successMessage: null,
      estimationPoints: next,
      clearEstimationPoints: next == null,
    );
  }
}
