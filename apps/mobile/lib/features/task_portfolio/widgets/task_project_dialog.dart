part of 'task_portfolio_dialogs.dart';

class TaskProjectFormValue {
  const TaskProjectFormValue({
    required this.name,
    required this.description,
    this.status,
    this.priority,
    this.healthStatus,
    this.leadId,
    this.startDate,
    this.endDate,
    this.archived,
  });

  final String name;
  final String? description;
  final String? status;
  final String? priority;
  final String? healthStatus;
  final String? leadId;
  final DateTime? startDate;
  final DateTime? endDate;
  final bool? archived;
}

class TaskProjectDialog extends StatefulWidget {
  const TaskProjectDialog({
    super.key,
    this.project,
    this.workspaceUsers = const [],
  });

  final TaskProjectSummary? project;
  final List<WorkspaceUserOption> workspaceUsers;

  @override
  State<TaskProjectDialog> createState() => _TaskProjectDialogState();
}

class _TaskProjectDialogState extends State<TaskProjectDialog> {
  late final TextEditingController _nameController;
  late final TextEditingController _descriptionController;
  late String _status;
  late String _priority;
  late String? _healthStatus;
  late String? _leadId;
  late DateTime? _startDate;
  late DateTime? _endDate;
  late bool _archived;
  String? _nameError;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.project?.name ?? '');
    _descriptionController = TextEditingController(
      text: widget.project?.description ?? '',
    );
    _status = widget.project?.status ?? 'active';
    _priority = widget.project?.priority ?? 'normal';
    _healthStatus = widget.project?.healthStatus;
    _leadId = widget.project?.leadId;
    if (_leadId != null &&
        !widget.workspaceUsers.any((user) => user.id == _leadId)) {
      _leadId = null;
    }
    _startDate = widget.project?.startDate;
    _endDate = widget.project?.endDate;
    _archived = widget.project?.archived ?? false;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isEditing = widget.project != null;
    final theme = shad.Theme.of(context);

    return shad.AlertDialog(
      title: Text(
        isEditing
            ? context.l10n.taskPortfolioEditProject
            : context.l10n.taskPortfolioCreateProject,
      ),
      content: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.65,
        ),
        child: SizedBox(
          width: double.maxFinite,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _FieldLabel(context.l10n.taskPortfolioProjectName),
                const shad.Gap(4),
                shad.TextField(
                  controller: _nameController,
                  autofocus: true,
                  placeholder: Text(context.l10n.taskPortfolioProjectName),
                ),
                if (_nameError != null) ...[
                  const shad.Gap(4),
                  Text(
                    _nameError!,
                    style: theme.typography.small.copyWith(
                      color: theme.colorScheme.destructive,
                    ),
                  ),
                ],
                const shad.Gap(12),
                _FieldLabel(context.l10n.financeDescription),
                const shad.Gap(4),
                shad.TextArea(
                  controller: _descriptionController,
                  placeholder: Text(
                    context.l10n.taskPortfolioProjectDescriptionHint,
                  ),
                  initialHeight: 96,
                  minHeight: 96,
                  maxHeight: 160,
                ),
                if (isEditing) ...[
                  const shad.Gap(16),
                  _FieldLabel(context.l10n.taskPortfolioProjectStatus),
                  const shad.Gap(4),
                  _DropdownSelectField(
                    fieldKey: const Key('statusDropdown'),
                    value: _status,
                    values: _projectStatuses,
                    placeholder: context.l10n.taskPortfolioProjectStatusActive,
                    labelBuilder: (value) =>
                        _projectStatusLabel(context, value),
                    onChanged: (value) {
                      if (value != null) {
                        setState(() => _status = value);
                      }
                    },
                  ),
                  const shad.Gap(12),
                  _FieldLabel(context.l10n.taskPortfolioProjectPriority),
                  const shad.Gap(4),
                  _DropdownSelectField(
                    fieldKey: const Key('priorityDropdown'),
                    value: _priority,
                    values: _projectPriorities,
                    placeholder:
                        context.l10n.taskPortfolioProjectPriorityNormal,
                    labelBuilder: (value) =>
                        _projectPriorityLabel(context, value),
                    onChanged: (value) {
                      if (value != null) {
                        setState(() => _priority = value);
                      }
                    },
                  ),
                  const shad.Gap(12),
                  _FieldLabel(context.l10n.taskPortfolioProjectHealth),
                  const shad.Gap(4),
                  _DropdownSelectField(
                    fieldKey: const Key('healthDropdown'),
                    value: _healthStatus,
                    values: _projectHealthStatuses,
                    placeholder: context.l10n.taskPortfolioProjectNoHealth,
                    labelBuilder: (value) =>
                        _projectHealthStatusLabel(context, value),
                    onChanged: (value) => setState(() => _healthStatus = value),
                  ),
                  if (_healthStatus != null) ...[
                    const shad.Gap(6),
                    Align(
                      alignment: Alignment.centerRight,
                      child: shad.GhostButton(
                        onPressed: () => setState(() => _healthStatus = null),
                        child: Text(context.l10n.taskPortfolioClearSelection),
                      ),
                    ),
                  ],
                  const shad.Gap(12),
                  _FieldLabel(context.l10n.taskPortfolioProjectLead),
                  const shad.Gap(4),
                  _DropdownSelectField(
                    fieldKey: const Key('leadDropdown'),
                    value: _leadId,
                    values: widget.workspaceUsers
                        .map((user) => user.id)
                        .toList(growable: false),
                    placeholder: context.l10n.taskPortfolioProjectNoLead,
                    onChanged: (value) => setState(() => _leadId = value),
                    labelBuilder: (value) {
                      final match = widget.workspaceUsers
                          .where((user) => user.id == value)
                          .firstOrNull;
                      return match?.label ??
                          context.l10n.taskPortfolioProjectNoLead;
                    },
                  ),
                  if (_leadId != null) ...[
                    const shad.Gap(6),
                    Align(
                      alignment: Alignment.centerRight,
                      child: shad.GhostButton(
                        onPressed: () => setState(() => _leadId = null),
                        child: Text(context.l10n.taskPortfolioClearSelection),
                      ),
                    ),
                  ],
                  const shad.Gap(8),
                  _DateField(
                    label: context.l10n.taskPortfolioProjectStartDate,
                    value: _startDate,
                    onPick: () async {
                      final value = await _pickDate(
                        context,
                        initialDate: _startDate,
                      );
                      if (value != null) {
                        setState(() => _startDate = value);
                      }
                    },
                    onClear: _startDate == null
                        ? null
                        : () => setState(() => _startDate = null),
                  ),
                  const shad.Gap(12),
                  _DateField(
                    label: context.l10n.taskPortfolioProjectEndDate,
                    value: _endDate,
                    onPick: () async {
                      final value = await _pickDate(
                        context,
                        initialDate: _endDate ?? _startDate,
                        firstDate: _startDate,
                      );
                      if (value != null) {
                        setState(() => _endDate = value);
                      }
                    },
                    onClear: _endDate == null
                        ? null
                        : () => setState(() => _endDate = null),
                  ),
                  const shad.Gap(16),
                  shad.Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  context.l10n.taskPortfolioProjectArchived,
                                  style: theme.typography.small.copyWith(
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                const shad.Gap(4),
                                Text(
                                  context.l10n.taskPortfolioProjectArchivedHint,
                                  style: theme.typography.textMuted,
                                ),
                              ],
                            ),
                          ),
                          const shad.Gap(12),
                          shad.Switch(
                            value: _archived,
                            onChanged: (value) =>
                                setState(() => _archived = value),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
      actions: [
        shad.OutlineButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(context.l10n.commonCancel),
        ),
        shad.PrimaryButton(
          onPressed: _submit,
          child: Text(
            isEditing
                ? context.l10n.timerSave
                : context.l10n.taskPortfolioCreateProject,
          ),
        ),
      ],
    );
  }

  void _submit() {
    final trimmedName = _nameController.text.trim();
    if (trimmedName.isEmpty) {
      setState(() {
        _nameError = context.l10n.taskPortfolioProjectNameRequired;
      });
      return;
    }

    if (_nameError != null) {
      setState(() {
        _nameError = null;
      });
    }

    Navigator.of(context).pop(
      TaskProjectFormValue(
        name: trimmedName,
        description: _normalizeDescription(_descriptionController.text),
        status: widget.project == null ? null : _status,
        priority: widget.project == null ? null : _priority,
        healthStatus: widget.project == null ? null : _healthStatus,
        leadId: widget.project == null ? null : _leadId,
        startDate: widget.project == null ? null : _startDate,
        endDate: widget.project == null ? null : _endDate,
        archived: widget.project == null ? null : _archived,
      ),
    );
  }
}
