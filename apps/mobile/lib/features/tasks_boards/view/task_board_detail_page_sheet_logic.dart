part of 'task_board_detail_page.dart';

enum _TaskRelationshipRole {
  parentTask,
  childTask,
  blockedBy,
  blocking,
  relatedTask,
}

Future<void> _loadTaskRelationshipsIfNeeded(
  _TaskBoardTaskEditorSheetState state, {
  bool force = false,
}) async {
  final task = state.widget.task;
  if (task == null) return;

  if (!force && task.relationshipsLoaded) {
    return;
  }

  state._updateState(() {
    state
      .._isLoadingRelationships = true
      .._relationshipsError = null;
  });

  try {
    await state.context.read<TaskBoardDetailCubit>().loadTaskRelationships(
      taskId: task.id,
    );
    if (!state.mounted) return;

    final updatedTask = _findTaskInBoardState(state, task.id);
    state._updateState(() {
      state
        .._relationshipsState =
            updatedTask?.relationships ?? TaskRelationshipsResponse.empty
        .._isLoadingRelationships = false
        .._relationshipsError = null;
    });
  } on ApiException catch (error) {
    if (!state.mounted) return;
    state._updateState(() {
      state
        .._isLoadingRelationships = false
        .._relationshipsError = error.message.trim().isEmpty
            ? null
            : error.message;
    });
  } on Exception {
    if (!state.mounted) return;
    state._updateState(() {
      state
        .._isLoadingRelationships = false
        .._relationshipsError = state.context.l10n.commonSomethingWentWrong;
    });
  }
}

TaskBoardTask? _findTaskInBoardState(
  _TaskBoardTaskEditorSheetState state,
  String taskId,
) {
  final tasks = state.context.read<TaskBoardDetailCubit>().state.board?.tasks;
  if (tasks == null) return null;

  for (final task in tasks) {
    if (task.id == taskId) {
      return task;
    }
  }

  return null;
}

Future<void> _pickTaskRelationship(
  _TaskBoardTaskEditorSheetState state, {
  required _TaskRelationshipRole role,
}) async {
  final task = state.widget.task;
  if (task == null) return;

  if (state._relationshipTaskOptions.isEmpty) {
    await _loadRelationshipTaskOptions(state);
  }

  if (!state.mounted) return;

  final blockedIds = _blockedRelationshipTaskIds(state, role: role);
  final options = state._relationshipTaskOptions
      .where((option) => !blockedIds.contains(option.id))
      .toList(growable: false);

  if (options.isEmpty) {
    _showTaskEditorErrorToast(
      state,
      state.context.l10n.taskBoardDetailNoAvailableRelationshipTasks,
    );
    return;
  }

  final selectedTaskId = await shad.showDialog<String>(
    context: state.context,
    builder: (context) => _TaskRelationshipPickerDialog(
      title: _relationshipPickerTitle(state.context, role),
      tasks: options,
    ),
  );

  if (selectedTaskId == null || !state.mounted) return;

  await _createTaskRelationship(
    state,
    selectedTaskId: selectedTaskId,
    role: role,
  );
}

Future<void> _loadRelationshipTaskOptions(
  _TaskBoardTaskEditorSheetState state,
) async {
  final options = await state.context
      .read<TaskBoardDetailCubit>()
      .getRelationshipTaskOptions();
  final currentTaskId = state.widget.task?.id;

  state._updateState(() {
    state._relationshipTaskOptions = options
        .where((option) => option.id != currentTaskId)
        .toList(growable: false);
  });
}

Set<String> _blockedRelationshipTaskIds(
  _TaskBoardTaskEditorSheetState state, {
  required _TaskRelationshipRole role,
}) {
  final relationships = state._relationships;

  return switch (role) {
    _TaskRelationshipRole.parentTask => {
      if (relationships.parentTask != null) relationships.parentTask!.id,
    },
    _TaskRelationshipRole.childTask => {
      for (final task in relationships.childTasks) task.id,
    },
    _TaskRelationshipRole.blockedBy => {
      for (final task in relationships.blockedBy) task.id,
    },
    _TaskRelationshipRole.blocking => {
      for (final task in relationships.blocking) task.id,
    },
    _TaskRelationshipRole.relatedTask => {
      for (final task in relationships.relatedTasks) task.id,
    },
  };
}

String _relationshipPickerTitle(
  BuildContext context,
  _TaskRelationshipRole role,
) {
  return switch (role) {
    _TaskRelationshipRole.parentTask =>
      context.l10n.taskBoardDetailAddParentTask,
    _TaskRelationshipRole.childTask => context.l10n.taskBoardDetailAddChildTask,
    _TaskRelationshipRole.blockedBy =>
      context.l10n.taskBoardDetailAddBlockedByTask,
    _TaskRelationshipRole.blocking =>
      context.l10n.taskBoardDetailAddBlockingTask,
    _TaskRelationshipRole.relatedTask =>
      context.l10n.taskBoardDetailAddRelatedTask,
  };
}

