part of 'task_board_detail_page.dart';

enum _BoardAction { renameBoard, refresh }

extension on _TaskBoardDetailPageViewState {
  void _handleBoardAction(BuildContext context, _BoardAction action) {
    switch (action) {
      case _BoardAction.renameBoard:
        unawaited(_openRenameBoardDialog(context));
        return;
      case _BoardAction.refresh:
        unawaited(context.read<TaskBoardDetailCubit>().reload());
        return;
    }
  }

  Future<void> _openRenameBoardDialog(BuildContext context) async {
    final board = context.read<TaskBoardDetailCubit>().state.board;
    if (board == null) return;

    final initialName = board.name?.trim() ?? '';
    final value = await _openTextInputDialog(
      context,
      title: context.l10n.taskBoardDetailRenameBoard,
      hintText: context.l10n.taskBoardDetailUntitledBoard,
      initialValue: initialName,
      confirmLabel: context.l10n.timerSave,
    );
    if (value == null || !context.mounted) return;

    await _runBoardAction(
      context,
      () => context.read<TaskBoardDetailCubit>().renameBoard(
        name: value,
        icon: board.icon,
      ),
      successMessage: context.l10n.taskBoardDetailBoardRenamed,
    );
  }

  Future<void> _openCreateListDialog(BuildContext context) async {
    final value = await _openTextInputDialog(
      context,
      title: context.l10n.taskBoardDetailCreateList,
      hintText: context.l10n.taskBoardDetailUntitledList,
      confirmLabel: context.l10n.taskBoardDetailCreateList,
    );
    if (value == null || !context.mounted) return;

    await _runBoardAction(
      context,
      () => context.read<TaskBoardDetailCubit>().createList(name: value),
      successMessage: context.l10n.taskBoardDetailListCreated,
    );
  }

  Future<void> _openRenameListDialog(
    BuildContext context,
    TaskBoardList list,
  ) async {
    final initialName = list.name?.trim() ?? '';
    final value = await _openTextInputDialog(
      context,
      title: context.l10n.taskBoardDetailRenameList,
      hintText: context.l10n.taskBoardDetailUntitledList,
      initialValue: initialName,
      confirmLabel: context.l10n.timerSave,
    );
    if (value == null || !context.mounted) return;

    await _runBoardAction(
      context,
      () => context.read<TaskBoardDetailCubit>().renameList(
        listId: list.id,
        name: value,
      ),
      successMessage: context.l10n.taskBoardDetailListRenamed,
    );
  }

  Future<void> _openAdvancedFilterSheet(
    BuildContext context,
    TaskBoardDetailState state,
  ) async {
    final board = state.board;
    if (board == null) return;

    final content = _TaskBoardAdvancedFilterSheet(
      initialFilters: state.filters,
      lists: _sortedLists(board.lists),
      members: board.members,
      labels: board.labels,
      projects: board.projects,
      onApply: (filters) {
        context.read<TaskBoardDetailCubit>().setFilters(filters);
      },
    );

    if (context.isCompact) {
      await shad.openDrawer<void>(
        context: context,
        position: shad.OverlayPosition.bottom,
        builder: (_) => content,
      );
    } else {
      await shad.showDialog<void>(
        context: context,
        builder: (_) => Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: content,
          ),
        ),
      );
    }
  }

  Future<String?> _openTextInputDialog(
    BuildContext context, {
    required String title,
    required String hintText,
    required String confirmLabel,
    String initialValue = '',
  }) async {
    return shad.showDialog<String>(
      context: context,
      builder: (_) => _TaskBoardTextInputDialog(
        title: title,
        hintText: hintText,
        confirmLabel: confirmLabel,
        initialValue: initialValue,
      ),
    );
  }

  Future<void> _runBoardAction(
    BuildContext context,
    Future<void> Function() action, {
    required String successMessage,
  }) async {
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final fallbackErrorMessage = context.l10n.commonSomethingWentWrong;

    try {
      await action();
      if (!context.mounted || !toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) =>
            shad.Alert(content: Text(successMessage)),
      );
    } on ApiException catch (error) {
      if (!context.mounted || !toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert.destructive(
          content: Text(
            error.message.trim().isEmpty ? fallbackErrorMessage : error.message,
          ),
        ),
      );
    } on Exception {
      if (!context.mounted || !toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) =>
            shad.Alert.destructive(content: Text(fallbackErrorMessage)),
      );
    }
  }
}

class _TaskBoardTextInputDialog extends StatefulWidget {
  const _TaskBoardTextInputDialog({
    required this.title,
    required this.hintText,
    required this.confirmLabel,
    this.initialValue = '',
  });

  final String title;
  final String hintText;
  final String confirmLabel;
  final String initialValue;

  @override
  State<_TaskBoardTextInputDialog> createState() =>
      _TaskBoardTextInputDialogState();
}

