part of 'task_board_detail_page.dart';

class _TaskBoardTaskEditorSheet extends StatefulWidget {
  const _TaskBoardTaskEditorSheet({
    required this.task,
    required this.defaultListId,
    required this.lists,
  });

  final TaskBoardTask? task;
  final String defaultListId;
  final List<TaskBoardList> lists;

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
                          : () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
                const shad.Gap(12),
                Text(
                  context.l10n.taskBoardDetailTaskTitleLabel,
                  style: theme.typography.small,
                ),
                const shad.Gap(6),
                shad.TextField(
                  controller: _nameController,
                  placeholder: Text(context.l10n.taskBoardDetailTaskTitleHint),
                  autofocus: _isCreate,
                  onSubmitted: (_) => unawaited(_saveTask()),
                ),
                const shad.Gap(12),
                Text(
                  context.l10n.taskBoardDetailTaskDescriptionLabel,
                  style: theme.typography.small,
                ),
                const shad.Gap(6),
                shad.TextField(
                  controller: _descriptionController,
                  maxLines: 3,
                  placeholder: Text(
                    context.l10n.taskBoardDetailTaskDescriptionHint,
                  ),
                ),
                const shad.Gap(12),
                Text(
                  context.l10n.taskBoardDetailPriority,
                  style: theme.typography.small,
                ),
                const shad.Gap(6),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _priorityOptions
                      .map((value) {
                        final selected = _priority == value;
                        final label = _taskPriorityLabel(context, value);
                        if (selected) {
                          return shad.PrimaryButton(
                            onPressed: () {},
                            child: Text(label),
                          );
                        }
                        return shad.OutlineButton(
                          onPressed: _isSaving || _isMoving
                              ? null
                              : () => setState(() => _priority = value),
                          child: Text(label),
                        );
                      })
                      .toList(growable: false),
                ),
                const shad.Gap(12),
                Text(
                  context.l10n.taskBoardDetailTaskDates,
                  style: theme.typography.small,
                ),
                const shad.Gap(6),
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
                            : () => Navigator.of(context).pop(),
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
          listId: widget.defaultListId,
          name: title,
          description: description,
          priority: _priority,
          startDate: _startDate,
          endDate: _endDate,
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
          clearDescription:
              description == null &&
              (currentTask.description?.trim().isNotEmpty ?? false),
          clearStartDate: _startDate == null && currentTask.startDate != null,
          clearEndDate: _endDate == null && currentTask.endDate != null,
        );
      }

      if (!mounted || !toastContext.mounted) return;
      Navigator.of(context).pop();
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
      Navigator.of(context).pop();
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) =>
            shad.Alert(content: Text(context.l10n.taskBoardDetailTaskMoved)),
      );
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

  String _normalizePriority(String? value) {
    final trimmed = value?.trim().toLowerCase();
    if (trimmed == null || trimmed.isEmpty) {
      return 'normal';
    }
    return _priorityOptions.contains(trimmed) ? trimmed : 'normal';
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
                final label = list.name?.trim().isNotEmpty == true
                    ? list.name!.trim()
                    : context.l10n.taskBoardDetailUntitledList;

                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: shad.OutlineButton(
                    onPressed: () => Navigator.of(context).pop(list.id),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Text(label),
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