Future<void> _createTaskRelationship(
  _TaskBoardTaskEditorSheetState state, {
  required String selectedTaskId,
  required _TaskRelationshipRole role,
}) async {
  final currentTask = state.widget.task;
  if (currentTask == null) return;

  final relation = _relationshipMutation(
    currentTaskId: currentTask.id,
    selectedTaskId: selectedTaskId,
    role: role,
  );

  final fallbackErrorMessage = state.context.l10n.commonSomethingWentWrong;
  final toastContext = Navigator.of(state.context, rootNavigator: true).context;
  final previousRelationships = state._relationshipsState;

  final selectedOption = state._relationshipTaskOptions
      .where((option) => option.id == selectedTaskId)
      .cast<TaskLinkOption?>()
      .firstWhere((option) => option != null, orElse: () => null);

  final optimisticTask = selectedOption == null
      ? null
      : RelatedTaskInfo(
          id: selectedOption.id,
          name: selectedOption.name,
          completed: selectedOption.completed,
          priority: selectedOption.priority,
          boardName: selectedOption.boardName,
        );

  state._updateState(() {
    state
      .._isMutatingRelationships = true
      .._relationshipsError = null
      .._relationshipsState = optimisticTask == null
          ? state._relationshipsState
          : _optimisticAddRelationship(
              state._relationshipsState,
              task: optimisticTask,
              role: role,
            );
  });

  try {
    await state.context.read<TaskBoardDetailCubit>().createTaskRelationship(
      taskId: currentTask.id,
      sourceTaskId: relation.sourceTaskId,
      targetTaskId: relation.targetTaskId,
      type: relation.type,
    );
    await _loadTaskRelationshipsIfNeeded(state, force: true);

    if (!state.mounted || !toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) => shad.Alert(
        content: Text(context.l10n.taskBoardDetailRelationshipAdded),
      ),
    );
  } on ApiException catch (error) {
    if (state.mounted) {
      state._updateState(
        () => state._relationshipsState = previousRelationships,
      );
    }
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
    if (state.mounted) {
      state._updateState(
        () => state._relationshipsState = previousRelationships,
      );
    }
    if (!state.mounted || !toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) =>
          shad.Alert.destructive(content: Text(fallbackErrorMessage)),
    );
  } finally {
    if (state.mounted) {
      state._updateState(() => state._isMutatingRelationships = false);
    }
  }
}

Future<void> _removeTaskRelationship(
  _TaskBoardTaskEditorSheetState state, {
  required RelatedTaskInfo targetTask,
  required _TaskRelationshipRole role,
}) async {
  final currentTask = state.widget.task;
  if (currentTask == null) return;

  final relation = _relationshipMutation(
    currentTaskId: currentTask.id,
    selectedTaskId: targetTask.id,
    role: role,
  );

  final fallbackErrorMessage = state.context.l10n.commonSomethingWentWrong;
  final toastContext = Navigator.of(state.context, rootNavigator: true).context;
  final previousRelationships = state._relationshipsState;

  state._updateState(() {
    state
      .._isMutatingRelationships = true
      .._relationshipsError = null
      .._relationshipsState = _optimisticRemoveRelationship(
        state._relationshipsState,
        taskId: targetTask.id,
        role: role,
      );
  });

  try {
    await state.context.read<TaskBoardDetailCubit>().deleteTaskRelationship(
      taskId: currentTask.id,
      sourceTaskId: relation.sourceTaskId,
      targetTaskId: relation.targetTaskId,
      type: relation.type,
    );
    await _loadTaskRelationshipsIfNeeded(state, force: true);

    if (!state.mounted || !toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) => shad.Alert(
        content: Text(context.l10n.taskBoardDetailRelationshipRemoved),
      ),
    );
  } on ApiException catch (error) {
    if (state.mounted) {
      state._updateState(
        () => state._relationshipsState = previousRelationships,
      );
    }
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
    if (state.mounted) {
      state._updateState(
        () => state._relationshipsState = previousRelationships,
      );
    }
    if (!state.mounted || !toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) =>
          shad.Alert.destructive(content: Text(fallbackErrorMessage)),
    );
  } finally {
    if (state.mounted) {
      state._updateState(() => state._isMutatingRelationships = false);
    }
  }
}

({
  String sourceTaskId,
  String targetTaskId,
  TaskRelationshipType type,
})
_relationshipMutation({
  required String currentTaskId,
  required String selectedTaskId,
  required _TaskRelationshipRole role,
}) {
  return switch (role) {
    _TaskRelationshipRole.parentTask => (
      sourceTaskId: selectedTaskId,
      targetTaskId: currentTaskId,
      type: TaskRelationshipType.parentChild,
    ),
    _TaskRelationshipRole.childTask => (
      sourceTaskId: currentTaskId,
      targetTaskId: selectedTaskId,
      type: TaskRelationshipType.parentChild,
    ),
    _TaskRelationshipRole.blockedBy => (
      sourceTaskId: selectedTaskId,
      targetTaskId: currentTaskId,
      type: TaskRelationshipType.blocks,
    ),
    _TaskRelationshipRole.blocking => (
      sourceTaskId: currentTaskId,
      targetTaskId: selectedTaskId,
      type: TaskRelationshipType.blocks,
    ),
    _TaskRelationshipRole.relatedTask => (
      sourceTaskId: currentTaskId,
      targetTaskId: selectedTaskId,
      type: TaskRelationshipType.related,
    ),
  };
}

