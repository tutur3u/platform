part of 'task_portfolio_dialogs.dart';

class TaskProjectSheet extends StatefulWidget {
  const TaskProjectSheet({
    super.key,
    this.project,
    this.workspaceUsers = const [],
    this.onSubmit,
  });

  final TaskProjectSummary? project;
  final List<WorkspaceUserOption> workspaceUsers;
  final Future<bool> Function(TaskProjectFormValue value)? onSubmit;

  @override
  State<TaskProjectSheet> createState() => _TaskProjectSheetState();
}

class _TaskProjectSheetState extends State<TaskProjectSheet> {
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
  bool _isSubmitting = false;

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
    final viewInsets = MediaQuery.of(context).viewInsets;

    return PopScope(
      canPop: !_isSubmitting,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: EdgeInsets.fromLTRB(16, 12, 16, 20 + viewInsets.bottom),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Sheet handle indicator
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.mutedForeground.withValues(
                      alpha: 0.3,
                    ),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const shad.Gap(16),
              // Title
              Text(
                isEditing
                    ? context.l10n.taskPortfolioEditProject
                    : context.l10n.taskPortfolioCreateProject,
                style: theme.typography.h4,
              ),
              const shad.Gap(24),
              // Scrollable content
              Flexible(
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Project name field
                      Text(
                        context.l10n.taskPortfolioProjectName,
                        style: theme.typography.small.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const shad.Gap(8),
                      shad.TextField(
                        controller: _nameController,
                        hintText: context.l10n.taskPortfolioProjectName,
                        autofocus: true,
                        enabled: !_isSubmitting,
                        onSubmitted: (_) => _submit(),
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
                      const shad.Gap(16),
                      // Description field
                      Text(
                        context.l10n.financeDescription,
                        style: theme.typography.small.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const shad.Gap(8),
                      shad.TextArea(
                        controller: _descriptionController,
                        hintText:
                            context.l10n.taskPortfolioProjectDescriptionHint,
                        initialHeight: 96,
                        minHeight: 96,
                        maxHeight: 160,
                        enabled: !_isSubmitting,
                      ),
                      if (isEditing) ...[
                        const shad.Gap(16),
                        // Status dropdown
                        Text(
                          context.l10n.taskPortfolioProjectStatus,
                          style: theme.typography.small.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const shad.Gap(8),
                        IgnorePointer(
                          ignoring: _isSubmitting,
                          child: _DropdownSelectField(
                            fieldKey: const Key('statusDropdown'),
                            value: _status,
                            values: _projectStatuses,
                            placeholder:
                                context.l10n.taskPortfolioProjectStatusActive,
                            title: context.l10n.taskPortfolioProjectStatus,
                            labelBuilder: (value) =>
                                _projectStatusLabel(context, value),
                            onChanged: (value) {
                              if (value != null) {
                                setState(() => _status = value);
                              }
                            },
                          ),
                        ),
                        const shad.Gap(16),
                        // Priority dropdown
                        Text(
                          context.l10n.taskPortfolioProjectPriority,
                          style: theme.typography.small.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const shad.Gap(8),
                        IgnorePointer(
                          ignoring: _isSubmitting,
                          child: _DropdownSelectField(
                            fieldKey: const Key('priorityDropdown'),
                            value: _priority,
                            values: _projectPriorities,
                            placeholder:
                                context.l10n.taskPortfolioProjectPriorityNormal,
                            title: context.l10n.taskPortfolioProjectPriority,
                            labelBuilder: (value) =>
                                _projectPriorityLabel(context, value),
                            onChanged: (value) {
                              if (value != null) {
                                setState(() => _priority = value);
                              }
                            },
                          ),
                        ),
                        const shad.Gap(16),
                        // Health status dropdown
                        Text(
                          context.l10n.taskPortfolioProjectHealth,
                          style: theme.typography.small.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const shad.Gap(8),
                        IgnorePointer(
                          ignoring: _isSubmitting,
                          child: _DropdownSelectField(
                            fieldKey: const Key('healthDropdown'),
                            value: _healthStatus,
                            values: _projectHealthStatuses,
                            placeholder:
                                context.l10n.taskPortfolioProjectNoHealth,
                            title: context.l10n.taskPortfolioProjectHealth,
                            labelBuilder: (value) =>
                                _projectHealthStatusLabel(context, value),
                            onChanged: (value) =>
                                setState(() => _healthStatus = value),
                          ),
                        ),
                        if (_healthStatus != null) ...[
                          const shad.Gap(6),
                          Align(
                            alignment: Alignment.centerRight,
                            child: shad.GhostButton(
                              onPressed: _isSubmitting
                                  ? null
                                  : () => setState(() => _healthStatus = null),
                              child: Text(
                                context.l10n.taskPortfolioClearSelection,
                              ),
                            ),
                          ),
                        ],
                        const shad.Gap(16),
                        // Lead dropdown
                        Text(
                          context.l10n.taskPortfolioProjectLead,
                          style: theme.typography.small.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const shad.Gap(8),
                        IgnorePointer(
                          ignoring: _isSubmitting,
                          child: _DropdownSelectField(
                            fieldKey: const Key('leadDropdown'),
                            value: _leadId,
                            values: widget.workspaceUsers
                                .map((user) => user.id)
                                .toList(growable: false),
                            placeholder:
                                context.l10n.taskPortfolioProjectNoLead,
                            title: context.l10n.taskPortfolioProjectLead,
                            onChanged: (value) =>
                                setState(() => _leadId = value),
                            labelBuilder: (value) {
                              final match = widget.workspaceUsers
                                  .where((user) => user.id == value)
                                  .firstOrNull;
                              return match?.label ??
                                  context.l10n.taskPortfolioProjectNoLead;
                            },
                          ),
                        ),
                        if (_leadId != null) ...[
                          const shad.Gap(6),
                          Align(
                            alignment: Alignment.centerRight,
                            child: shad.GhostButton(
                              onPressed: _isSubmitting
                                  ? null
                                  : () => setState(() => _leadId = null),
                              child: Text(
                                context.l10n.taskPortfolioClearSelection,
                              ),
                            ),
                          ),
                        ],
                        const shad.Gap(16),
                        // Date fields
                        _DateField(
                          label: context.l10n.taskPortfolioProjectStartDate,
                          value: _startDate,
                          onPick: () async {
                            final value = await _pickDate(
                              context,
                              initialDate: _startDate,
                            );
                            if (value != null) {
                              setState(() {
                                _startDate = value;
                                if (_endDate != null &&
                                    _endDate!.isBefore(value)) {
                                  _endDate = value;
                                }
                              });
                            }
                          },
                          onClear: _startDate == null
                              ? null
                              : () => setState(() => _startDate = null),
                        ),
                        const shad.Gap(16),
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
                        // Archived switch
                        shad.Card(
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        context
                                            .l10n
                                            .taskPortfolioProjectArchived,
                                        style: theme.typography.small.copyWith(
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      const shad.Gap(4),
                                      Text(
                                        context
                                            .l10n
                                            .taskPortfolioProjectArchivedHint,
                                        style: theme.typography.textMuted,
                                      ),
                                    ],
                                  ),
                                ),
                                const shad.Gap(12),
                                shad.Switch(
                                  value: _archived,
                                  onChanged: _isSubmitting
                                      ? null
                                      : (value) =>
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
              const shad.Gap(24),
              // Action buttons row
              Row(
                children: [
                  Expanded(
                    child: shad.OutlineButton(
                      onPressed: _isSubmitting
                          ? null
                          : () => Navigator.of(context).pop(),
                      child: Text(
                        context.l10n.commonCancel,
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
                  const shad.Gap(12),
                  Expanded(
                    child: shad.PrimaryButton(
                      onPressed: _isSubmitting ? null : _submit,
                      child: _isSubmitting
                          ? const SizedBox(
                              height: 16,
                              width: 16,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor: AlwaysStoppedAnimation<Color>(
                                  Colors.white,
                                ),
                              ),
                            )
                          : Text(
                              isEditing
                                  ? context.l10n.timerSave
                                  : context.l10n.taskPortfolioCreateProject,
                              textAlign: TextAlign.center,
                            ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _submit() async {
    if (_isSubmitting) return;

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

    final value = TaskProjectFormValue(
      name: trimmedName,
      description: _normalizeDescription(_descriptionController.text),
      status: widget.project == null ? null : _status,
      priority: widget.project == null ? null : _priority,
      healthStatus: widget.project == null ? null : _healthStatus,
      leadId: widget.project == null ? null : _leadId,
      startDate: widget.project == null ? null : _startDate,
      endDate: widget.project == null ? null : _endDate,
      archived: widget.project == null ? null : _archived,
    );

    final submit = widget.onSubmit;
    if (submit == null) {
      Navigator.of(context).pop(value);
      return;
    }

    setState(() => _isSubmitting = true);
    try {
      final success = await submit(value);
      if (!mounted) return;

      if (!success) {
        setState(() => _isSubmitting = false);
        return;
      }

      Navigator.of(context).pop();
    } catch (_) {
      if (!mounted) return;
      setState(() => _isSubmitting = false);
      rethrow;
    }
  }
}
