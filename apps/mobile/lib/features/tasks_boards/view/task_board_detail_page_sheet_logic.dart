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
  if (state._isLoadingRelationships &&
      state._relationshipsLoadingTaskId == task.id) {
    return;
  }

  if (!force && task.relationshipsLoaded) {
    return;
  }

  final requestToken = ++state._relationshipsLoadRequestToken;

  state._updateState(() {
    state
      .._isLoadingRelationships = true
      .._relationshipsLoadingTaskId = task.id
      .._relationshipsError = null;
  });

  try {
    await state.context.read<TaskBoardDetailCubit>().loadTaskRelationships(
      taskId: task.id,
    );
    if (!state.mounted) return;
    if (requestToken != state._relationshipsLoadRequestToken) return;
    if (state.widget.task?.id != task.id) return;

    final updatedTask = _findTaskInBoardState(state, task.id);
    state._updateState(() {
      state
        .._relationshipsState =
            updatedTask?.relationships ?? TaskRelationshipsResponse.empty
        .._relationshipsError = null;
    });
  } on ApiException catch (error) {
    if (!state.mounted) return;
    if (requestToken != state._relationshipsLoadRequestToken) return;
    if (state.widget.task?.id != task.id) return;
    final fallbackErrorMessage = state.context.l10n.commonSomethingWentWrong;
    state._updateState(() {
      state._relationshipsError = error.message.trim().isEmpty
          ? fallbackErrorMessage
          : error.message;
    });
  } on Exception {
    if (!state.mounted) return;
    if (requestToken != state._relationshipsLoadRequestToken) return;
    if (state.widget.task?.id != task.id) return;
    final fallbackErrorMessage = state.context.l10n.commonSomethingWentWrong;
    state._updateState(() {
      state._relationshipsError = fallbackErrorMessage;
    });
  } finally {
    if (state.mounted && requestToken == state._relationshipsLoadRequestToken) {
      state._updateState(() {
        state
          .._isLoadingRelationships = false
          .._relationshipsLoadingTaskId = null;
      });
    }
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
    final fallbackErrorMessage = state.context.l10n.commonSomethingWentWrong;
    try {
      await _loadRelationshipTaskOptions(state);
    } on ApiException catch (error) {
      if (!state.mounted) return;
      _showTaskEditorErrorToast(
        state,
        error.message.trim().isEmpty ? fallbackErrorMessage : error.message,
      );
      return;
    } on Exception {
      if (!state.mounted) return;
      _showTaskEditorErrorToast(state, fallbackErrorMessage);
      return;
    }
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
  if (!state.mounted) return;

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
  final description = state._isTaskDescriptionEditingEnabled
      ? normalizeTaskDescriptionPayload(state._descriptionController.text)
      : null;
  final sanitizedAssigneeIds = state._workspaceMemberAssigneeIds(
    state._selectedAssigneeIds,
  );
  if (!FormDirtyUtils.sameUnorderedValues(
    sanitizedAssigneeIds,
    state._selectedAssigneeIds,
  )) {
    state._updateState(() {
      state._selectedAssigneeIds = sanitizedAssigneeIds;
    });
  }
  final assigneeIds = sanitizedAssigneeIds.toList(growable: false)..sort();

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
        assigneeIds: assigneeIds,
        labelIds: state._selectedLabelIds.toList(growable: false),
        projectIds: state._selectedProjectIds.toList(growable: false),
      );
    } else {
      final currentTask = state.widget.task!;
      final shouldClearDescription =
          state._isTaskDescriptionEditingEnabled &&
          (state._initialDescription?.isNotEmpty ?? false) &&
          description == null;
      await cubit.updateTask(
        taskId: currentTask.id,
        listId: currentTask.listId,
        name: title,
        priority: state._priority,
        startDate: state._startDate,
        endDate: state._endDate,
        estimationPoints: state._estimationPoints,
        assigneeIds: assigneeIds,
        labelIds: state._selectedLabelIds.toList(growable: false),
        projectIds: state._selectedProjectIds.toList(growable: false),
        description: description,
        clearDescription: shouldClearDescription,
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
    if (state.widget.embedded && !state._isCreate) {
      state._markCurrentValuesSaved();
      final refreshedTask = _findTaskEditorTaskInState(
        cubit.state,
        state.widget.task!.id,
      );
      if (refreshedTask != null) {
        state.widget.onTaskChanged?.call(refreshedTask);
      }
    } else {
      await state._closeEditor();
    }
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

TaskBoardTask? _findTaskEditorTaskInState(
  TaskBoardDetailState state,
  String taskId,
) {
  final tasks = state.board?.tasks;
  if (tasks == null) return null;

  for (final task in tasks) {
    if (task.id == taskId) {
      return task;
    }
  }

  return null;
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

Future<void> _deleteTaskEditorTask(_TaskBoardTaskEditorSheetState state) async {
  final task = state.widget.task;
  if (task == null) return;

  final toastContext = Navigator.of(state.context, rootNavigator: true).context;
  state._updateState(() => state._isDeleting = true);
  var deleted = false;
  try {
    deleted =
        await shad.showDialog<bool>(
          context: state.context,
          builder: (_) => AsyncDeleteConfirmationDialog(
            title: state.context.l10n.taskBoardDetailDeleteTaskTitle,
            message: state.context.l10n.taskBoardDetailDeleteTaskDescription,
            cancelLabel: state.context.l10n.commonCancel,
            confirmLabel: state.context.l10n.taskBoardDetailDeleteTask,
            toastContext: toastContext,
            onConfirm: () async {
              await state.context.read<TaskBoardDetailCubit>().deleteTask(
                taskId: task.id,
              );
            },
          ),
        ) ??
        false;
  } finally {
    if (state.mounted) {
      state._updateState(() => state._isDeleting = false);
    }
  }

  if (!deleted || !state.mounted) {
    return;
  }

  if (!toastContext.mounted) return;
  shad.showToast(
    context: toastContext,
    builder: (context, overlay) => shad.Alert(
      content: Text(context.l10n.taskBoardDetailTaskDeleted),
    ),
  );
  await state._closeEditor();
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
  final picked = await showAdaptiveSheet<DateTime>(
    context: state.context,
    backgroundColor: shad.Theme.of(state.context).colorScheme.background,
    builder: (context) => _TaskDatePickerSheet(
      title: isStart
          ? state.context.l10n.taskBoardDetailTaskStartDate
          : state.context.l10n.taskBoardDetailTaskEndDate,
      initialDate: current ?? DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    ),
  );
  if (picked == null || !state.mounted) return;

  final normalized = isStart ? _taskStartOfDay(picked) : _taskEndOfDay(picked);
  state._updateState(() {
    if (isStart) {
      state._startDate = normalized;
      if (state._endDate != null && normalized.isAfter(state._endDate!)) {
        state._endDate = _taskEndOfDay(picked);
      }
    } else {
      state._endDate = normalized;
      if (state._startDate != null && normalized.isBefore(state._startDate!)) {
        state._startDate = _taskStartOfDay(picked);
      }
    }
  });
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