TaskRelationshipsResponse _optimisticAddRelationship(
  TaskRelationshipsResponse current, {
  required RelatedTaskInfo task,
  required _TaskRelationshipRole role,
}) {
  switch (role) {
    case _TaskRelationshipRole.parentTask:
      return TaskRelationshipsResponse(
        parentTask: task,
        childTasks: current.childTasks,
        blockedBy: current.blockedBy,
        blocking: current.blocking,
        relatedTasks: current.relatedTasks,
      );
    case _TaskRelationshipRole.childTask:
      return TaskRelationshipsResponse(
        parentTask: current.parentTask,
        childTasks: _appendUniqueTask(current.childTasks, task),
        blockedBy: current.blockedBy,
        blocking: current.blocking,
        relatedTasks: current.relatedTasks,
      );
    case _TaskRelationshipRole.blockedBy:
      return TaskRelationshipsResponse(
        parentTask: current.parentTask,
        childTasks: current.childTasks,
        blockedBy: _appendUniqueTask(current.blockedBy, task),
        blocking: current.blocking,
        relatedTasks: current.relatedTasks,
      );
    case _TaskRelationshipRole.blocking:
      return TaskRelationshipsResponse(
        parentTask: current.parentTask,
        childTasks: current.childTasks,
        blockedBy: current.blockedBy,
        blocking: _appendUniqueTask(current.blocking, task),
        relatedTasks: current.relatedTasks,
      );
    case _TaskRelationshipRole.relatedTask:
      return TaskRelationshipsResponse(
        parentTask: current.parentTask,
        childTasks: current.childTasks,
        blockedBy: current.blockedBy,
        blocking: current.blocking,
        relatedTasks: _appendUniqueTask(current.relatedTasks, task),
      );
  }
}

TaskRelationshipsResponse _optimisticRemoveRelationship(
  TaskRelationshipsResponse current, {
  required String taskId,
  required _TaskRelationshipRole role,
}) {
  switch (role) {
    case _TaskRelationshipRole.parentTask:
      return TaskRelationshipsResponse(
        childTasks: current.childTasks,
        blockedBy: current.blockedBy,
        blocking: current.blocking,
        relatedTasks: current.relatedTasks,
      );
    case _TaskRelationshipRole.childTask:
      return TaskRelationshipsResponse(
        parentTask: current.parentTask,
        childTasks: current.childTasks
            .where((task) => task.id != taskId)
            .toList(growable: false),
        blockedBy: current.blockedBy,
        blocking: current.blocking,
        relatedTasks: current.relatedTasks,
      );
    case _TaskRelationshipRole.blockedBy:
      return TaskRelationshipsResponse(
        parentTask: current.parentTask,
        childTasks: current.childTasks,
        blockedBy: current.blockedBy
            .where((task) => task.id != taskId)
            .toList(growable: false),
        blocking: current.blocking,
        relatedTasks: current.relatedTasks,
      );
    case _TaskRelationshipRole.blocking:
      return TaskRelationshipsResponse(
        parentTask: current.parentTask,
        childTasks: current.childTasks,
        blockedBy: current.blockedBy,
        blocking: current.blocking
            .where((task) => task.id != taskId)
            .toList(growable: false),
        relatedTasks: current.relatedTasks,
      );
    case _TaskRelationshipRole.relatedTask:
      return TaskRelationshipsResponse(
        parentTask: current.parentTask,
        childTasks: current.childTasks,
        blockedBy: current.blockedBy,
        blocking: current.blocking,
        relatedTasks: current.relatedTasks
            .where((task) => task.id != taskId)
            .toList(growable: false),
      );
  }
}

List<RelatedTaskInfo> _appendUniqueTask(
  List<RelatedTaskInfo> tasks,
  RelatedTaskInfo task,
) {
  if (tasks.any((item) => item.id == task.id)) {
    return tasks;
  }
  return [...tasks, task];
}

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
  } on Object catch (error) {
    final message = error.toString().trim();
    if (!state.mounted || !toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) => shad.Alert.destructive(
        content: Text(message.isEmpty ? fallbackErrorMessage : message),
      ),
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
  } on Object catch (error) {
    final message = error.toString().trim();
    if (!state.mounted || !toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) => shad.Alert.destructive(
        content: Text(message.isEmpty ? fallbackErrorMessage : message),
      ),
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
