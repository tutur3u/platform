part of 'task_board_detail_page.dart';

Future<void> _saveTaskEditorTask(_TaskBoardTaskEditorSheetState state) async {
  final title = state._nameController.text.trim();
  final fallbackErrorMessage = state.context.l10n.commonSomethingWentWrong;

  if (title.isEmpty) {
    _showTaskEditorErrorToast(
      state,
      state.context.l10n.taskBoardDetailTaskTitleRequired,
    );
    return;
  }

  if (state._startDate != null &&
      state._endDate != null &&
      state._endDate!.isBefore(state._startDate!)) {
    _showTaskEditorErrorToast(
      state,
      state.context.l10n.taskBoardDetailInvalidDateRange,
    );
    return;
  }

  final toastContext = Navigator.of(state.context, rootNavigator: true).context;
  final description = _normalizeTaskText(state._descriptionController.text);

  state._updateState(() => state._isSaving = true);
  try {
    final cubit = state.context.read<TaskBoardDetailCubit>();
    if (state._isCreate) {
      await cubit.createTask(
        listId: state._selectedListId,
        name: title,
        description: description,
        priority: state._priority,
        startDate: state._startDate,
        endDate: state._endDate,
        estimationPoints: state._estimationPoints,
        assigneeIds: state._selectedAssigneeIds.toList(growable: false),
        labelIds: state._selectedLabelIds.toList(growable: false),
        projectIds: state._selectedProjectIds.toList(growable: false),
      );
    } else {
      final currentTask = state.widget.task!;
      await cubit.updateTask(
        taskId: currentTask.id,
        name: title,
        description: description,
        priority: state._priority,
        startDate: state._startDate,
        endDate: state._endDate,
        estimationPoints: state._estimationPoints,
        assigneeIds: state._selectedAssigneeIds.toList(growable: false),
        labelIds: state._selectedLabelIds.toList(growable: false),
        projectIds: state._selectedProjectIds.toList(growable: false),
        clearDescription:
            description == null &&
            (currentTask.description?.trim().isNotEmpty ?? false),
        clearStartDate:
            state._startDate == null && currentTask.startDate != null,
        clearEndDate: state._endDate == null && currentTask.endDate != null,
        clearEstimationPoints:
            state._estimationPoints == null &&
            currentTask.estimationPoints != null,
      );
    }

    if (!state.mounted || !toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) => shad.Alert(
        content: Text(
          state._isCreate
              ? context.l10n.taskBoardDetailTaskCreated
              : context.l10n.taskBoardDetailTaskSaved,
        ),
      ),
    );
    await state._closeEditor();
  } on ApiException catch (error) {
    if (!state.mounted || !toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) => shad.Alert.destructive(
        content: Text(
          error.message.trim().isEmpty ? fallbackErrorMessage : error.message,
        ),
      ),
    );
  } on Exception {
    if (!state.mounted || !toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) =>
          shad.Alert.destructive(content: Text(fallbackErrorMessage)),
    );
  } finally {
    if (state.mounted) {
      state._updateState(() => state._isSaving = false);
    }
  }
}

Future<void> _moveTaskEditorTask(_TaskBoardTaskEditorSheetState state) async {
  final task = state.widget.task;
  if (task == null) return;

  final fallbackErrorMessage = state.context.l10n.commonSomethingWentWrong;
  final availableLists = state.widget.lists
      .where((list) => list.id != task.listId)
      .toList(growable: false);

  if (availableLists.isEmpty) {
    _showTaskEditorErrorToast(
      state,
      state.context.l10n.taskBoardDetailNoMoveTargets,
    );
    return;
  }

  final targetListId = await shad.showDialog<String>(
    context: state.context,
    builder: (context) => _MoveTaskListDialog(lists: availableLists),
  );

  if (targetListId == null || !state.mounted) return;

  final toastContext = Navigator.of(state.context, rootNavigator: true).context;

  state._updateState(() => state._isMoving = true);
  try {
    await state.context.read<TaskBoardDetailCubit>().moveTask(
      taskId: task.id,
      listId: targetListId,
    );

    if (!state.mounted || !toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) =>
          shad.Alert(content: Text(context.l10n.taskBoardDetailTaskMoved)),
    );
    await state._closeEditor();
  } on ApiException catch (error) {
    if (!state.mounted || !toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) => shad.Alert.destructive(
        content: Text(
          error.message.trim().isEmpty ? fallbackErrorMessage : error.message,
        ),
      ),
    );
  } on Exception {
    if (!state.mounted || !toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) =>
          shad.Alert.destructive(content: Text(fallbackErrorMessage)),
    );
  } finally {
    if (state.mounted) {
      state._updateState(() => state._isMoving = false);
    }
  }
}

