import 'package:flutter/material.dart' hide AlertDialog;
import 'package:intl/intl.dart';
import 'package:mobile/data/models/task_initiative_summary.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TaskProjectFormValue {
  const TaskProjectFormValue({
    required this.name,
    required this.description,
    this.status,
    this.priority,
    this.leadId,
    this.startDate,
    this.endDate,
    this.archived,
  });

  final String name;
  final String? description;
  final String? status;
  final String? priority;
  final String? leadId;
  final DateTime? startDate;
  final DateTime? endDate;
  final bool? archived;
}

class TaskInitiativeFormValue {
  const TaskInitiativeFormValue({
    required this.name,
    required this.description,
    required this.status,
  });

  final String name;
  final String? description;
  final String status;
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
  late String? _leadId;
  late DateTime? _startDate;
  late DateTime? _endDate;
  late bool _archived;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.project?.name ?? '');
    _descriptionController = TextEditingController(
      text: widget.project?.description ?? '',
    );
    _status = widget.project?.status ?? 'active';
    _priority = widget.project?.priority ?? 'normal';
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
                  _FieldLabel(context.l10n.taskPortfolioProjectLead),
                  const shad.Gap(4),
                  _DropdownSelectField(
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
    if (_nameController.text.trim().isEmpty) {
      setState(() {});
      return;
    }

    Navigator.of(context).pop(
      TaskProjectFormValue(
        name: _nameController.text.trim(),
        description: _normalizeDescription(_descriptionController.text),
        status: widget.project == null ? null : _status,
        priority: widget.project == null ? null : _priority,
        leadId: widget.project == null ? null : _leadId,
        startDate: widget.project == null ? null : _startDate,
        endDate: widget.project == null ? null : _endDate,
        archived: widget.project == null ? null : _archived,
      ),
    );
  }
}

class TaskInitiativeDialog extends StatefulWidget {
  const TaskInitiativeDialog({super.key, this.initiative});

  final TaskInitiativeSummary? initiative;

  @override
  State<TaskInitiativeDialog> createState() => _TaskInitiativeDialogState();
}

class _TaskInitiativeDialogState extends State<TaskInitiativeDialog> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameController;
  late final TextEditingController _descriptionController;
  late String _status;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(
      text: widget.initiative?.name ?? '',
    );
    _descriptionController = TextEditingController(
      text: widget.initiative?.description ?? '',
    );
    _status = widget.initiative?.status ?? 'active';
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isEditing = widget.initiative != null;

    return shad.AlertDialog(
      title: Text(
        isEditing
            ? context.l10n.taskPortfolioEditInitiative
            : context.l10n.taskPortfolioCreateInitiative,
      ),
      content: Form(
        key: _formKey,
        child: SizedBox(
          width: double.maxFinite,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(context.l10n.taskPortfolioInitiativeName),
              const shad.Gap(4),
              TextFormField(
                controller: _nameController,
                autofocus: true,
                decoration: const InputDecoration(border: OutlineInputBorder()),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return context.l10n.taskPortfolioInitiativeName;
                  }
                  return null;
                },
              ),
              const shad.Gap(12),
              Text(context.l10n.financeDescription),
              const shad.Gap(4),
              TextFormField(
                controller: _descriptionController,
                decoration: InputDecoration(
                  border: const OutlineInputBorder(),
                  hintText: context.l10n.taskPortfolioInitiativeDescriptionHint,
                ),
                minLines: 2,
                maxLines: 4,
              ),
              const shad.Gap(12),
              Text(context.l10n.taskPortfolioInitiativeStatus),
              const shad.Gap(4),
              DropdownButtonFormField<String>(
                initialValue: _status,
                decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                ),
                items: _initiativeStatuses
                    .map(
                      (value) => DropdownMenuItem<String>(
                        value: value,
                        child: Text(_initiativeStatusLabel(context, value)),
                      ),
                    )
                    .toList(growable: false),
                onChanged: (value) {
                  if (value != null) {
                    setState(() => _status = value);
                  }
                },
              ),
            ],
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
                : context.l10n.taskPortfolioCreateInitiative,
          ),
        ),
      ],
    );
  }

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    Navigator.of(context).pop(
      TaskInitiativeFormValue(
        name: _nameController.text.trim(),
        description: _normalizeDescription(_descriptionController.text),
        status: _status,
      ),
    );
  }
}

