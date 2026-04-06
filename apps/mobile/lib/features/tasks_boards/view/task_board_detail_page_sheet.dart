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
    required this.isPersonalWorkspace,
  });

  final TaskBoardTask? task;
  final TaskBoardDetail board;
  final String defaultListId;
  final List<TaskBoardList> lists;
  final List<TaskLabel> labels;
  final List<WorkspaceUserOption> members;
  final List<TaskProjectSummary> projects;
  final bool isPersonalWorkspace;

  @override
  State<_TaskBoardTaskEditorSheet> createState() =>
      _TaskBoardTaskEditorSheetState();
}

class _TaskBoardTaskEditorSheetState extends State<_TaskBoardTaskEditorSheet> {
  static const int _detailsTabIndex = 0;
  static const List<String> _priorityOptions = [
    'critical',
    'high',
    'normal',
    'low',
  ];

  late final TextEditingController _nameController;
  late final TextEditingController _descriptionController;
  late final String _initialName;
  late final String? _initialDescription;
  late final String _initialPriority;
  late final int? _initialEstimationPoints;
  late final Set<String> _initialAssigneeIds;
  late final Set<String> _initialLabelIds;
  late final Set<String> _initialProjectIds;
  DateTime? _initialStartDate;
  DateTime? _initialEndDate;
  late String _priority;
  late String _selectedListId;
  int? _estimationPoints;
  late Set<String> _selectedAssigneeIds;
  late Set<String> _selectedLabelIds;
  late Set<String> _selectedProjectIds;
  DateTime? _startDate;
  DateTime? _endDate;
  int _activeTab = _detailsTabIndex;
  bool _isLoadingRelationships = false;
  int _relationshipsLoadRequestToken = 0;
  String? _relationshipsLoadingTaskId;
  bool _isMutatingRelationships = false;
  String? _relationshipsError;
  TaskRelationshipsResponse _relationshipsState =
      TaskRelationshipsResponse.empty;
  List<TaskLinkOption> _relationshipTaskOptions = const [];
  bool _isSaving = false;
  bool _isMoving = false;
  bool _isDeleting = false;

  bool get _isCreate => widget.task == null;

  bool get _isTaskDescriptionEditingEnabled {
    return Env.isDevelopment ||
        (Env.isTaskDescriptionEditingEnabled && widget.isPersonalWorkspace);
  }

  bool get _isBusy {
    return _isSaving || _isMoving || _isDeleting || _isMutatingRelationships;
  }

  bool get _hasTaskChanges {
    if (_isCreate) {
      return _nameController.text.trim().isNotEmpty;
    }

    if (_nameController.text.trim() != _initialName) {
      return true;
    }

    if (_isTaskDescriptionEditingEnabled) {
      final description = normalizeTaskDescriptionPayload(
        _descriptionController.text,
      );
      if (description != _initialDescription) {
        return true;
      }
    }

    if (_priority != _initialPriority) {
      return true;
    }

    if (_estimationPoints != _initialEstimationPoints) {
      return true;
    }

    if (!FormDirtyUtils.sameUnorderedValues(
      _selectedAssigneeIds,
      _initialAssigneeIds,
    )) {
      return true;
    }

    if (!FormDirtyUtils.sameUnorderedValues(
      _selectedLabelIds,
      _initialLabelIds,
    )) {
      return true;
    }

    if (!FormDirtyUtils.sameUnorderedValues(
      _selectedProjectIds,
      _initialProjectIds,
    )) {
      return true;
    }

    if (!FormDirtyUtils.sameMoment(_startDate, _initialStartDate)) {
      return true;
    }

    if (!FormDirtyUtils.sameMoment(_endDate, _initialEndDate)) {
      return true;
    }

    return false;
  }

  bool get _canSave {
    if (_isBusy) {
      return false;
    }

    if (_nameController.text.trim().isEmpty) {
      return false;
    }

    return _isCreate || _hasTaskChanges;
  }

  TaskRelationshipsResponse get _relationships {
    return _relationshipsState;
  }

  int get _relationshipIndicatorCount {
    if (_isCreate) return 0;
    return _relationships.totalCount;
  }

