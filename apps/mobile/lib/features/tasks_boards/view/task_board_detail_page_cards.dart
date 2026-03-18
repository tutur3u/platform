part of 'task_board_detail_page.dart';

const kTaskBoardOverdueColor = Color(0xFFB42318);

class _BoardListSection extends StatelessWidget {
  const _BoardListSection({
    required this.board,
    required this.list,
    required this.tasks,
    required this.onTaskTap,
    required this.onTaskMove,
    required this.onCreateTask,
    this.onEditList,
    this.isExpanded = true,
    this.collapsible = false,
    this.onToggleExpanded,
  });

  final TaskBoardDetail board;
  final TaskBoardList list;
  final List<TaskBoardTask> tasks;
  final bool isExpanded;
  final bool collapsible;
  final VoidCallback? onToggleExpanded;
  final void Function(TaskBoardTask task) onTaskTap;
  final void Function(TaskBoardTask task) onTaskMove;
  final VoidCallback onCreateTask;
  final VoidCallback? onEditList;

  @override
  Widget build(BuildContext context) {
    final title = list.name?.trim().isNotEmpty == true
        ? list.name!.trim()
        : context.l10n.taskBoardDetailUntitledList;
    final theme = shad.Theme.of(context);
    final style = _taskBoardListVisualStyle(context, list);

    return shad.Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: collapsible ? onToggleExpanded : null,
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: style.surface,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: style.surfaceBorder),
              ),
              child: Row(
                children: [
                  Container(
                    width: 4,
                    height: 44,
                    decoration: BoxDecoration(
                      color: style.accent,
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                  const shad.Gap(10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(
                              style.statusIcon,
                              size: 14,
                              color: style.statusBadge.textColor,
                            ),
                            const shad.Gap(6),
                            Expanded(
                              child: Text(
                                title,
                                overflow: TextOverflow.ellipsis,
                                style: theme.typography.base.copyWith(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const shad.Gap(6),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: theme.colorScheme.background.withValues(
                                  alpha: 0.72,
                                ),
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(
                                  color: style.accent.withValues(alpha: 0.2),
                                ),
                              ),
                              child: Text(
                                context.l10n.taskBoardsTasksCount(tasks.length),
                                style: theme.typography.small.copyWith(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  if (collapsible)
                    Padding(
                      padding: const EdgeInsets.only(right: 4),
                      child: Icon(
                        isExpanded ? Icons.expand_less : Icons.expand_more,
                        size: 18,
                      ),
                    ),
                  shad.IconButton.ghost(
                    icon: Icon(Icons.add, color: style.accent),
                    onPressed: onCreateTask,
                  ),
                  if (onEditList != null)
                    PopupMenuButton<_BoardListMenuAction>(
                      tooltip: context.l10n.taskBoardDetailListActions,
                      onSelected: (action) {
                        if (action == _BoardListMenuAction.edit) {
                          onEditList?.call();
                        }
                      },
                      itemBuilder: (context) => [
                        PopupMenuItem<_BoardListMenuAction>(
                          value: _BoardListMenuAction.edit,
                          child: Text(context.l10n.taskBoardDetailEditList),
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
                              board: board,
                              listStyle: style,
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
    required this.board,
    required this.listStyle,
    required this.task,
    required this.onTap,
    required this.onMove,
  });

  final TaskBoardDetail board;
  final _TaskBoardListVisualStyle listStyle;
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
    final estimationLabel = _taskEstimationLabel(task, board);
    final dueLabel = _taskDueLabel(context, task);
    final startLabel = _taskStartLabel(context, task);
    final isOverdue = _taskIsOverdue(task);
    final relationshipIndicators = _taskRelationshipIndicators(task);

    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        decoration: BoxDecoration(
          color: listStyle.surface.withValues(alpha: 0.36),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: listStyle.accent.withValues(alpha: 0.24)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 28,
              height: 3,
              decoration: BoxDecoration(
                color: listStyle.accent.withValues(alpha: 0.9),
                borderRadius: BorderRadius.circular(999),
              ),
            ),
            const shad.Gap(8),
            // Top row: ticket ID | avatars + menu
            Row(
              children: [
                shad.OutlineBadge(child: Text(_taskReference(task, board))),
                const Spacer(),
                if (task.assignees.isNotEmpty) ...[
                  _AssigneeAvatarStack(assignees: task.assignees),
                  const shad.Gap(4),
                ],
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
                    padding: EdgeInsets.only(left: 4),
                    child: Icon(Icons.more_horiz, size: 18),
                  ),
                ),
              ],
            ),
            const shad.Gap(6),
            // Title
            Text(
              title,
              style: theme.typography.small.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            // Start date (future only)
            if (startLabel != null) ...[
              const shad.Gap(4),
              Row(
                children: [
                  Icon(
                    Icons.schedule_outlined,
                    size: 11,
                    color: theme.colorScheme.mutedForeground,
                  ),
                  const shad.Gap(3),
                  Text(
                    startLabel,
                    style: theme.typography.small.copyWith(
                      fontSize: 11,
                      color: theme.colorScheme.mutedForeground,
                    ),
                  ),
                ],
              ),
            ],
            // Due date
            if (dueLabel != null) ...[
              const shad.Gap(4),
              Row(
                children: [
                  Icon(
                    Icons.calendar_today_outlined,
                    size: 11,
                    color: isOverdue
                        ? kTaskBoardOverdueColor
                        : theme.colorScheme.mutedForeground,
                  ),
                  const shad.Gap(3),
                  Text(
                    dueLabel,
                    style: theme.typography.small.copyWith(
                      fontSize: 11,
                      color: isOverdue
                          ? kTaskBoardOverdueColor
                          : theme.colorScheme.mutedForeground,
                      fontWeight: isOverdue
                          ? FontWeight.w600
                          : FontWeight.normal,
                    ),
                  ),
                  if (isOverdue) ...[
                    const shad.Gap(4),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 5,
                        vertical: 1,
                      ),
                      decoration: BoxDecoration(
                        color: kTaskBoardOverdueColor,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        context.l10n.taskBoardDetailOverdue,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 9,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.2,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ],
            if (relationshipIndicators.isNotEmpty) ...[
              const shad.Gap(8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: relationshipIndicators
                    .map(
                      (indicator) => _TaskRelationshipIndicatorBadge(
                        indicator: indicator,
                      ),
                    )
                    .toList(growable: false),
              ),
            ],
            // Chips row: priority, estimation, project, labels
            if (_hasChips(
              estimationLabel,
              task,
              hasDescription: hasDescription,
            )) ...[
              const shad.Gap(8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  _TaskPriorityChip(priority: task.priority),
                  if (estimationLabel != null)
                    shad.OutlineBadge(
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(shad.LucideIcons.timer, size: 12),
                          const shad.Gap(3),
                          Text(
                            estimationLabel,
                            style: theme.typography.small.copyWith(
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ...task.projects
                      .take(1)
                      .map(
                        (project) =>
                            _ProjectBadge(label: _taskProjectLabel(project)),
                      ),
                  ...task.labels.take(2).map(_TaskLabelBadge.new),
                  if (task.labels.length > 2)
                    shad.OutlineBadge(
                      child: Text('+${task.labels.length - 2}'),
                    ),
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
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _KanbanColumn extends StatelessWidget {
  const _KanbanColumn({
    required this.board,
    required this.list,
    required this.tasks,
    required this.onTaskTap,
    required this.onTaskMove,
    required this.onCreateTask,
    this.onEditList,
  });

  final TaskBoardDetail board;
  final TaskBoardList list;
  final List<TaskBoardTask> tasks;
  final void Function(TaskBoardTask task) onTaskTap;
  final void Function(TaskBoardTask task) onTaskMove;
  final VoidCallback onCreateTask;
  final VoidCallback? onEditList;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: context.isCompact ? 280 : 320,
      child: _BoardListSection(
        board: board,
        list: list,
        tasks: tasks,
        onTaskTap: onTaskTap,
        onTaskMove: onTaskMove,
        onCreateTask: onCreateTask,
        onEditList: onEditList,
      ),
    );
  }
}

enum _BoardTaskMenuAction { move }

enum _BoardListMenuAction { edit }

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

class _TaskRelationshipIndicatorBadge extends StatelessWidget {
  const _TaskRelationshipIndicatorBadge({required this.indicator});

  final _TaskRelationshipIndicator indicator;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final color = _taskRelationshipColor(context, indicator.kind);
    final label = _taskRelationshipLabel(context, indicator.kind);

    return Tooltip(
      message: label,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: color.withValues(alpha: 0.28)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(_taskRelationshipIcon(indicator.kind), size: 12, color: color),
            const shad.Gap(4),
            Text(
              '${indicator.count}',
              style: theme.typography.small.copyWith(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TaskLabelBadge extends StatelessWidget {
  const _TaskLabelBadge(this.label);

  final TaskBoardTaskLabel label;

  @override
  Widget build(BuildContext context) {
    final color = parseTaskLabelColor(label.color);
    final resolvedLabel = _taskLabelName(label);
    if (resolvedLabel == null) {
      return const SizedBox.shrink();
    }

    if (color == null) {
      return shad.OutlineBadge(child: Text(resolvedLabel));
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withAlpha(28),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withAlpha(180)),
      ),
      child: Text(
        resolvedLabel,
        style: shad.Theme.of(context).typography.small.copyWith(
          fontSize: 11,
          color: color.withAlpha(240),
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _ProjectBadge extends StatelessWidget {
  const _ProjectBadge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return shad.OutlineBadge(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.workspaces_outline, size: 12),
          const shad.Gap(4),
          Text(label),
        ],
      ),
    );
  }
}

class _AssigneeAvatarStack extends StatelessWidget {
  const _AssigneeAvatarStack({required this.assignees});

  final List<TaskBoardTaskAssignee> assignees;

  @override
  Widget build(BuildContext context) {
    final visible = assignees.take(3).toList(growable: false);
    final overflowCount = assignees.length - visible.length;
    Widget child = SizedBox(
      height: 20,
      width: visible.length * 14 + 14,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          for (var i = 0; i < visible.length; i++)
            Positioned(
              left: i * 14,
              child: _AssigneeAvatar(assignee: visible[i]),
            ),
          if (overflowCount > 0)
            Positioned(
              left: visible.length * 14,
              child: _AssigneeOverflowAvatar(count: overflowCount),
            ),
        ],
      ),
    );

    if (overflowCount > 0) {
      child = Tooltip(
        message: context.l10n.taskBoardDetailTaskAssigneeCount(
          assignees.length,
        ),
        child: child,
      );
    }

    return child;
  }
}

class _AssigneeAvatar extends StatelessWidget {
  const _AssigneeAvatar({required this.assignee});

  final TaskBoardTaskAssignee assignee;

  @override
  Widget build(BuildContext context) {
    final name = (assignee.displayName?.trim().isNotEmpty == true)
        ? assignee.displayName!.trim()
        : assignee.id;
    final avatarUrl = assignee.avatarUrl?.trim() ?? '';
    final hasAvatar = avatarUrl.isNotEmpty;
    final fallback = Text(
      name.isNotEmpty ? name.substring(0, 1).toUpperCase() : '?',
      style: const TextStyle(fontSize: 9),
    );

    if (!hasAvatar) {
      return CircleAvatar(radius: 10, child: fallback);
    }

    return CircleAvatar(
      radius: 10,
      backgroundImage: NetworkImage(avatarUrl),
      onBackgroundImageError: (error, stackTrace) {},
      child: fallback,
    );
  }
}

class _AssigneeOverflowAvatar extends StatelessWidget {
  const _AssigneeOverflowAvatar({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return CircleAvatar(
      radius: 10,
      child: Text(
        '+$count',
        style: const TextStyle(fontSize: 8, fontWeight: FontWeight.w600),
      ),
    );
  }
}
