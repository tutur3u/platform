part of 'task_board_detail_page.dart';

class _TaskBoardTaskEditorSheet extends StatefulWidget {
  const _TaskBoardTaskEditorSheet({
    required this.task,
    required this.board,
    required this.defaultListId,
    required this.lists,
    required this.labels,
    required this.members,
    required this.projects,
  });

  final TaskBoardTask? task;
  final TaskBoardDetail board;
  final String defaultListId;
  final List<TaskBoardList> lists;
  final List<TaskLabel> labels;
  final List<WorkspaceUserOption> members;
  final List<TaskProjectSummary> projects;

  @override
  State<_TaskBoardTaskEditorSheet> createState() =>
      _TaskBoardTaskEditorSheetState();
}

class _TaskBoardTaskEditorSheetState extends State<_TaskBoardTaskEditorSheet> {
  static const List<String> _priorityOptions = [
    'critical',
    'high',
    'normal',
    'low',
  ];

  late final TextEditingController _nameController;
  late final TextEditingController _descriptionController;
  late String _priority;
  late String _selectedListId;
  int? _estimationPoints;
  late Set<String> _selectedAssigneeIds;
  late Set<String> _selectedLabelIds;
  late Set<String> _selectedProjectIds;
  DateTime? _startDate;
  DateTime? _endDate;
  bool _isSaving = false;
  bool _isMoving = false;

  bool get _isCreate => widget.task == null;