  @override
  void initState() {
    super.initState();
    final task = widget.task;
    _nameController = TextEditingController(text: task?.name ?? '');
    final initialDescriptionText =
        normalizeTaskDescriptionPayload(task?.description ?? '') ?? '';
    _descriptionController = TextEditingController(
      text: initialDescriptionText,
    );
    _initialName = (task?.name ?? '').trim();
    _initialDescription = normalizeTaskDescriptionPayload(
      initialDescriptionText,
    );
    _initialPriority = _normalizePriority(task?.priority);
    _initialEstimationPoints = task?.estimationPoints;
    _initialAssigneeIds = {...?task?.assigneeIds};
    _initialLabelIds = {...?task?.labelIds};
    _initialProjectIds = {...?task?.projectIds};
    _initialStartDate = task?.startDate;
    _initialEndDate = task?.endDate;
    _priority = _normalizePriority(task?.priority);
    _selectedListId = _resolveInitialListId(task);
    _estimationPoints = task?.estimationPoints;
    _selectedAssigneeIds = {...?task?.assigneeIds};
    _selectedLabelIds = {...?task?.labelIds};
    _selectedProjectIds = {...?task?.projectIds};
    _startDate = task?.startDate;
    _endDate = task?.endDate;
    _relationshipsState =
        task?.relationships ?? TaskRelationshipsResponse.empty;

    if (!_isCreate) {
      unawaited(_loadRelationshipsIfNeeded(force: true));
    }

    _nameController.addListener(_handleFormFieldChanged);
    _descriptionController.addListener(_handleFormFieldChanged);
  }

