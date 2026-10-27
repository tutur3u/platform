part of 'task_board_detail_page.dart';

/// Row-level swipe and context-menu handlers for list-view task rows.
///
/// Every action reuses an existing [TaskBoardDetailCubit] mutation; the rows
/// only decide which one to run.
class _TaskRowActionHandlers {
  const _TaskRowActionHandlers({
    required this.onSchedule,
    required this.onPriority,
    required this.onDelete,
    required this.onContextMenu,
  });

  final void Function(TaskBoardTask task) onSchedule;
  final void Function(TaskBoardTask task) onPriority;
  final void Function(TaskBoardTask task) onDelete;
  final void Function(TaskBoardTask task) onContextMenu;
}

enum _TaskRowMenuAction {
  toggleDone,
  focus,
  schedule,
  priority,
  assign,
  move,
  select,
  details,
  delete,
}

/// The done-toggle target for a task in [list], or null when the list is
/// closed and the row offers no completion shortcut.
String? _taskRowDoneTarget(TaskBoardList list) {
  final status = TaskBoardList.normalizeSupportedStatus(list.status);
  if (status == 'closed') return null;
  return status == 'done' ? 'not_started' : 'done';
}

extension _TaskRowActions on _TaskBoardDetailPageViewState {
  _TaskRowActionHandlers _taskRowActionHandlers(
    BuildContext context,
    List<TaskBoardList> lists,
  ) => _TaskRowActionHandlers(
    onSchedule: (task) => unawaited(_scheduleTask(context, task)),
    onPriority: (task) => unawaited(_pickTaskPriority(context, task)),
    onDelete: (task) => unawaited(_confirmDeleteTask(context, task)),
    onContextMenu: (task) =>
        unawaited(_openTaskContextMenu(context, task, lists)),
  );

  Future<void> _openTaskContextMenu(
    BuildContext context,
    TaskBoardTask task,
    List<TaskBoardList> lists,
  ) async {
    final l10n = context.l10n;
    final list = lists.firstWhere(
      (list) => list.id == task.listId,
      orElse: () => TaskBoardList(
        id: task.listId,
        boardId: '',
        name: l10n.taskBoardDetailUntitledList,
      ),
    );
    final doneTarget = _taskRowDoneTarget(list);
    final assignBoard = _taskRowAssignBoard(context);
    final title = task.name?.trim().isNotEmpty == true
        ? task.name!.trim()
        : l10n.taskBoardDetailUntitledTask;

    final action = await showAppActionSheet<_TaskRowMenuAction>(
      context: context,
      title: title,
      description: list.name,
      actions: [
        if (doneTarget != null)
          AppSheetAction(
            key: const ValueKey('task-row-menu-toggle-done'),
            value: _TaskRowMenuAction.toggleDone,
            icon: doneTarget == 'done'
                ? LucideIcons.circleCheck
                : LucideIcons.rotateCcw,
            tone: AppTone.success,
            label: doneTarget == 'done'
                ? l10n.taskBoardDetailCompleteTask
                : l10n.taskBoardDetailReopenTask,
          ),
        AppSheetAction(
          key: const ValueKey('task-row-menu-focus'),
          value: _TaskRowMenuAction.focus,
          icon: LucideIcons.timer,
          tone: AppTone.primary,
          label: l10n.taskBoardDetailStartFocus,
        ),
        AppSheetAction(
          value: _TaskRowMenuAction.schedule,
          icon: LucideIcons.calendarClock,
          tone: AppTone.info,
          label: l10n.taskBoardDetailScheduleTask,
        ),
        AppSheetAction(
          value: _TaskRowMenuAction.priority,
          icon: LucideIcons.flag,
          tone: AppTone.warning,
          label: l10n.taskBoardDetailChangePriority,
        ),
        if (assignBoard != null)
          AppSheetAction(
            key: const ValueKey('task-row-menu-assign'),
            value: _TaskRowMenuAction.assign,
            icon: LucideIcons.users,
            label: l10n.taskBoardDetailTaskAssignees,
          ),
        AppSheetAction(
          value: _TaskRowMenuAction.move,
          icon: LucideIcons.folderInput,
          label: l10n.taskBoardDetailMoveTask,
          enabled: lists.any((candidate) => candidate.id != task.listId),
        ),
        AppSheetAction(
          value: _TaskRowMenuAction.select,
          icon: LucideIcons.squareCheck,
          label: l10n.taskBoardDetailSelectTask,
        ),
        AppSheetAction(
          value: _TaskRowMenuAction.details,
          icon: LucideIcons.maximize2,
          label: l10n.taskBoardDetailOpenFullDetails,
        ),
        AppSheetAction(
          key: const ValueKey('task-row-menu-delete'),
          value: _TaskRowMenuAction.delete,
          icon: LucideIcons.trash2,
          destructive: true,
          label: l10n.taskBoardDetailDeleteTask,
        ),
      ],
    );
    if (action == null || !context.mounted) return;

    switch (action) {
      case _TaskRowMenuAction.toggleDone:
        await _markTaskAsStatus(context, task, lists, doneTarget!);
      case _TaskRowMenuAction.focus:
        await _startTaskFocus(context, task);
      case _TaskRowMenuAction.schedule:
        await _scheduleTask(context, task);
      case _TaskRowMenuAction.priority:
        await _pickTaskPriority(context, task);
      case _TaskRowMenuAction.assign:
        await _pickTaskAssignees(context, task, assignBoard!);
      case _TaskRowMenuAction.move:
        await _openMoveTaskPicker(context, task, lists);
      case _TaskRowMenuAction.select:
        context.read<TaskBoardDetailCubit>().toggleBulkTaskSelection(task.id);
      case _TaskRowMenuAction.details:
        await _openTaskDetails(context, task);
      case _TaskRowMenuAction.delete:
        await _confirmDeleteTask(context, task);
    }
  }