  @override
  void initState() {
    super.initState();
    final task = widget.task;
    _nameController = TextEditingController(text: task?.name ?? '');
    _descriptionController = TextEditingController(
      text: task?.description ?? '',
    );
    _priority = _normalizePriority(task?.priority);
    _selectedListId = _resolveInitialListId(task);
    _estimationPoints = task?.estimationPoints;
    _selectedAssigneeIds = {
      for (final assignee in task?.assignees ?? const <TaskBoardTaskAssignee>[])
        assignee.id,
    };
    _selectedLabelIds = {
      for (final label in task?.labels ?? const <TaskBoardTaskLabel>[])
        label.id,
    };
    _selectedProjectIds = {
      for (final project in task?.projects ?? const <TaskBoardTaskProject>[])
        project.id,
    };
    _startDate = task?.startDate;
    _endDate = task?.endDate;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final sheetTitle = _isCreate
        ? context.l10n.taskBoardDetailCreateTask
        : context.l10n.taskBoardDetailEditTask;
    final saveLabel = _isCreate
        ? context.l10n.taskBoardDetailCreateTask
        : context.l10n.timerSave;
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 12, 16, 20 + bottomInset),
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * 0.8,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        sheetTitle,
                        style: theme.typography.large.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    shad.IconButton.ghost(
                      icon: const Icon(Icons.close),
                      onPressed: _isSaving || _isMoving
                          ? null
                          : () => unawaited(_closeEditor()),
                    ),
                  ],
                ),
                const shad.Gap(12),
                if (_isCreate) ...[
                  _SelectionFieldButton(
                    label: context.l10n.taskBoardDetailTaskListLabel,
                    value: _selectedListLabel(context),
                    enabled:
                        !_isSaving && !_isMoving && widget.lists.length > 1,
                    onPressed: _pickList,
                  ),
                  const shad.Gap(10),
                ],
                _EditorSectionCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      shad.TextField(
                        controller: _nameController,
                        placeholder: Text(
                          context.l10n.taskBoardDetailTaskTitleHint,
                        ),
                        autofocus: _isCreate,
                        onSubmitted: (_) => unawaited(_saveTask()),
                      ),
                      const shad.Gap(10),
                      shad.TextField(
                        controller: _descriptionController,
                        maxLines: 3,
                        placeholder: Text(
                          context.l10n.taskBoardDetailTaskDescriptionHint,
                        ),
                      ),
                    ],
                  ),
                ),
                const shad.Gap(10),
                _EditorSectionCard(
                  title: context.l10n.taskBoardDetailPriority,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: _priorityOptions
                            .map((value) {
                              final selected = _priority == value;
                              final label = _taskPriorityLabel(context, value);
                              return selected
                                  ? shad.PrimaryButton(
                                      onPressed: () {},
                                      child: Text(label),
                                    )
                                  : shad.OutlineButton(
                                      onPressed: _isSaving || _isMoving
                                          ? null
                                          : () => setState(
                                              () => _priority = value,
                                            ),
                                      child: Text(label),
                                    );
                            })
                            .toList(growable: false),
                      ),
                    ],
                  ),
                ),
                const shad.Gap(10),
                _EditorSectionCard(
                  title: context.l10n.taskBoardDetailTaskDates,
                  child: Column(
                    children: [
                      _DateFieldRow(
                        label: context.l10n.taskBoardDetailTaskStartDate,
                        value: _startDate,
                        onPick: _isSaving || _isMoving
                            ? null
                            : () => _pickDate(isStart: true),
                        onClear: _isSaving || _isMoving || _startDate == null
                            ? null
                            : () => setState(() => _startDate = null),
                      ),
                      const shad.Gap(8),
                      _DateFieldRow(
                        label: context.l10n.taskBoardDetailTaskEndDate,
                        value: _endDate,
                        onPick: _isSaving || _isMoving
                            ? null
                            : () => _pickDate(isStart: false),
                        onClear: _isSaving || _isMoving || _endDate == null
                            ? null
                            : () => setState(() => _endDate = null),
                      ),
                    ],
                  ),
                ),
                const shad.Gap(10),
                _EditorSectionCard(
                  child: Column(
                    children: [
                      _SelectionFieldButton(
                        label: context.l10n.taskBoardDetailTaskEstimation,
                        value: _estimationLabel(context),
                        enabled: !_isSaving && !_isMoving,
                        onPressed: _pickEstimation,
                      ),
                      const shad.Gap(8),
                      _SelectionFieldButton(
                        label: context.l10n.taskBoardDetailTaskAssignees,
                        value: _selectedAssigneesLabel(context),
                        enabled: !_isSaving && !_isMoving,
                        onPressed: _pickAssignees,
                      ),
                      const shad.Gap(8),
                      _SelectionFieldButton(
                        label: context.l10n.taskBoardDetailTaskLabels,
                        value: _selectedLabelsLabel(context),
                        enabled: !_isSaving && !_isMoving,
                        onPressed: _pickLabels,
                      ),
                      const shad.Gap(8),
                      _SelectionFieldButton(
                        label: context.l10n.taskBoardDetailTaskProjects,
                        value: _selectedProjectsLabel(context),
                        enabled: !_isSaving && !_isMoving,
                        onPressed: _pickProjects,
                      ),
                    ],
                  ),
                ),
                if (!_isCreate && widget.lists.length > 1) ...[
                  const shad.Gap(14),
                  shad.OutlineButton(
                    onPressed: _isSaving || _isMoving ? null : _moveTask,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.swap_horiz, size: 16),
                        const shad.Gap(8),
                        Text(context.l10n.taskBoardDetailMoveTask),
                      ],
                    ),
                  ),
                ],
                const shad.Gap(18),
                Row(
                  children: [
                    Expanded(
                      child: shad.OutlineButton(
                        onPressed: _isSaving || _isMoving
                            ? null
                            : () => unawaited(_closeEditor()),
                        child: Text(context.l10n.commonCancel),
                      ),
                    ),
                    const shad.Gap(10),
                    Expanded(
                      child: shad.PrimaryButton(
                        onPressed: _isSaving || _isMoving ? null : _saveTask,
                        child: _isSaving
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: shad.CircularProgressIndicator(),
                              )
                            : Text(saveLabel),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _saveTask() async {
    final title = _nameController.text.trim();
    final fallbackErrorMessage = context.l10n.commonSomethingWentWrong;

    if (title.isEmpty) {
      _showErrorToast(context.l10n.taskBoardDetailTaskTitleRequired);
      return;
    }

    if (_startDate != null &&
        _endDate != null &&
        _endDate!.isBefore(_startDate!)) {
      _showErrorToast(context.l10n.taskBoardDetailInvalidDateRange);
      return;
    }

    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final description = _normalizeText(_descriptionController.text);

    setState(() => _isSaving = true);
    try {
      final cubit = context.read<TaskBoardDetailCubit>();
      if (_isCreate) {
        await cubit.createTask(
          listId: _selectedListId,
          name: title,
          description: description,
          priority: _priority,
          startDate: _startDate,
          endDate: _endDate,
          estimationPoints: _estimationPoints,
          assigneeIds: _selectedAssigneeIds.toList(growable: false),
          labelIds: _selectedLabelIds.toList(growable: false),
          projectIds: _selectedProjectIds.toList(growable: false),
        );
      } else {
        final currentTask = widget.task!;
        await cubit.updateTask(
          taskId: currentTask.id,
          name: title,
          description: description,
          priority: _priority,
          startDate: _startDate,
          endDate: _endDate,
          estimationPoints: _estimationPoints,
          assigneeIds: _selectedAssigneeIds.toList(growable: false),
          labelIds: _selectedLabelIds.toList(growable: false),
          projectIds: _selectedProjectIds.toList(growable: false),
          clearDescription:
              description == null &&
              (currentTask.description?.trim().isNotEmpty ?? false),
          clearStartDate: _startDate == null && currentTask.startDate != null,
          clearEndDate: _endDate == null && currentTask.endDate != null,
          clearEstimationPoints:
              _estimationPoints == null && currentTask.estimationPoints != null,
        );
      }

      if (!mounted || !toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert(
          content: Text(
            _isCreate
                ? context.l10n.taskBoardDetailTaskCreated
                : context.l10n.taskBoardDetailTaskSaved,
          ),
        ),
      );
      await _closeEditor();
    } on ApiException catch (error) {
      if (!mounted || !toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert.destructive(
          content: Text(
            error.message.trim().isEmpty ? fallbackErrorMessage : error.message,
          ),
        ),
      );
    } on Exception {
      if (!mounted || !toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) =>
            shad.Alert.destructive(content: Text(fallbackErrorMessage)),
      );
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  Future<void> _moveTask() async {
    final task = widget.task;
    if (task == null) return;

    final fallbackErrorMessage = context.l10n.commonSomethingWentWrong;
    final availableLists = widget.lists
        .where((list) => list.id != task.listId)
        .toList(growable: false);

    if (availableLists.isEmpty) {
      _showErrorToast(context.l10n.taskBoardDetailNoMoveTargets);
      return;
    }

    final targetListId = await shad.showDialog<String>(
      context: context,
      builder: (context) => _MoveTaskListDialog(lists: availableLists),
    );

    if (targetListId == null || !mounted) return;

    final toastContext = Navigator.of(context, rootNavigator: true).context;

    setState(() => _isMoving = true);
    try {
      await context.read<TaskBoardDetailCubit>().moveTask(
        taskId: task.id,
        listId: targetListId,
      );

      if (!mounted || !toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) =>
            shad.Alert(content: Text(context.l10n.taskBoardDetailTaskMoved)),
      );
      await _closeEditor();
    } on ApiException catch (error) {
      if (!mounted || !toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert.destructive(
          content: Text(
            error.message.trim().isEmpty ? fallbackErrorMessage : error.message,
          ),
        ),
      );
    } on Exception {
      if (!mounted || !toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) =>
            shad.Alert.destructive(content: Text(fallbackErrorMessage)),
      );
    } finally {
      if (mounted) {
        setState(() => _isMoving = false);
      }
    }
  }

  Future<void> _pickList() async {
    if (widget.lists.length < 2) return;

    final selectedListId = await shad.showDialog<String>(
      context: context,
      builder: (context) => _TaskListPickerDialog(
        title: context.l10n.taskBoardDetailTaskListSelect,
        lists: widget.lists,
      ),
    );

    if (selectedListId == null ||
        !mounted ||
        selectedListId == _selectedListId) {
      return;
    }

    setState(() => _selectedListId = selectedListId);
  }

  Future<void> _pickDate({required bool isStart}) async {
    final current = isStart ? _startDate : _endDate;
    final picked = await showDatePicker(
      context: context,
      initialDate: current ?? DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked == null || !mounted) return;

    final normalized = DateTime(picked.year, picked.month, picked.day);
    setState(() {
      if (isStart) {
        _startDate = normalized;
      } else {
        _endDate = normalized;
      }
    });
  }

  Future<void> _pickEstimation() async {
    final result = await shad.showDialog<String>(
      context: context,
      builder: (context) => _TaskEstimationPickerDialog(
        selectedValue: _estimationPoints?.toString(),
        options: _taskEstimationOptions(widget.board),
        mapValueLabel: (value) => _taskEstimationPointLabel(
          points: value,
          board: widget.board,
        ),
      ),
    );

    if (result == null || !mounted) return;
    setState(() {
      _estimationPoints = result == 'none' ? null : int.tryParse(result);
    });
  }

  Future<void> _pickAssignees() async {
    final nextValues = await shad.showDialog<Set<String>>(
      context: context,
      builder: (context) => _TaskMultiSelectDialog(
        title: context.l10n.taskBoardDetailTaskSelectAssignees,
        options: [
          for (final member in widget.members)
            _MultiSelectOption(id: member.id, label: member.label),
        ],
        selectedIds: _selectedAssigneeIds,
      ),
    );

    if (nextValues == null || !mounted) return;
    setState(() => _selectedAssigneeIds = nextValues);
  }

  Future<void> _pickLabels() async {
    final nextValues = await shad.showDialog<Set<String>>(
      context: context,
      builder: (context) => _TaskMultiSelectDialog(
        title: context.l10n.taskBoardDetailTaskSelectLabels,
        options: [
          for (final label in widget.labels)
            _MultiSelectOption(id: label.id, label: label.name),
        ],
        selectedIds: _selectedLabelIds,
      ),
    );

    if (nextValues == null || !mounted) return;
    setState(() => _selectedLabelIds = nextValues);
  }

  Future<void> _pickProjects() async {
    final nextValues = await shad.showDialog<Set<String>>(
      context: context,
      builder: (context) => _TaskMultiSelectDialog(
        title: context.l10n.taskBoardDetailTaskSelectProjects,
        options: [
          for (final project in widget.projects)
            _MultiSelectOption(id: project.id, label: project.name),
        ],
        selectedIds: _selectedProjectIds,
      ),
    );

    if (nextValues == null || !mounted) return;
    setState(() => _selectedProjectIds = nextValues);
  }

  Future<void> _closeEditor() async {
    try {
      await shad.closeOverlay<void>(context);
      return;
    } on Exception {
      if (!mounted) return;
      final navigator = Navigator.of(context);
      if (navigator.canPop()) {
        navigator.pop();
      }
    }
  }

  String _normalizePriority(String? value) {
    final trimmed = value?.trim().toLowerCase();
    if (trimmed == null || trimmed.isEmpty) {
      return 'normal';
    }
    return _priorityOptions.contains(trimmed) ? trimmed : 'normal';
  }

  String _resolveInitialListId(TaskBoardTask? task) {
    if (task != null && widget.lists.any((list) => list.id == task.listId)) {
      return task.listId;
    }

    if (widget.lists.any((list) => list.id == widget.defaultListId)) {
      return widget.defaultListId;
    }

    return widget.lists.first.id;
  }

  String _selectedListLabel(BuildContext context) {
    final selectedList = widget.lists.firstWhere(
      (list) => list.id == _selectedListId,
      orElse: () => widget.lists.first,
    );

    final trimmedName = selectedList.name?.trim();
    if (trimmedName != null && trimmedName.isNotEmpty) {
      return trimmedName;
    }

    return context.l10n.taskBoardDetailUntitledList;
  }

  String _estimationLabel(BuildContext context) {
    return _estimationPoints == null
        ? context.l10n.taskBoardDetailTaskEstimationNone
        : _taskEstimationPointLabel(
            points: _estimationPoints!,
            board: widget.board,
          );
  }

  String _selectedAssigneesLabel(BuildContext context) {
    return _selectionSummary(
      selectedIds: _selectedAssigneeIds,
      options: [
        for (final member in widget.members)
          _MultiSelectOption(id: member.id, label: member.label),
      ],
      emptyLabel: context.l10n.taskBoardDetailNone,
    );
  }

  String _selectedLabelsLabel(BuildContext context) {
    return _selectionSummary(
      selectedIds: _selectedLabelIds,
      options: [
        for (final label in widget.labels)
          _MultiSelectOption(id: label.id, label: label.name),
      ],
      emptyLabel: context.l10n.taskBoardDetailNone,
    );
  }

  String _selectedProjectsLabel(BuildContext context) {
    return _selectionSummary(
      selectedIds: _selectedProjectIds,
      options: [
        for (final project in widget.projects)
          _MultiSelectOption(id: project.id, label: project.name),
      ],
      emptyLabel: context.l10n.taskBoardDetailNone,
    );
  }

  String _selectionSummary({
    required Set<String> selectedIds,
    required List<_MultiSelectOption> options,
    required String emptyLabel,
  }) {
    if (selectedIds.isEmpty) return emptyLabel;
    final labels = options
        .where((option) => selectedIds.contains(option.id))
        .map((option) => option.label.trim())
        .where((label) => label.isNotEmpty)
        .toList(growable: false);
    if (labels.isEmpty) return '${selectedIds.length}';
    if (labels.length <= 2) return labels.join(', ');
    return '${labels.take(2).join(', ')} +${labels.length - 2}';
  }

  String? _normalizeText(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return null;
    return trimmed;
  }

  void _showErrorToast(String message) {
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    if (!toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) =>
          shad.Alert.destructive(content: Text(message)),
    );
  }
}

