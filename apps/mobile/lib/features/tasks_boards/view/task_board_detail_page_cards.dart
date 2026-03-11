part of 'task_board_detail_page.dart';

class _BoardListSection extends StatelessWidget {
  const _BoardListSection({
    required this.list,
    required this.tasks,
    required this.onTaskTap,
  });

  final TaskBoardList list;
  final List<TaskBoardTask> tasks;
  final void Function(TaskBoardTask task) onTaskTap;

  @override
  Widget build(BuildContext context) {
    final title = list.name?.trim().isNotEmpty == true
        ? list.name!.trim()
        : context.l10n.taskBoardDetailUntitledList;
    final theme = shad.Theme.of(context);

    return shad.Card(
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
              shad.OutlineBadge(
                child: Text(context.l10n.taskBoardsTasksCount(tasks.length)),
              ),
            ],
          ),
          const shad.Gap(10),
          if (tasks.isEmpty)
            Text(
              context.l10n.taskBoardDetailNoTasksInList,
              style: theme.typography.textMuted,
            )
          else
            ...tasks.map(
              (task) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _BoardTaskTile(task: task, onTap: () => onTaskTap(task)),
              ),
            ),
        ],
      ),
    );
  }
}

class _BoardTaskTile extends StatelessWidget {
  const _BoardTaskTile({required this.task, required this.onTap});

  final TaskBoardTask task;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final title = task.name?.trim().isNotEmpty == true
        ? task.name!.trim()
        : context.l10n.taskBoardDetailUntitledTask;
    final description = _taskDescriptionPreview(task.description);
    final datesLabel = _taskDatesLabel(task);
    final hasDates = datesLabel.isNotEmpty;

    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: theme.colorScheme.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: theme.typography.small.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            if (description case final descriptionText?) ...[
              const shad.Gap(6),
              Text(
                descriptionText,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: theme.typography.xSmall.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
              ),
            ],
            const shad.Gap(8),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                shad.OutlineBadge(
                  child: Text(_taskPriorityLabel(context, task.priority)),
                ),
                if (hasDates) shad.OutlineBadge(child: Text(datesLabel)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _KanbanColumn extends StatelessWidget {
  const _KanbanColumn({
    required this.list,
    required this.tasks,
    required this.onTaskTap,
  });

  final TaskBoardList list;
  final List<TaskBoardTask> tasks;
  final void Function(TaskBoardTask task) onTaskTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: context.isCompact ? 280 : 320,
      child: _BoardListSection(list: list, tasks: tasks, onTaskTap: onTaskTap),
    );
  }
}