  @override
  void dispose() {
    _nameController.removeListener(_handleFormFieldChanged);
    _descriptionController.removeListener(_handleFormFieldChanged);
    _nameController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  void _handleFormFieldChanged() {
    if (!mounted) return;
    setState(() {});
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
                      onPressed: _isBusy
                          ? null
                          : () => unawaited(_closeEditor()),
                    ),
                  ],
                ),
                const shad.Gap(12),
                if (!_isCreate) ...[
                  shad.Tabs(
                    index: _activeTab,
                    onChanged: (value) {
                      if (_isBusy) return;
                      setState(() => _activeTab = value);
                    },
                    children: [
                      shad.TabItem(
                        child: Text(
                          context.l10n.taskBoardDetailEditorDetailsTab,
                        ),
                      ),
                      shad.TabItem(
                        child: _TaskEditorTabLabel(
                          label: context
                              .l10n
                              .taskBoardDetailEditorRelationshipsTab,
                          count: _relationshipIndicatorCount,
                        ),
                      ),
                    ],
                  ),
                  const shad.Gap(10),
                ],
                if (_isCreate || _activeTab == _detailsTabIndex)
                  _buildDetailsTab(context)
                else
                  _buildRelationshipsTab(context),
                if (!_isCreate && widget.lists.length > 1) ...[
                  const shad.Gap(14),
                  shad.OutlineButton(
                    onPressed: _isBusy ? null : _moveTask,
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
                if (!_isCreate) ...[
                  const shad.Gap(10),
                  shad.DestructiveButton(
                    onPressed: _isBusy ? null : _deleteTask,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.delete_outline, size: 16),
                        const shad.Gap(8),
                        Text(context.l10n.taskBoardDetailDeleteTask),
                      ],
                    ),
                  ),
                ],
                const shad.Gap(18),
                Row(
                  children: [
                    Expanded(
                      child: shad.OutlineButton(
                        onPressed: _isBusy
                            ? null
                            : () => unawaited(_closeEditor()),
                        child: Text(context.l10n.commonCancel),
                      ),
                    ),
                    const shad.Gap(10),
                    Expanded(
                      child: shad.PrimaryButton(
                        onPressed: _canSave ? _saveTask : null,
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

  Widget _buildDetailsTab(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (_isCreate) ...[
          _SelectionFieldButton(
            label: context.l10n.taskBoardDetailTaskListLabel,
            value: _selectedListLabel(context),
            enabled: !_isBusy && widget.lists.length > 1,
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
                hintText: context.l10n.taskBoardDetailTaskTitleHint,
                autofocus: _isCreate,
                onSubmitted: (_) => unawaited(_saveTask()),
              ),
              if (_isTaskDescriptionEditingEnabled) ...[
                const shad.Gap(10),
                _EditFieldButton(
                  label: context.l10n.taskBoardDetailTaskEditDescription,
                  onPressed: _isBusy
                      ? null
                      : () => unawaited(_openDescriptionEditor(context)),
                ),
              ] else ...[
                const shad.Gap(10),
                Text(
                  Env.isTaskDescriptionEditingEnabled
                      ? context.l10n.taskBoardDetailTaskDescriptionPersonalOnly
                      : context.l10n.taskBoardDetailTaskDescriptionComingSoon,
                  style: shad.Theme.of(context).typography.small.copyWith(
                    color: shad.Theme.of(context).colorScheme.mutedForeground,
                  ),
                ),
              ],
            ],
          ),
        ),
        const shad.Gap(10),
        _EditorSectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _FilterDropdownSection(
                title: context.l10n.taskBoardDetailPriority,
                options: _taskEditorPriorityOptions(context),
                selectedIds: {_priority},
                enabled: !_isBusy,
                singleSelection: true,
                onApplySelection: (nextSelectedIds) => setState(() {
                  final selectedPriority = nextSelectedIds.firstOrNull;
                  _priority = _normalizePriority(selectedPriority);
                }),
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
                onPick: _isBusy ? null : () => _pickDate(isStart: true),
                onClear: _isBusy || _startDate == null
                    ? null
                    : () => setState(() => _startDate = null),
              ),
              const shad.Gap(8),
              _DateFieldRow(
                label: context.l10n.taskBoardDetailTaskEndDate,
                value: _endDate,
                onPick: _isBusy ? null : () => _pickDate(isStart: false),
                onClear: _isBusy || _endDate == null
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
              _FilterDropdownSection(
                title: context.l10n.taskBoardDetailTaskEstimation,
                options: _taskEditorEstimationOptions(),
                selectedIds: {
                  if (_estimationPoints != null) '${_estimationPoints!}',
                },
                enabled: !_isBusy,
                singleSelection: true,
                onApplySelection: (nextSelectedIds) => setState(() {
                  _estimationPoints = int.tryParse(
                    nextSelectedIds.firstOrNull ?? '',
                  );
                }),
              ),
              const shad.Gap(8),
              _FilterDropdownSection(
                title: context.l10n.taskBoardDetailTaskAssignees,
                options: _taskEditorAssigneeOptions(),
                selectedIds: _selectedAssigneeIds,
                enabled: !_isBusy,
                onApplySelection: (nextSelectedIds) => setState(() {
                  _selectedAssigneeIds = nextSelectedIds;
                }),
              ),
              const shad.Gap(8),
              _FilterDropdownSection(
                title: context.l10n.taskBoardDetailTaskLabels,
                options: _taskEditorLabelOptions(),
                selectedIds: _selectedLabelIds,
                enabled: !_isBusy,
                onApplySelection: (nextSelectedIds) => setState(() {
                  _selectedLabelIds = nextSelectedIds;
                }),
              ),
              const shad.Gap(8),
              _FilterDropdownSection(
                title: context.l10n.taskBoardDetailTaskProjects,
                options: _taskEditorProjectOptions(),
                selectedIds: _selectedProjectIds,
                enabled: !_isBusy,
                onApplySelection: (nextSelectedIds) => setState(() {
                  _selectedProjectIds = nextSelectedIds;
                }),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildRelationshipsTab(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (_isLoadingRelationships)
          const LinearProgressIndicator(minHeight: 2),
        if (_relationshipsError != null) ...[
          const shad.Gap(8),
          Text(
            _relationshipsError!,
            style: shad.Theme.of(context).typography.small.copyWith(
              color: shad.Theme.of(context).colorScheme.destructive,
            ),
          ),
        ],
        const shad.Gap(10),
        _RelationshipSectionCard(
          title: context.l10n.taskBoardDetailParentTask,
          icon: _taskRelationshipIcon(_TaskRelationshipKind.parent),
          children: [
            if (_relationships.parentTask != null)
              _RelationshipTaskTile(
                task: _relationships.parentTask!,
                onRemove: _isBusy
                    ? null
                    : () =>
                          _removeParentRelationship(_relationships.parentTask!),
              )
            else
              Text(
                context.l10n.taskBoardDetailNone,
                style: shad.Theme.of(context).typography.small,
              ),
            const shad.Gap(8),
            _SelectionFieldButton(
              label: context.l10n.taskBoardDetailAddParentTask,
              value: context.l10n.taskBoardDetailSelectTask,
              enabled: !_isBusy,
              onPressed: _pickParentTask,
            ),
          ],
        ),
        const shad.Gap(10),
        _RelationshipSectionCard(
          title: context.l10n.taskBoardDetailChildTasks,
          icon: _taskRelationshipIcon(_TaskRelationshipKind.child),
          children: [
            if (_relationships.childTasks.isEmpty)
              Text(
                context.l10n.taskBoardDetailNone,
                style: shad.Theme.of(context).typography.small,
              ),
            ..._relationships.childTasks.map(
              (task) => Padding(
                padding: const EdgeInsets.only(top: 8),
                child: _RelationshipTaskTile(
                  task: task,
                  onRemove: _isBusy
                      ? null
                      : () => _removeChildRelationship(task),
                ),
              ),
            ),
            const shad.Gap(8),
            _SelectionFieldButton(
              label: context.l10n.taskBoardDetailAddChildTask,
              value: context.l10n.taskBoardDetailSelectTask,
              enabled: !_isBusy,
              onPressed: _pickChildTask,
            ),
          ],
        ),
        const shad.Gap(10),
        _RelationshipSectionCard(
          title: context.l10n.taskBoardDetailBlockedBy,
          icon: _taskRelationshipIcon(_TaskRelationshipKind.blockedBy),
          children: [
            if (_relationships.blockedBy.isEmpty)
              Text(
                context.l10n.taskBoardDetailNone,
                style: shad.Theme.of(context).typography.small,
              ),
            ..._relationships.blockedBy.map(
              (task) => Padding(
                padding: const EdgeInsets.only(top: 8),
                child: _RelationshipTaskTile(
                  task: task,
                  onRemove: _isBusy
                      ? null
                      : () => _removeBlockedByRelationship(task),
                ),
              ),
            ),
            const shad.Gap(8),
            _SelectionFieldButton(
              label: context.l10n.taskBoardDetailAddBlockedByTask,
              value: context.l10n.taskBoardDetailSelectTask,
              enabled: !_isBusy,
              onPressed: _pickBlockedByTask,
            ),
          ],
        ),
        const shad.Gap(10),
        _RelationshipSectionCard(
          title: context.l10n.taskBoardDetailBlocking,
          icon: _taskRelationshipIcon(_TaskRelationshipKind.blocking),
          children: [
            if (_relationships.blocking.isEmpty)
              Text(
                context.l10n.taskBoardDetailNone,
                style: shad.Theme.of(context).typography.small,
              ),
            ..._relationships.blocking.map(
              (task) => Padding(
                padding: const EdgeInsets.only(top: 8),
                child: _RelationshipTaskTile(
                  task: task,
                  onRemove: _isBusy
                      ? null
                      : () => _removeBlockingRelationship(task),
                ),
              ),
            ),
            const shad.Gap(8),
            _SelectionFieldButton(
              label: context.l10n.taskBoardDetailAddBlockingTask,
              value: context.l10n.taskBoardDetailSelectTask,
              enabled: !_isBusy,
              onPressed: _pickBlockingTask,
            ),
          ],
        ),
        const shad.Gap(10),
        _RelationshipSectionCard(
          title: context.l10n.taskBoardDetailRelatedTasks,
          icon: _taskRelationshipIcon(_TaskRelationshipKind.related),
          children: [
            if (_relationships.relatedTasks.isEmpty)
              Text(
                context.l10n.taskBoardDetailNone,
                style: shad.Theme.of(context).typography.small,
              ),
            ..._relationships.relatedTasks.map(
              (task) => Padding(
                padding: const EdgeInsets.only(top: 8),
                child: _RelationshipTaskTile(
                  task: task,
                  onRemove: _isBusy
                      ? null
                      : () => _removeRelatedRelationship(task),
                ),
              ),
            ),
            const shad.Gap(8),
            _SelectionFieldButton(
              label: context.l10n.taskBoardDetailAddRelatedTask,
              value: context.l10n.taskBoardDetailSelectTask,
              enabled: !_isBusy,
              onPressed: _pickRelatedTask,
            ),
          ],
        ),
      ],
    );
  }

  Future<void> _saveTask() async {
    await _saveTaskEditorTask(this);
  }

  Future<void> _moveTask() async {
    await _moveTaskEditorTask(this);
  }

  Future<void> _deleteTask() async {
    await _deleteTaskEditorTask(this);
  }

  Future<void> _pickList() async {
    await _pickTaskList(this);
  }

  Future<void> _pickDate({required bool isStart}) async {
    await _pickTaskDate(this, isStart: isStart);
  }

  Future<void> _pickParentTask() async {
    await _pickTaskRelationship(this, role: _TaskRelationshipRole.parentTask);
  }

  Future<void> _pickChildTask() async {
    await _pickTaskRelationship(this, role: _TaskRelationshipRole.childTask);
  }

  Future<void> _pickBlockedByTask() async {
    await _pickTaskRelationship(this, role: _TaskRelationshipRole.blockedBy);
  }

  Future<void> _pickBlockingTask() async {
    await _pickTaskRelationship(this, role: _TaskRelationshipRole.blocking);
  }

  Future<void> _pickRelatedTask() async {
    await _pickTaskRelationship(this, role: _TaskRelationshipRole.relatedTask);
  }

  Future<void> _removeParentRelationship(RelatedTaskInfo task) async {
    await _removeTaskRelationship(
      this,
      targetTask: task,
      role: _TaskRelationshipRole.parentTask,
    );
  }

  Future<void> _removeChildRelationship(RelatedTaskInfo task) async {
    await _removeTaskRelationship(
      this,
      targetTask: task,
      role: _TaskRelationshipRole.childTask,
    );
  }

  Future<void> _removeBlockedByRelationship(RelatedTaskInfo task) async {
    await _removeTaskRelationship(
      this,
      targetTask: task,
      role: _TaskRelationshipRole.blockedBy,
    );
  }

  Future<void> _removeBlockingRelationship(RelatedTaskInfo task) async {
    await _removeTaskRelationship(
      this,
      targetTask: task,
      role: _TaskRelationshipRole.blocking,
    );
  }

  Future<void> _removeRelatedRelationship(RelatedTaskInfo task) async {
    await _removeTaskRelationship(
      this,
      targetTask: task,
      role: _TaskRelationshipRole.relatedTask,
    );
  }

  Future<void> _closeEditor() async {
    await _closeTaskEditor(this);
  }

  Future<void> _openDescriptionEditor(BuildContext context) async {
    if (!_isTaskDescriptionEditingEnabled || _isBusy) {
      return;
    }

    final l10n = context.l10n;
    await showAdaptiveSheet<void>(
      context: context,
      useRootNavigator: true,
      builder: (sheetContext) {
        return _TaskDescriptionEditorOverlay(
          title: l10n.taskBoardDetailTaskDescriptionLabel,
          initialValue: _descriptionController.text,
          enabled: !_isBusy,
          hintText: l10n.taskBoardDetailTaskDescriptionHint,
          onChanged: (value) {
            if (_descriptionController.text == value) {
              return;
            }
            _descriptionController.text = value;
          },
          onRequestImageUpload: _isBusy
              ? null
              : () => _uploadDescriptionInlineImage(sheetContext),
        );
      },
    );

    if (mounted) {
      setState(() {});
    }
  }

  Future<String?> _uploadDescriptionInlineImage(BuildContext context) async {
    final providerContext = this.context;
    final l10n = context.l10n;
    final taskCubit = providerContext.read<TaskBoardDetailCubit>();
    final wsId = taskCubit.state.workspaceId;
    final toastContext = Navigator.of(context, rootNavigator: true).context;

    final source = await showImageSourcePickerDialog(
      context: context,
      title: l10n.taskBoardDetailTaskDescriptionImageSourceTitle,
      cameraLabel: l10n.taskBoardDetailTaskDescriptionImageSourceCamera,
      galleryLabel: l10n.taskBoardDetailTaskDescriptionImageSourceGallery,
    );
    if (source == null || !mounted) {
      return null;
    }

    final picker = ImagePicker();
    final picked = await picker.pickImage(source: source, imageQuality: 92);
    if (picked == null || !mounted) {
      return null;
    }

    final fallbackErrorMessage = l10n.commonSomethingWentWrong;

    try {
      if (wsId == null || wsId.trim().isEmpty) {
        throw const ApiException(
          message: 'Workspace not selected',
          statusCode: 0,
        );
      }

      final uploadedUrl = await taskCubit.uploadTaskDescriptionImage(
        wsId: wsId,
        localFilePath: picked.path,
        taskId: widget.task?.id,
      );
      return uploadedUrl;
    } on ApiException catch (error) {
      if (!mounted || !toastContext.mounted) {
        return null;
      }
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert.destructive(
          content: Text(
            error.message.trim().isEmpty ? fallbackErrorMessage : error.message,
          ),
        ),
      );
      return null;
    } on Object catch (error) {
      if (!mounted || !toastContext.mounted) {
        return null;
      }
      final message = error.toString().trim();
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert.destructive(
          content: Text(message.isEmpty ? fallbackErrorMessage : message),
        ),
      );
      return null;
    }
  }

  Future<void> _loadRelationshipsIfNeeded({bool force = false}) async {
    await _loadTaskRelationshipsIfNeeded(this, force: force);
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

  List<_FilterMenuOption> _taskEditorPriorityOptions(BuildContext context) {
    return _priorityOptions
        .map((priority) {
          final style = _taskPriorityStyle(context, priority);
          return _FilterMenuOption(
            id: priority,
            label: style.label,
            icon: style.icon,
            kind: _FilterMenuOptionKind.priority,
            foreground: style.foreground,
            background: style.background,
            border: style.border,
          );
        })
        .toList(growable: false);
  }

  List<_FilterMenuOption> _taskEditorEstimationOptions() {
    final options = _taskEstimationOptions(widget.board);
    return options
        .map(
          (value) => _FilterMenuOption(
            id: '$value',
            label: _taskEstimationPointLabel(
              points: value,
              board: widget.board,
            ),
          ),
        )
        .toList(growable: false);
  }

  List<_FilterMenuOption> _taskEditorAssigneeOptions() {
    return widget.members
        .map(
          (member) => _FilterMenuOption(
            id: member.id,
            label: member.label,
            avatarUrl: member.avatarUrl,
          ),
        )
        .toList(growable: false);
  }

  List<_FilterMenuOption> _taskEditorLabelOptions() {
    return widget.labels
        .map(
          (label) => _FilterMenuOption(
            id: label.id,
            label: label.name.trim().isEmpty ? label.id : label.name,
            kind: _FilterMenuOptionKind.label,
            color: parseTaskLabelColor(label.color),
          ),
        )
        .toList(growable: false);
  }

  List<_FilterMenuOption> _taskEditorProjectOptions() {
    return widget.projects
        .map(
          (project) => _FilterMenuOption(
            id: project.id,
            label: project.name.trim().isEmpty ? project.id : project.name,
          ),
        )
        .toList(growable: false);
  }
}

class _TaskDescriptionEditorOverlay extends StatelessWidget {
  const _TaskDescriptionEditorOverlay({
    required this.title,
    required this.initialValue,
    required this.enabled,
    required this.hintText,
    required this.onChanged,
    required this.onRequestImageUpload,
  });

  final String title;
  final String initialValue;
  final bool enabled;
  final String hintText;
  final ValueChanged<String> onChanged;
  final Future<String?> Function()? onRequestImageUpload;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final screenHeight = MediaQuery.of(context).size.height;
    final overlayHeight = context.isCompact
        ? screenHeight * 0.9
        : math.min(screenHeight * 0.85, 760).toDouble();

    return Container(
      height: overlayHeight,
      decoration: BoxDecoration(
        color: theme.colorScheme.background,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
      ),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: theme.typography.large,
                ),
              ),
              shad.IconButton.ghost(
                icon: const Icon(Icons.close),
                onPressed: () => Navigator.maybePop(context),
              ),
            ],
          ),
          const shad.Gap(10),
          Expanded(
            child: _TaskDescriptionRichEditor(
              initialValue: initialValue,
              enabled: enabled,
              hintText: hintText,
              onChanged: onChanged,
              onRequestImageUpload: onRequestImageUpload,
            ),
          ),
          const shad.Gap(12),
          shad.PrimaryButton(
            onPressed: () => Navigator.maybePop(context),
            child: Text(context.l10n.taskBoardDetailTaskDescriptionDone),
          ),
        ],
      ),
    );
  }
}