class _DateFieldRow extends StatelessWidget {
  const _DateFieldRow({
    required this.label,
    required this.value,
    required this.onPick,
    required this.onClear,
  });

  final String label;
  final DateTime? value;
  final VoidCallback? onPick;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    final formatter = DateFormat.yMd();
    final buttonLabel = value == null
        ? context.l10n.taskBoardDetailNoDate
        : formatter.format(value!);

    return Row(
      children: [
        Expanded(
          child: shad.OutlineButton(
            onPressed: onPick,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(label),
                Text(buttonLabel),
              ],
            ),
          ),
        ),
        const shad.Gap(8),
        shad.IconButton.ghost(
          icon: const Icon(Icons.close),
          onPressed: onClear,
        ),
      ],
    );
  }
}

class _EditorSectionCard extends StatelessWidget {
  const _EditorSectionCard({
    required this.child,
    this.title,
  });

  final String? title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border.all(color: theme.colorScheme.border),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null) ...[
            Text(
              title!,
              style: theme.typography.small.copyWith(
                color: theme.colorScheme.mutedForeground,
                fontWeight: FontWeight.w600,
              ),
            ),
            const shad.Gap(8),
          ],
          child,
        ],
      ),
    );
  }
}

class _SelectionFieldButton extends StatelessWidget {
  const _SelectionFieldButton({
    required this.label,
    required this.value,
    required this.enabled,
    required this.onPressed,
  });

