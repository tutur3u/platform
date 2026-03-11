part of 'task_board_detail_page.dart';

class _TaskBoardTaskDetailSheet extends StatefulWidget {
  const _TaskBoardTaskDetailSheet({
    required this.task,
    required this.lists,
    required this.labels,
    required this.members,
    required this.projects,
  });

  final TaskBoardTask task;
  final List<TaskBoardList> lists;
  final List<TaskLabel> labels;
  final List<WorkspaceUserOption> members;
  final List<TaskProjectSummary> projects;

  @override
  State<_TaskBoardTaskDetailSheet> createState() =>
      _TaskBoardTaskDetailSheetState();
}

class _TaskBoardTaskDetailSheetState extends State<_TaskBoardTaskDetailSheet> {
  late TaskBoardTask _task;

  @override
  void initState() {
    super.initState();
    _task = widget.task;
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final title = _task.name?.trim().isNotEmpty == true
        ? _task.name!.trim()
        : context.l10n.taskBoardDetailUntitledTask;
    final description = _taskDescriptionPreview(_task.description);
    final assignees = _task.assignees
        .where(
          (assignee) =>
              (assignee.displayName?.trim().isNotEmpty ?? false) ||
              assignee.id.trim().isNotEmpty,
        )
        .toList(growable: false);
    final labels = _task.labels
        .map((label) => (label.name ?? label.id).trim())
        .where((label) => label.isNotEmpty)
        .toList(growable: false);
    final projects = _task.projects
        .map((project) => (project.name ?? project.id).trim())
        .where((project) => project.isNotEmpty)
        .toList(growable: false);

    return SafeArea(
      top: false,
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          16,
          12,
          16,
          24 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    title,
                    style: theme.typography.large.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                shad.GhostButton(
                  onPressed: _openTaskEditor,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.edit, size: 14),
                      const shad.Gap(4),
                      Text(context.l10n.taskBoardDetailEditTask),
                    ],
                  ),
                ),
              ],
            ),
            const shad.Gap(16),
            if (description != null) ...[
              _TaskBoardTaskDetailRow(
                label: context.l10n.taskBoardDetailTaskDescriptionLabel,
                value: description,
              ),
              const shad.Gap(12),
            ],
            if (_task.priority?.trim().isNotEmpty == true) ...[
              _TaskBoardTaskDetailRow(
                label: context.l10n.taskBoardDetailPriority,
                value: _taskPriorityLabel(context, _task.priority),
              ),
              const shad.Gap(12),
            ],
            if (_task.startDate != null) ...[
              _TaskBoardTaskDetailRow(
                label: context.l10n.taskBoardDetailTaskStartDate,
                value: DateFormat.yMd().format(_task.startDate!),
              ),
              const shad.Gap(12),
            ],
            if (_task.endDate != null) ...[
              _TaskBoardTaskDetailRow(
                label: context.l10n.taskBoardDetailTaskEndDate,
                value: DateFormat.yMd().format(_task.endDate!),
              ),
              const shad.Gap(12),
            ],
            if (_task.estimationPoints != null) ...[
              _TaskBoardTaskDetailRow(
                label: context.l10n.taskBoardDetailTaskEstimation,
                value: _task.estimationPoints!.toString(),
              ),
              const shad.Gap(12),
            ],
            if (assignees.isNotEmpty) ...[
              _TaskBoardTaskDetailRow(
                label: context.l10n.taskBoardDetailTaskAssignees,
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: assignees
                      .map(
                        (assignee) => _AssigneeChip(
                          label: assignee.displayName?.trim().isNotEmpty == true
                              ? assignee.displayName!.trim()
                              : assignee.id,
                          avatarUrl: assignee.avatarUrl,
                        ),
                      )
                      .toList(growable: false),
                ),
              ),
              const shad.Gap(12),
            ],
            if (labels.isNotEmpty) ...[
              _TaskBoardTaskDetailRow(
                label: context.l10n.taskBoardDetailTaskLabels,
                value: labels.join(', '),
              ),
              const shad.Gap(12),
            ],
            if (projects.isNotEmpty) ...[
              _TaskBoardTaskDetailRow(
                label: context.l10n.taskBoardDetailTaskProjects,
                value: projects.join(', '),
              ),
              const shad.Gap(12),
            ],
            if (widget.lists.length > 1)
              shad.OutlineButton(
                onPressed: _moveTask,
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
        ),
      ),
    );
  }

  Future<void> _openTaskEditor() async {
    final cubit = context.read<TaskBoardDetailCubit>();
    final content = BlocProvider.value(
      value: cubit,
      child: _TaskBoardTaskEditorSheet(
        task: _task,
        lists: widget.lists,
        defaultListId: _task.listId,
        labels: widget.labels,
        members: widget.members,
        projects: widget.projects,
      ),
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

    if (!mounted) return;
    final refreshedTask = _findTaskInState(cubit.state, _task.id);
    if (refreshedTask != null) {
      setState(() => _task = refreshedTask);
    }
  }

  TaskBoardTask? _findTaskInState(TaskBoardDetailState state, String taskId) {
    final tasks = state.board?.tasks;
    if (tasks == null) return null;

    for (final task in tasks) {
      if (task.id == taskId) {
        return task;
      }
    }

    return null;
  }

  Future<void> _moveTask() async {
    final availableLists = widget.lists
        .where((list) => list.id != _task.listId)
        .toList(growable: false);
    if (availableLists.isEmpty) {
      return;
    }

    final targetListId = await shad.showDialog<String>(
      context: context,
      builder: (context) => _MoveTaskListDialog(lists: availableLists),
    );

    if (targetListId == null || !mounted) return;

    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final fallbackErrorMessage = context.l10n.commonSomethingWentWrong;
    try {
      await context.read<TaskBoardDetailCubit>().moveTask(
        taskId: _task.id,
        listId: targetListId,
      );

      if (!mounted || !toastContext.mounted) return;
      final refreshedTask = _findTaskInState(
        context.read<TaskBoardDetailCubit>().state,
        _task.id,
      );
      if (refreshedTask != null) {
        setState(() => _task = refreshedTask);
      }

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
    }
  }
}

class _TaskBoardTaskDetailRow extends StatelessWidget {
  const _TaskBoardTaskDetailRow({
    required this.label,
    this.value,
    this.child,
  });

  final String label;
  final String? value;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final resolvedChild =
        child ?? Text(value ?? '', style: theme.typography.base);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 116,
          child: Text(
            label,
            style: theme.typography.small.copyWith(
              color: theme.colorScheme.mutedForeground,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        const shad.Gap(10),
        Expanded(child: resolvedChild),
      ],
    );
  }
}

class _AssigneeChip extends StatelessWidget {
  const _AssigneeChip({
    required this.label,
    this.avatarUrl,
  });

  final String label;
  final String? avatarUrl;

  @override
  Widget build(BuildContext context) {
    final hasAvatar = avatarUrl?.trim().isNotEmpty == true;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        border: Border.all(color: shad.Theme.of(context).colorScheme.border),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircleAvatar(
            radius: 10,
            foregroundImage: hasAvatar ? NetworkImage(avatarUrl!.trim()) : null,
            child: hasAvatar
                ? null
                : Text(
                    label.isEmpty ? '?' : label.substring(0, 1).toUpperCase(),
                    style: const TextStyle(fontSize: 10),
                  ),
          ),
          const shad.Gap(6),
          Text(label, style: shad.Theme.of(context).typography.small),
        ],
      ),
    );
  }
}