class ManageInitiativeProjectsDialog extends StatefulWidget {
  const ManageInitiativeProjectsDialog({
    required this.initiative,
    required this.availableProjects,
    required this.onLink,
    required this.onUnlink,
    required this.isMutating,
    super.key,
  });

  final TaskInitiativeSummary initiative;
  final List<TaskProjectSummary> availableProjects;
  final Future<void> Function(String projectId) onLink;
  final Future<void> Function(String projectId) onUnlink;
  final bool isMutating;

  @override
  State<ManageInitiativeProjectsDialog> createState() =>
      _ManageInitiativeProjectsDialogState();
}

class _ManageInitiativeProjectsDialogState
    extends State<ManageInitiativeProjectsDialog> {
  String? _selectedProjectId;

  @override
  Widget build(BuildContext context) {
    return shad.AlertDialog(
      title: Text(context.l10n.taskPortfolioManageProjects),
      content: SizedBox(
        width: double.maxFinite,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              context.l10n.taskPortfolioLinkedProjects,
              style: shad.Theme.of(context).typography.small.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const shad.Gap(8),
            if (widget.initiative.linkedProjects.isEmpty)
              Text(
                context.l10n.taskPortfolioNoLinkedProjects,
                style: shad.Theme.of(context).typography.textMuted,
              )
            else
              ...widget.initiative.linkedProjects.map(
                (project) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    children: [
                      Expanded(child: Text(project.name)),
                      shad.GhostButton(
                        density: shad.ButtonDensity.icon,
                        onPressed: widget.isMutating
                            ? null
                            : () => widget.onUnlink(project.id),
                        child: const Icon(Icons.link_off_outlined, size: 18),
                      ),
                    ],
                  ),
                ),
              ),
            const shad.Gap(16),
            Text(
              context.l10n.taskPortfolioLinkProject,
              style: shad.Theme.of(context).typography.small.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const shad.Gap(8),
            if (widget.availableProjects.isEmpty)
              Text(
                context.l10n.taskPortfolioAllProjectsLinked,
                style: shad.Theme.of(context).typography.textMuted,
              )
            else
              DropdownButtonFormField<String>(
                initialValue: _selectedProjectId,
                decoration: InputDecoration(
                  border: const OutlineInputBorder(),
                  hintText: context.l10n.taskPortfolioNoAvailableProjects,
                ),
                items: widget.availableProjects
                    .map(
                      (project) => DropdownMenuItem<String>(
                        value: project.id,
                        child: Text(project.name),
                      ),
                    )
                    .toList(growable: false),
                onChanged: widget.isMutating
                    ? null
                    : (value) => setState(() => _selectedProjectId = value),
              ),
          ],
        ),
      ),
      actions: [
        shad.OutlineButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(context.l10n.commonCancel),
        ),
        shad.PrimaryButton(
          onPressed: widget.isMutating || _selectedProjectId == null
              ? null
              : () => widget.onLink(_selectedProjectId!),
          child: Text(context.l10n.taskPortfolioLinkProject),
        ),
      ],
    );
  }
}

const List<String> _projectStatuses = [
  'active',
  'backlog',
  'planned',
  'in_progress',
  'in_review',
  'in_testing',
  'completed',
  'cancelled',
  'on_hold',
];

const List<String> _projectPriorities = ['critical', 'high', 'normal', 'low'];
const List<String> _initiativeStatuses = [
  'active',
  'completed',
  'on_hold',
  'cancelled',
];

String? _normalizeDescription(String value) {
  final trimmed = value.trim();
  return trimmed.isEmpty ? null : trimmed;
}