  final String label;
  final String value;
  final bool enabled;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return shad.OutlineButton(
      onPressed: enabled ? onPressed : null,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label),
          Flexible(
            child: Text(
              value,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.right,
            ),
          ),
        ],
      ),
    );
  }
}

class _MultiSelectOption {
  const _MultiSelectOption({required this.id, required this.label});

  final String id;
  final String label;
}

class _TaskMultiSelectDialog extends StatefulWidget {
  const _TaskMultiSelectDialog({
    required this.title,
    required this.options,
    required this.selectedIds,
  });

  final String title;
  final List<_MultiSelectOption> options;
  final Set<String> selectedIds;

  @override
  State<_TaskMultiSelectDialog> createState() => _TaskMultiSelectDialogState();
}

class _TaskMultiSelectDialogState extends State<_TaskMultiSelectDialog> {
  late Set<String> _selectedIds;

  @override
  void initState() {
    super.initState();
    _selectedIds = Set<String>.from(widget.selectedIds);
  }

  @override
  Widget build(BuildContext context) {
    return shad.AlertDialog(
      title: Text(widget.title),
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxHeight: 420),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: widget.options
                      .map((option) {
                        final selected = _selectedIds.contains(option.id);
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: shad.OutlineButton(
                            onPressed: () {
                              setState(() {
                                if (selected) {
                                  _selectedIds.remove(option.id);
                                } else {
                                  _selectedIds.add(option.id);
                                }
                              });
                            },
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    option.label.trim().isEmpty
                                        ? option.id
                                        : option.label,
                                  ),
                                ),
                                if (selected) const Icon(Icons.check, size: 16),
                              ],
                            ),
                          ),
                        );
                      })
                      .toList(growable: false),
                ),
              ),
            ),
            const shad.Gap(8),
            shad.OutlineButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(context.l10n.commonCancel),
            ),
            const shad.Gap(8),
            shad.PrimaryButton(
              onPressed: () => Navigator.of(context).pop(_selectedIds),
              child: Text(context.l10n.taskBoardDetailStatusDone),
            ),
          ],
        ),
      ),
    );
  }
}