Future<void> _pickTaskList(_TaskBoardTaskEditorSheetState state) async {
  if (state.widget.lists.length < 2) return;

  final selectedListId = await shad.showDialog<String>(
    context: state.context,
    builder: (context) => _TaskListPickerDialog(
      title: state.context.l10n.taskBoardDetailTaskListSelect,
      lists: state.widget.lists,
    ),
  );

  if (selectedListId == null ||
      !state.mounted ||
      selectedListId == state._selectedListId) {
    return;
  }

  state._updateState(() => state._selectedListId = selectedListId);
}

Future<void> _pickTaskDate(
  _TaskBoardTaskEditorSheetState state, {
  required bool isStart,
}) async {
  final current = isStart ? state._startDate : state._endDate;
  final picked = await showDatePicker(
    context: state.context,
    initialDate: current ?? DateTime.now(),
    firstDate: DateTime(2000),
    lastDate: DateTime(2100),
  );
  if (picked == null || !state.mounted) return;

  final normalized = DateTime(picked.year, picked.month, picked.day);
  state._updateState(() {
    if (isStart) {
      state._startDate = normalized;
      if (state._endDate != null && normalized.isAfter(state._endDate!)) {
        state._endDate = normalized;
      }
    } else {
      state._endDate = normalized;
      if (state._startDate != null && normalized.isBefore(state._startDate!)) {
        state._startDate = normalized;
      }
    }
  });
}

Future<void> _pickTaskEstimation(_TaskBoardTaskEditorSheetState state) async {
  final result = await shad.showDialog<String>(
    context: state.context,
    builder: (context) => _TaskEstimationPickerDialog(
      selectedValue: state._estimationPoints?.toString(),
      options: _taskEstimationOptions(state.widget.board),
      mapValueLabel: (value) => _taskEstimationPointLabel(
        points: value,
        board: state.widget.board,
      ),
    ),
  );

  if (result == null || !state.mounted) return;
  state._updateState(() {
    state._estimationPoints = result == 'none' ? null : int.tryParse(result);
  });
}

Future<void> _pickTaskAssignees(_TaskBoardTaskEditorSheetState state) async {
  final nextValues = await shad.showDialog<Set<String>>(
    context: state.context,
    builder: (context) => _TaskMultiSelectDialog(
      title: state.context.l10n.taskBoardDetailTaskSelectAssignees,
      options: [
        for (final member in state.widget.members)
          _MultiSelectOption(id: member.id, label: member.label),
      ],
      selectedIds: state._selectedAssigneeIds,
    ),
  );

  if (nextValues == null || !state.mounted) return;
  state._updateState(() => state._selectedAssigneeIds = nextValues);
}

Future<void> _pickTaskLabels(_TaskBoardTaskEditorSheetState state) async {
  final nextValues = await shad.showDialog<Set<String>>(
    context: state.context,
    builder: (context) => _TaskMultiSelectDialog(
      title: state.context.l10n.taskBoardDetailTaskSelectLabels,
      options: [
        for (final label in state.widget.labels)
          _MultiSelectOption(id: label.id, label: label.name),
      ],
      selectedIds: state._selectedLabelIds,
    ),
  );

  if (nextValues == null || !state.mounted) return;
  state._updateState(() => state._selectedLabelIds = nextValues);
}