  /// [announce] false skips the success toast, for surfaces that already
  /// show the saved value, such as the quick sheet.
  Future<void> _scheduleTask(
    BuildContext context,
    TaskBoardTask task, {
    bool announce = true,
  }) async {
    final now = DateTime.now();
    final current = task.endDate?.toLocal();
    final picked = await showAppDatePicker(
      context: context,
      initialDate: current ?? now,
      firstDate: DateTime(now.year - 5),
      lastDate: DateTime(now.year + 10),
    );
    if (picked == null || !context.mounted) return;

    // Due dates land at the end of the chosen local day, as the bulk
    // due-date actions do.
    final endDate = DateTime(picked.year, picked.month, picked.day, 23, 59, 59);
    await _runTaskRowUpdate(
      context,
      task,
      successMessage: announce
          ? context.l10n.taskBoardDetailDueDateUpdated
          : null,
      endDate: endDate,
    );
  }

  Future<void> _pickTaskPriority(
    BuildContext context,
    TaskBoardTask task,
  ) async {
    final selected = await showAppChoiceSheet<String>(
      context: context,
      title: context.l10n.taskBoardDetailChangePriority,
      selected: _normalizeTaskPriority(
        task.priority,
        _taskQuickActionPriorityOptions,
      ),
      choices: [
        for (final priority in _taskQuickActionPriorityOptions)
          AppSheetChoice(
            key: ValueKey('task-row-priority-$priority'),
            value: priority,
            label: _taskPriorityStyle(context, priority).label,
            icon: _taskPriorityStyle(context, priority).icon,
          ),
      ],
    );
    if (selected == null || !context.mounted) return;
    await _changeTaskPriority(context, task, selected);
  }

  Future<void> _changeTaskPriority(
    BuildContext context,
    TaskBoardTask task,
    String priority, {
    bool announce = true,
  }) async {
    final normalizedPriority = _normalizeTaskPriority(
      priority,
      _taskQuickActionPriorityOptions,
    );
    if (task.priority == normalizedPriority) return;
    await _runTaskRowUpdate(
      context,
      task,
      successMessage: announce
          ? context.l10n.taskBoardDetailPriorityUpdated
          : null,
      priority: normalizedPriority,
    );
  }

  /// Saves one field change through [TaskBoardDetailCubit.updateTask],
  /// carrying every other editable field over unchanged. A null
  /// [successMessage] saves quietly; failures always show a toast.
  Future<void> _runTaskRowUpdate(
    BuildContext context,
    TaskBoardTask task, {
    required String? successMessage,
    String? priority,
    DateTime? endDate,
    bool clearEndDate = false,
    List<String>? labelIds,
    List<String>? assigneeIds,
  }) async {
    final cubit = context.read<TaskBoardDetailCubit>();
    // showAppToast needs a context below the root overlay; the root
    // navigator's own context sits above it.
    final toastContext = context;
    final fallbackErrorMessage = context.l10n.commonSomethingWentWrong;

    try {
      await cubit.updateTask(
        taskId: task.id,
        name: task.name?.trim().isNotEmpty == true
            ? task.name!.trim()
            : context.l10n.taskBoardDetailUntitledTask,
        priority: priority ?? task.priority,
        startDate: task.startDate,
        endDate: clearEndDate ? null : endDate ?? task.endDate,
        clearEndDate: clearEndDate,
        estimationPoints: task.estimationPoints,
        labelIds: labelIds ?? task.labelIds,
        projectIds: task.projectIds,
        assigneeIds: assigneeIds ?? task.assigneeIds,
      );
      if (!toastContext.mounted) return;
      if (successMessage != null) {
        showAppToast(toastContext, message: successMessage);
      }
    } on ApiException catch (error) {
      if (!toastContext.mounted) return;
      showAppToast(
        toastContext,
        message: error.message.trim().isEmpty
            ? fallbackErrorMessage
            : error.message,
        variant: AppAlertVariant.destructive,
      );
    } on Exception {
      if (!toastContext.mounted) return;
      showAppToast(
        toastContext,
        message: fallbackErrorMessage,
        variant: AppAlertVariant.destructive,
      );
    }
  }

  Future<void> _confirmDeleteTask(
    BuildContext context,
    TaskBoardTask task,
  ) async {
    final cubit = context.read<TaskBoardDetailCubit>();
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final l10n = context.l10n;

    final deleted =
        await _showBoardDialog<bool>(
          context: context,
          builder: (_) => AsyncDeleteConfirmationDialog(
            title: l10n.taskBoardDetailDeleteTaskTitle,
            message: l10n.taskBoardDetailDeleteTaskDescription,
            cancelLabel: l10n.commonCancel,
            confirmLabel: l10n.taskBoardDetailDeleteTask,
            toastContext: toastContext,
            onConfirm: () => cubit.deleteTask(taskId: task.id),
          ),
        ) ??
        false;

    if (!deleted || !context.mounted) return;
    showAppToast(context, message: l10n.taskBoardDetailTaskDeleted);
  }
}