class _TaskEstimationPickerDialog extends StatelessWidget {
  const _TaskEstimationPickerDialog({
    required this.selectedValue,
    required this.options,
    required this.mapValueLabel,
  });

  final String? selectedValue;
  final List<int> options;
  final String Function(int value) mapValueLabel;

  @override
  Widget build(BuildContext context) {
    final values = <String>[
      'none',
      ...options.map((value) => value.toString()),
    ];

    return shad.AlertDialog(
      title: Text(context.l10n.taskBoardDetailTaskEstimation),
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxHeight: 360),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ...values.map((value) {
                final isSelected = value == (selectedValue ?? 'none');
                final label = value == 'none'
                    ? context.l10n.taskBoardDetailTaskEstimationNone
                    : mapValueLabel(int.parse(value));

                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: shad.OutlineButton(
                    onPressed: () => Navigator.of(context).pop(value),
                    child: Row(
                      children: [
                        Expanded(child: Text(label)),
                        if (isSelected) const Icon(Icons.check, size: 16),
                      ],
                    ),
                  ),
                );
              }),
              shad.OutlineButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text(context.l10n.commonCancel),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MoveTaskListDialog extends StatelessWidget {
  const _MoveTaskListDialog({required this.lists});

  final List<TaskBoardList> lists;

  @override
  Widget build(BuildContext context) {
    return shad.AlertDialog(
      title: Text(context.l10n.taskBoardDetailMoveTask),
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxHeight: 360),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ...lists.map((list) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: shad.OutlineButton(
                    onPressed: () => Navigator.of(context).pop(list.id),
                    child: _TaskBoardListOptionRow(list: list),
                  ),
                );
              }),
              shad.OutlineButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text(context.l10n.commonCancel),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TaskListPickerDialog extends StatelessWidget {
  const _TaskListPickerDialog({
    required this.title,
    required this.lists,
  });

  final String title;
  final List<TaskBoardList> lists;

  @override
  Widget build(BuildContext context) {
    return shad.AlertDialog(
      title: Text(title),
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxHeight: 360),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ...lists.map((list) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: shad.GhostButton(
                    onPressed: () => Navigator.of(context).pop(list.id),
                    child: _TaskBoardListOptionRow(list: list),
                  ),
                );
              }),
              shad.OutlineButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text(context.l10n.commonCancel),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TaskBoardListOptionRow extends StatelessWidget {
  const _TaskBoardListOptionRow({required this.list});

  final TaskBoardList list;

  @override
  Widget build(BuildContext context) {
    final label = list.name?.trim().isNotEmpty == true
        ? list.name!.trim()
        : context.l10n.taskBoardDetailUntitledList;
    final style = _taskBoardListVisualStyle(context, list);

    return Row(
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            color: style.accent,
            shape: BoxShape.circle,
          ),
        ),
        const shad.Gap(8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, overflow: TextOverflow.ellipsis),
              Text(
                style.statusLabel,
                style: shad.Theme.of(context).typography.small.copyWith(
                  fontSize: 11,
                  color: style.statusBadge.textColor,
                ),
              ),
            ],
          ),
        ),
        Icon(
          style.statusIcon,
          size: 16,
          color: style.statusBadge.textColor,
        ),
      ],
    );
  }
}