class _TaskBoardTextInputDialogState extends State<_TaskBoardTextInputDialog> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialValue);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return shad.AlertDialog(
      title: Text(widget.title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          shad.TextField(
            controller: _controller,
            hintText: widget.hintText,
            autofocus: true,
            onSubmitted: (_) => _submit(),
          ),
          const shad.Gap(12),
          shad.OutlineButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(context.l10n.commonCancel),
          ),
          const shad.Gap(8),
          shad.PrimaryButton(
            onPressed: _submit,
            child: Text(widget.confirmLabel),
          ),
        ],
      ),
    );
  }

  void _submit() {
    final value = _controller.text.trim();
    if (value.isEmpty) {
      final toastContext = Navigator.of(context, rootNavigator: true).context;
      if (!toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert.destructive(
          content: Text(context.l10n.taskBoardDetailNameRequired),
        ),
      );
      return;
    }

    Navigator.of(context).pop(value);
  }
}

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
              _FilterSection(
                title: context.l10n.taskBoardDetailFilterLists,
                children: widget.lists
                    .map(
                      (list) => _FilterToggleButton(
                        label: list.name?.trim().isNotEmpty == true
                            ? list.name!.trim()
                            : context.l10n.taskBoardDetailUntitledList,
                        selected: _listIds.contains(list.id),
                        onPressed: () => setState(() {
                          _toggleSetValue(_listIds, list.id);
                        }),
                      ),
                    )
                    .toList(growable: false),
              ),
              const shad.Gap(10),
              _FilterSection(
                title: context.l10n.taskBoardDetailFilterStatuses,
                children: availableStatuses
                    .map(
                      (status) => _FilterToggleButton(
                        label: _statusLabel(context, status),
                        selected: _statuses.contains(status),
                        onPressed: () => setState(() {
                          _toggleSetValue(_statuses, status);
                        }),
                      ),
                    )
                    .toList(growable: false),
              ),
              const shad.Gap(10),
              _FilterSection(
                title: context.l10n.taskBoardDetailPriority,
                children: _priorityOptions
                    .map(
                      (priority) => _PriorityFilterToggleChip(
                        priority: priority,
                        selected: _priorities.contains(priority),
                        onPressed: () => setState(() {
                          _toggleSetValue(_priorities, priority);
                        }),
                      ),
                    )
                    .toList(growable: false),
              ),
              const shad.Gap(10),
              _FilterSection(
                title: context.l10n.taskBoardDetailFilterAssignees,
                children: widget.members
                    .map(
                      (member) => _FilterToggleButton(
                        label: member.label,
                        selected: _assigneeIds.contains(member.id),
                        onPressed: () => setState(() {
                          _toggleSetValue(_assigneeIds, member.id);
                        }),
                      ),
                    )
                    .toList(growable: false),
              ),
              const shad.Gap(10),
              _FilterSection(
                title: context.l10n.taskBoardDetailFilterLabels,
                children: widget.labels
                    .map(
                      (label) => _FilterToggleButton(
                        label: label.name.trim().isEmpty
                            ? label.id
                            : label.name,
                        selected: _labelIds.contains(label.id),
                        onPressed: () => setState(() {
                          _toggleSetValue(_labelIds, label.id);
                        }),
                      ),
                    )
                    .toList(growable: false),
              ),
              const shad.Gap(10),
              _FilterSection(
                title: context.l10n.taskBoardDetailFilterProjects,
                children: widget.projects
                    .map(
                      (project) => _FilterToggleButton(
                        label: project.name.trim().isEmpty
                            ? project.id
                            : project.name,
                        selected: _projectIds.contains(project.id),
                        onPressed: () => setState(() {
                          _toggleSetValue(_projectIds, project.id);
                        }),
                      ),
                    )
                    .toList(growable: false),
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

  String _statusLabel(BuildContext context, String status) {
    return switch (status) {
      'not_started' => context.l10n.taskBoardDetailStatusNotStarted,
      'active' => context.l10n.taskBoardDetailStatusActive,
      'done' => context.l10n.taskBoardDetailStatusDone,
      'closed' => context.l10n.taskBoardDetailStatusClosed,
      _ => status,
    };
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
        listIds: _listIds,
        statuses: _statuses,
        priorities: _priorities,
        assigneeIds: _assigneeIds,
        labelIds: _labelIds,
        projectIds: _projectIds,
      ),
    );

    unawaited(
      _close(),
    );
  }

  void _toggleSetValue(Set<String> target, String value) {
    if (target.contains(value)) {
      target.remove(value);
    } else {
      target.add(value);
    }
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

class _FilterSection extends StatelessWidget {
  const _FilterSection({
    required this.title,
    required this.children,
  });

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: shad.Theme.of(
            context,
          ).typography.small.copyWith(fontWeight: FontWeight.w600),
        ),
        const shad.Gap(6),
        if (children.isEmpty)
          Text(
            context.l10n.taskBoardDetailNoFilterOptions,
            style: shad.Theme.of(context).typography.textMuted,
          )
        else
          Wrap(spacing: 8, runSpacing: 8, children: children),
      ],
    );
  }
}

class _FilterToggleButton extends StatelessWidget {
  const _FilterToggleButton({
    required this.label,
    required this.selected,
    required this.onPressed,
  });

  final String label;
  final bool selected;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    if (selected) {
      return shad.PrimaryButton(onPressed: onPressed, child: Text(label));
    }

    return shad.OutlineButton(onPressed: onPressed, child: Text(label));
  }
}

class _PriorityFilterToggleChip extends StatelessWidget {
  const _PriorityFilterToggleChip({
    required this.priority,
    required this.selected,
    required this.onPressed,
  });

  final String priority;
  final bool selected;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final style = _taskPriorityStyle(context, priority);
    final foreground = selected ? Colors.white : style.foreground;
    final background = selected ? style.foreground : style.background;
    final border = selected ? style.foreground : style.border;

    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: onPressed,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(style.icon, size: 12, color: foreground),
            const shad.Gap(4),
            Text(
              style.label,
              style: shad.Theme.of(context).typography.small.copyWith(
                color: foreground,
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