String _projectStatusLabel(BuildContext context, String value) {
  return switch (value) {
    'backlog' => context.l10n.taskPortfolioProjectStatusBacklog,
    'planned' => context.l10n.taskPortfolioProjectStatusPlanned,
    'in_progress' => context.l10n.taskPortfolioProjectStatusInProgress,
    'in_review' => context.l10n.taskPortfolioProjectStatusInReview,
    'in_testing' => context.l10n.taskPortfolioProjectStatusInTesting,
    'completed' => context.l10n.taskPortfolioProjectStatusCompleted,
    'cancelled' => context.l10n.taskPortfolioProjectStatusCancelled,
    'on_hold' => context.l10n.taskPortfolioProjectStatusOnHold,
    _ => context.l10n.taskPortfolioProjectStatusActive,
  };
}

String _projectPriorityLabel(BuildContext context, String value) {
  return switch (value) {
    'critical' => context.l10n.taskPortfolioProjectPriorityCritical,
    'high' => context.l10n.taskPortfolioProjectPriorityHigh,
    'low' => context.l10n.taskPortfolioProjectPriorityLow,
    _ => context.l10n.taskPortfolioProjectPriorityNormal,
  };
}

String _initiativeStatusLabel(BuildContext context, String value) {
  return switch (value) {
    'completed' => context.l10n.taskPortfolioInitiativeStatusCompleted,
    'on_hold' => context.l10n.taskPortfolioInitiativeStatusOnHold,
    'cancelled' => context.l10n.taskPortfolioInitiativeStatusCancelled,
    _ => context.l10n.taskPortfolioInitiativeStatusActive,
  };
}

Future<DateTime?> _pickDate(
  BuildContext context, {
  DateTime? initialDate,
  DateTime? firstDate,
}) {
  final now = DateTime.now();
  final effectiveInitial = initialDate ?? firstDate ?? now;
  final effectiveFirst = firstDate ?? DateTime(now.year - 10);
  final effectiveLast = DateTime(now.year + 10, 12, 31);

  return showDatePicker(
    context: context,
    initialDate: effectiveInitial.isBefore(effectiveFirst)
        ? effectiveFirst
        : effectiveInitial,
    firstDate: effectiveFirst,
    lastDate: effectiveLast,
  );
}

class _DateField extends StatelessWidget {
  const _DateField({
    required this.label,
    required this.value,
    required this.onPick,
    this.onClear,
  });

  final String label;
  final DateTime? value;
  final VoidCallback onPick;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    final formatted = value == null ? null : DateFormat.yMMMd().format(value!);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _FieldLabel(label),
        const shad.Gap(4),
        Row(
          children: [
            Expanded(
              child: shad.OutlineButton(
                onPressed: onPick,
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        formatted ?? context.l10n.taskPortfolioPickDate,
                        textAlign: TextAlign.left,
                      ),
                    ),
                    const Icon(Icons.calendar_today_outlined, size: 16),
                  ],
                ),
              ),
            ),
            if (onClear != null) ...[
              const shad.Gap(8),
              shad.GhostButton(
                onPressed: onClear,
                child: Text(context.l10n.taskPortfolioClearSelection),
              ),
            ],
          ],
        ),
      ],
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: shad.Theme.of(
        context,
      ).typography.small.copyWith(fontWeight: FontWeight.w500),
    );
  }
}

class _DropdownSelectField extends StatelessWidget {
  const _DropdownSelectField({
    required this.value,
    required this.values,
    required this.placeholder,
    required this.labelBuilder,
    required this.onChanged,
  });

  final String? value;
  final List<String> values;
  final String placeholder;
  final String Function(String value) labelBuilder;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    final hasValue = value != null && values.contains(value);

    return DropdownButtonFormField<String>(
      key: ValueKey('${placeholder}_${value ?? 'empty'}'),
      initialValue: hasValue ? value : null,
      isExpanded: true,
      decoration: InputDecoration(
        border: const OutlineInputBorder(),
        hintText: placeholder,
      ),
      items: values
          .map(
            (value) => DropdownMenuItem<String>(
              value: value,
              child: Text(labelBuilder(value)),
            ),
          )
          .toList(growable: false),
      onChanged: onChanged,
    );
  }
}