Future<void> _pickTaskProjects(_TaskBoardTaskEditorSheetState state) async {
  final nextValues = await shad.showDialog<Set<String>>(
    context: state.context,
    builder: (context) => _TaskMultiSelectDialog(
      title: state.context.l10n.taskBoardDetailTaskSelectProjects,
      options: [
        for (final project in state.widget.projects)
          _MultiSelectOption(id: project.id, label: project.name),
      ],
      selectedIds: state._selectedProjectIds,
    ),
  );

  if (nextValues == null || !state.mounted) return;
  state._updateState(() => state._selectedProjectIds = nextValues);
}

Future<void> _closeTaskEditor(_TaskBoardTaskEditorSheetState state) async {
  try {
    await shad.closeOverlay<void>(state.context);
    return;
  } on Exception {
    if (!state.mounted) return;
    final navigator = Navigator.of(state.context);
    if (navigator.canPop()) {
      navigator.pop();
    }
  }
}

String _normalizeTaskPriority(String? value, List<String> priorityOptions) {
  final trimmed = value?.trim().toLowerCase();
  if (trimmed == null || trimmed.isEmpty) {
    return 'normal';
  }
  return priorityOptions.contains(trimmed) ? trimmed : 'normal';
}

String _resolveTaskInitialListId(
  _TaskBoardTaskEditorSheetState state,
  TaskBoardTask? task,
) {
  if (task != null &&
      state.widget.lists.any((list) => list.id == task.listId)) {
    return task.listId;
  }

  if (state.widget.lists.any((list) => list.id == state.widget.defaultListId)) {
    return state.widget.defaultListId;
  }

  return state.widget.lists.first.id;
}

String _selectedTaskListLabel(
  _TaskBoardTaskEditorSheetState state,
  BuildContext context,
) {
  final selectedList = state.widget.lists.firstWhere(
    (list) => list.id == state._selectedListId,
    orElse: () => state.widget.lists.first,
  );

  final trimmedName = selectedList.name?.trim();
  if (trimmedName != null && trimmedName.isNotEmpty) {
    return trimmedName;
  }

  return context.l10n.taskBoardDetailUntitledList;
}

String _taskEditorEstimationLabel(
  _TaskBoardTaskEditorSheetState state,
  BuildContext context,
) {
  return state._estimationPoints == null
      ? context.l10n.taskBoardDetailTaskEstimationNone
      : _taskEstimationPointLabel(
          points: state._estimationPoints!,
          board: state.widget.board,
        );
}

String _selectedTaskAssigneesLabel(
  _TaskBoardTaskEditorSheetState state,
  BuildContext context,
) {
  return state._selectionSummary(
    selectedIds: state._selectedAssigneeIds,
    options: [
      for (final member in state.widget.members)
        _MultiSelectOption(id: member.id, label: member.label),
    ],
    emptyLabel: context.l10n.taskBoardDetailNone,
  );
}

String _selectedTaskLabelsLabel(
  _TaskBoardTaskEditorSheetState state,
  BuildContext context,
) {
  return state._selectionSummary(
    selectedIds: state._selectedLabelIds,
    options: [
      for (final label in state.widget.labels)
        _MultiSelectOption(id: label.id, label: label.name),
    ],
    emptyLabel: context.l10n.taskBoardDetailNone,
  );
}

String _selectedTaskProjectsLabel(
  _TaskBoardTaskEditorSheetState state,
  BuildContext context,
) {
  return state._selectionSummary(
    selectedIds: state._selectedProjectIds,
    options: [
      for (final project in state.widget.projects)
        _MultiSelectOption(id: project.id, label: project.name),
    ],
    emptyLabel: context.l10n.taskBoardDetailNone,
  );
}

String? _normalizeTaskText(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return null;
  return trimmed;
}

void _showTaskEditorErrorToast(
  _TaskBoardTaskEditorSheetState state,
  String message,
) {
  final toastContext = Navigator.of(state.context, rootNavigator: true).context;
  if (!toastContext.mounted) return;
  shad.showToast(
    context: toastContext,
    builder: (context, overlay) =>
        shad.Alert.destructive(content: Text(message)),
  );
}
