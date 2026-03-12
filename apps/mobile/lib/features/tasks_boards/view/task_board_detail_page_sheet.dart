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
    _selectedAssigneeIds = {...?task?.assigneeIds};
    _selectedLabelIds = {...?task?.labelIds};
    _selectedProjectIds = {...?task?.projectIds};
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
    await _saveTaskEditorTask(this);
  }

  Future<void> _moveTask() async {
    await _moveTaskEditorTask(this);
  }

  Future<void> _pickList() async {
    await _pickTaskList(this);
  }

  Future<void> _pickDate({required bool isStart}) async {
    await _pickTaskDate(this, isStart: isStart);
  }

  Future<void> _pickEstimation() async {
    await _pickTaskEstimation(this);
  }

  Future<void> _pickAssignees() async {
    await _pickTaskAssignees(this);
  }

  Future<void> _pickLabels() async {
    await _pickTaskLabels(this);
  }

  Future<void> _pickProjects() async {
    await _pickTaskProjects(this);
  }

  Future<void> _closeEditor() async {
    await _closeTaskEditor(this);
  }

  void _updateState(VoidCallback updates) {
    setState(updates);
  }

  String _normalizePriority(String? value) {
    return _normalizeTaskPriority(value, _priorityOptions);
  }

  String _resolveInitialListId(TaskBoardTask? task) {
    return _resolveTaskInitialListId(this, task);
  }

  String _selectedListLabel(BuildContext context) {
    return _selectedTaskListLabel(this, context);
  }

  String _estimationLabel(BuildContext context) {
    return _taskEditorEstimationLabel(this, context);
  }

  String _selectedAssigneesLabel(BuildContext context) {
    return _selectedTaskAssigneesLabel(this, context);
  }

  String _selectedLabelsLabel(BuildContext context) {
    return _selectedTaskLabelsLabel(this, context);
  }

  String _selectedProjectsLabel(BuildContext context) {
    return _selectedTaskProjectsLabel(this, context);
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
}
