part of 'task_board_detail_page.dart';

class _TaskBoardTaskDetailSheet extends StatefulWidget {
  const _TaskBoardTaskDetailSheet({
    required this.task,
    required this.lists,
  });

  final TaskBoardTask task;
  final List<TaskBoardList> lists;

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
            _TaskBoardTaskDetailRow(
              label: context.l10n.taskBoardDetailTaskDescriptionLabel,
              value:
                  description ??
                  context.l10n.taskBoardDetailTaskDescriptionHint,
            ),
            const shad.Gap(12),
            _TaskBoardTaskDetailRow(
              label: context.l10n.taskBoardDetailPriority,
              value: _taskPriorityLabel(context, _task.priority),
            ),
            const shad.Gap(12),
            _TaskBoardTaskDetailRow(
              label: context.l10n.taskBoardDetailTaskStartDate,
              value: _task.startDate == null
                  ? context.l10n.taskBoardDetailNoDate
                  : DateFormat.yMd().format(_task.startDate!),
            ),
            const shad.Gap(12),
            _TaskBoardTaskDetailRow(
              label: context.l10n.taskBoardDetailTaskEndDate,
              value: _task.endDate == null
                  ? context.l10n.taskBoardDetailNoDate
                  : DateFormat.yMd().format(_task.endDate!),
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
}

class _TaskBoardTaskDetailRow extends StatelessWidget {
  const _TaskBoardTaskDetailRow({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

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
        Expanded(
          child: Text(
            value,
            style: theme.typography.base,
          ),
        ),
      ],
    );
  }
}
