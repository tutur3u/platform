part of 'task_board_detail_page.dart';

class _TaskBoardAdvancedFilterSheet extends StatefulWidget {
  const _TaskBoardAdvancedFilterSheet({
    required this.initialFilters,
    required this.lists,
    required this.members,
    required this.labels,
    required this.projects,
    required this.onApply,
  });

  final TaskBoardDetailFilters initialFilters;
  final List<TaskBoardList> lists;
  final List<WorkspaceUserOption> members;
  final List<TaskLabel> labels;
  final List<TaskProjectSummary> projects;
  final void Function(TaskBoardDetailFilters filters) onApply;

  @override
  State<_TaskBoardAdvancedFilterSheet> createState() =>
      _TaskBoardAdvancedFilterSheetState();
}

class _TaskBoardAdvancedFilterSheetState
    extends State<_TaskBoardAdvancedFilterSheet> {
  static const List<String> _priorityOptions = [
    'critical',
    'high',
    'normal',
    'low',
  ];

  late Set<String> _listIds;
  late Set<String> _statuses;
  late Set<String> _priorities;
  late Set<String> _assigneeIds;
  late Set<String> _labelIds;
  late Set<String> _projectIds;

  @override
  void initState() {
    super.initState();
    _listIds = Set<String>.from(widget.initialFilters.listIds);
    _statuses = Set<String>.from(widget.initialFilters.statuses);
    _priorities = Set<String>.from(widget.initialFilters.priorities);
    _assigneeIds = Set<String>.from(widget.initialFilters.assigneeIds);
    _labelIds = Set<String>.from(widget.initialFilters.labelIds);
    _projectIds = Set<String>.from(widget.initialFilters.projectIds);
  }

  @override
  Widget build(BuildContext context) {
    final availableStatuses =
        widget.lists
            .map((list) => list.status?.trim().toLowerCase())
            .whereType<String>()
            .where((status) => status.isNotEmpty)
            .toSet()
            .toList(growable: false)
          ..sort();
    final listOptions = widget.lists
        .map(
          (list) => _FilterMenuOption(
            id: list.id,
            label: list.name?.trim().isNotEmpty == true
                ? list.name!.trim()
                : context.l10n.taskBoardDetailUntitledList,
          ),
        )
        .toList(growable: false);
    final statusOptions = availableStatuses
        .map(
          (status) => _FilterMenuOption(
            id: status,
            label: _taskBoardListStatusLabel(context, status),
            kind: _FilterMenuOptionKind.status,
            foreground: _taskBoardListStatusBadgeColors(
              context,
              status,
            ).textColor,
            background: _taskBoardListStatusBadgeColors(
              context,
              status,
            ).backgroundColor,
            border: _taskBoardListStatusBadgeColors(
              context,
              status,
            ).borderColor,
          ),
        )
        .toList(growable: false);
    final priorityOptions = _priorityOptions
        .map(
          (priority) => _FilterMenuOption(
            id: priority,
            label: _taskPriorityStyle(context, priority).label,
            icon: _taskPriorityStyle(context, priority).icon,
            kind: _FilterMenuOptionKind.priority,
            foreground: _taskPriorityStyle(context, priority).foreground,
            background: _taskPriorityStyle(context, priority).background,
            border: _taskPriorityStyle(context, priority).border,
          ),
        )
        .toList(growable: false);
    final assigneeOptions = widget.members
        .map(
          (member) => _FilterMenuOption(
            id: member.id,
            label: member.label,
            avatarUrl: member.avatarUrl,
          ),
        )
        .toList(growable: false);
    final labelOptions = widget.labels
        .map(
          (label) => _FilterMenuOption(
            id: label.id,
            label: label.name.trim().isEmpty ? label.id : label.name,
            kind: _FilterMenuOptionKind.label,
            color: parseTaskLabelColor(label.color),
          ),
        )
        .toList(growable: false);
    final projectOptions = widget.projects
        .map(
          (project) => _FilterMenuOption(
            id: project.id,
            label: project.name.trim().isEmpty ? project.id : project.name,
          ),
        )
        .toList(growable: false);

    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 12, 16, 20 + bottomInset),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      context.l10n.taskBoardDetailFilters,
                      style: shad.Theme.of(context).typography.large.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  shad.IconButton.ghost(
                    icon: const Icon(Icons.close),
                    onPressed: () => unawaited(_close()),
                  ),
                ],
              ),
              const shad.Gap(12),
              _FilterDropdownSection(
                title: context.l10n.taskBoardDetailFilterLists,
                options: listOptions,
                selectedIds: _listIds,
                onApplySelection: (nextSelectedIds) => setState(() {
                  _listIds = nextSelectedIds;
                }),
              ),
              const shad.Gap(10),
              _FilterDropdownSection(
                title: context.l10n.taskBoardDetailFilterStatuses,
                options: statusOptions,
                selectedIds: _statuses,
                onApplySelection: (nextSelectedIds) => setState(() {
                  _statuses = nextSelectedIds;
                }),
              ),
              const shad.Gap(10),
              _FilterDropdownSection(
                title: context.l10n.taskBoardDetailPriority,
                options: priorityOptions,
                selectedIds: _priorities,
                onApplySelection: (nextSelectedIds) => setState(() {
                  _priorities = nextSelectedIds;
                }),
              ),
              const shad.Gap(10),
              _FilterDropdownSection(
                title: context.l10n.taskBoardDetailFilterAssignees,
                options: assigneeOptions,
                selectedIds: _assigneeIds,
                onApplySelection: (nextSelectedIds) => setState(() {
                  _assigneeIds = nextSelectedIds;
                }),
              ),
              const shad.Gap(10),
              _FilterDropdownSection(
                title: context.l10n.taskBoardDetailFilterLabels,
                options: labelOptions,
                selectedIds: _labelIds,
                onApplySelection: (nextSelectedIds) => setState(() {
                  _labelIds = nextSelectedIds;
                }),
              ),
              const shad.Gap(10),
              _FilterDropdownSection(
                title: context.l10n.taskBoardDetailFilterProjects,
                options: projectOptions,
                selectedIds: _projectIds,
                onApplySelection: (nextSelectedIds) => setState(() {
                  _projectIds = nextSelectedIds;
                }),
              ),
              const shad.Gap(16),
              Row(
                children: [
                  Expanded(
                    child: shad.OutlineButton(
                      onPressed: _clear,
                      child: Text(context.l10n.taskBoardDetailClearFilters),
                    ),
                  ),
                  const shad.Gap(10),
                  Expanded(
                    child: shad.PrimaryButton(
                      onPressed: _apply,
                      child: Text(context.l10n.taskBoardDetailApplyFilters),
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

  void _clear() {
    setState(() {
      _listIds.clear();
      _statuses.clear();
      _priorities.clear();
      _assigneeIds.clear();
      _labelIds.clear();
      _projectIds.clear();
    });
  }

  void _apply() {
    widget.onApply(
      TaskBoardDetailFilters(
        listIds: Set<String>.from(_listIds),
        statuses: Set<String>.from(_statuses),
        priorities: Set<String>.from(_priorities),
        assigneeIds: Set<String>.from(_assigneeIds),
        labelIds: Set<String>.from(_labelIds),
        projectIds: Set<String>.from(_projectIds),
      ),
    );

    unawaited(_close());
  }

  Future<void> _close() async {
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
}
