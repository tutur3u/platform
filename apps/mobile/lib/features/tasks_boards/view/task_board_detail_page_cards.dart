part of 'task_board_detail_page.dart';

class _BoardListSection extends StatelessWidget {
  const _BoardListSection({
    required this.list,
    required this.tasks,
    required this.onTaskTap,
    required this.onTaskMove,
    required this.onCreateTask,
    this.onRenameList,
    this.isExpanded = true,
    this.collapsible = false,
    this.onToggleExpanded,
  });

  final TaskBoardList list;
  final List<TaskBoardTask> tasks;
  final bool isExpanded;
  final bool collapsible;
  final VoidCallback? onToggleExpanded;
  final void Function(TaskBoardTask task) onTaskTap;
  final void Function(TaskBoardTask task) onTaskMove;
  final VoidCallback onCreateTask;
  final VoidCallback? onRenameList;

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
          InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: collapsible ? onToggleExpanded : null,
            child: Row(
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
                const shad.Gap(8),
                if (collapsible)
                  Padding(
                    padding: const EdgeInsets.only(right: 4),
                    child: Icon(
                      isExpanded ? Icons.expand_less : Icons.expand_more,
                      size: 18,
                    ),
                  ),
                shad.IconButton.ghost(
                  icon: const Icon(Icons.add),
                  onPressed: onCreateTask,
                ),
                PopupMenuButton<_BoardListMenuAction>(
                  tooltip: context.l10n.taskBoardDetailListActions,
                  onSelected: (action) {
                    if (action == _BoardListMenuAction.rename) {
                      onRenameList?.call();
                    }
                  },
                  itemBuilder: (context) => [
                    PopupMenuItem<_BoardListMenuAction>(
                      value: _BoardListMenuAction.rename,
                      child: Text(context.l10n.taskBoardDetailRenameList),
                    ),
                  ],
                  child: const Padding(
                    padding: EdgeInsets.only(left: 6),
                    child: Icon(Icons.more_horiz, size: 18),
                  ),
                ),
              ],
            ),
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeInOut,
            child: !isExpanded
                ? const SizedBox.shrink()
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
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
                            child: _BoardTaskTile(
                              task: task,
                              onTap: () => onTaskTap(task),
                              onMove: () => onTaskMove(task),
                            ),
                          ),
                        ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _BoardTaskTile extends StatelessWidget {
  const _BoardTaskTile({
    required this.task,
    required this.onTap,
    required this.onMove,
  });

  final TaskBoardTask task;
  final VoidCallback onTap;
  final VoidCallback onMove;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final title = task.name?.trim().isNotEmpty == true
        ? task.name!.trim()
        : context.l10n.taskBoardDetailUntitledTask;
    final hasDescription = _taskHasDescription(task.description);
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
            Row(
              children: [
                Expanded(
                  child: Text(
                    title,
                    style: theme.typography.small.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                PopupMenuButton<_BoardTaskMenuAction>(
                  tooltip: context.l10n.taskBoardDetailTaskActions,
                  onSelected: (action) {
                    if (action == _BoardTaskMenuAction.move) {
                      onMove();
                    }
                  },
                  itemBuilder: (context) => [
                    PopupMenuItem<_BoardTaskMenuAction>(
                      value: _BoardTaskMenuAction.move,
                      child: Text(context.l10n.taskBoardDetailMoveTask),
                    ),
                  ],
                  child: const Padding(
                    padding: EdgeInsets.only(left: 8),
                    child: Icon(Icons.more_horiz, size: 18),
                  ),
                ),
              ],
            ),
            const shad.Gap(8),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                _TaskPriorityChip(priority: task.priority),
                if (hasDescription)
                  Tooltip(
                    message: context.l10n.taskBoardDetailTaskDescriptionLabel,
                    child: shad.OutlineBadge(
                      child: Icon(
                        Icons.notes_outlined,
                        size: 14,
                        color: theme.colorScheme.mutedForeground,
                      ),
                    ),
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
    required this.onTaskMove,
    required this.onCreateTask,
    this.onRenameList,
  });

  final TaskBoardList list;
  final List<TaskBoardTask> tasks;
  final void Function(TaskBoardTask task) onTaskTap;
  final void Function(TaskBoardTask task) onTaskMove;
  final VoidCallback onCreateTask;
  final VoidCallback? onRenameList;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: context.isCompact ? 280 : 320,
      child: _BoardListSection(
        list: list,
        tasks: tasks,
        onTaskTap: onTaskTap,
        onTaskMove: onTaskMove,
        onCreateTask: onCreateTask,
        onRenameList: onRenameList,
      ),
    );
  }
}

enum _BoardTaskMenuAction { move }

enum _BoardListMenuAction { rename }

class _TaskPriorityChip extends StatelessWidget {
  const _TaskPriorityChip({required this.priority});

  final String? priority;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final style = _taskPriorityStyle(context, priority);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: style.background,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: style.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(style.icon, size: 12, color: style.foreground),
          const shad.Gap(4),
          Text(
            style.label,
            style: theme.typography.small.copyWith(
              color: style.foreground,
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
