part of 'task_board_detail_page.dart';

const kTaskBoardOverdueColor = Color(0xFFB42318);

class _BoardListSection extends StatelessWidget {
  const _BoardListSection({
    required this.board,
    required this.list,
    required this.tasks,
    required this.isTasksLoaded,
    required this.onTaskTap,
    required this.onTaskMove,
    required this.onCreateTask,
    required this.isLoadingTasks,
    required this.hasMoreTasks,
    this.onLoadMoreTasks,
    this.onEditList,
    this.isExpanded = true,
    this.collapsible = false,
    this.onToggleExpanded,
  });

  final TaskBoardDetail board;
  final TaskBoardList list;
  final List<TaskBoardTask> tasks;
  final bool isTasksLoaded;
  final bool isExpanded;
  final bool collapsible;
  final VoidCallback? onToggleExpanded;
  final void Function(TaskBoardTask task) onTaskTap;
  final void Function(TaskBoardTask task) onTaskMove;
  final VoidCallback onCreateTask;
  final bool isLoadingTasks;
  final bool hasMoreTasks;
  final VoidCallback? onLoadMoreTasks;
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
                      if (tasks.isEmpty && (!isTasksLoaded || isLoadingTasks))
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          child: Container(
                            width: double.infinity,
                            constraints: const BoxConstraints(minHeight: 140),
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: theme.colorScheme.background.withValues(
                                alpha: 0.65,
                              ),
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(
                                color: style.surfaceBorder.withValues(
                                  alpha: 0.7,
                                ),
                              ),
                            ),
                            child: Center(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const SizedBox(
                                    width: 22,
                                    height: 22,
                                    child: shad.CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  ),
                                  const shad.Gap(10),
                                  Text(
                                    context.l10n.notificationsLoadingMore,
                                    textAlign: TextAlign.center,
                                    style: theme.typography.textMuted,
                                  ),
                                ],
                              ),
                            ),
                          ),
                        )
                      else if (tasks.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          child: Container(
                            width: double.infinity,
                            constraints: const BoxConstraints(minHeight: 140),
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: theme.colorScheme.background.withValues(
                                alpha: 0.65,
                              ),
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(
                                color: style.surfaceBorder.withValues(
                                  alpha: 0.7,
                                ),
                              ),
                            ),
                            child: Center(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    Icons.inbox_outlined,
                                    size: 28,
                                    color: style.accent,
                                  ),
                                  const shad.Gap(10),
                                  Text(
                                    isLoadingTasks
                                        ? context.l10n.notificationsLoadingMore
                                        : context
                                              .l10n
                                              .taskBoardDetailNoTasksInList,
                                    textAlign: TextAlign.center,
                                    style: theme.typography.textMuted,
                                  ),
                                  const shad.Gap(12),
                                  shad.PrimaryButton(
                                    leading: const Icon(Icons.add),
                                    size: shad.ButtonSize.small,
                                    onPressed: onCreateTask,
                                    child: Text(
                                      context.l10n.taskBoardDetailCreateTask,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
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
                      if (isExpanded && (isLoadingTasks || hasMoreTasks))
                        Padding(
                          padding: const EdgeInsets.only(top: 4, bottom: 8),
                          child: Align(
                            alignment: Alignment.centerLeft,
                            child: isLoadingTasks
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: shad.CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : shad.OutlineButton(
                                    onPressed: onLoadMoreTasks,
                                    child: Text(
                                      context.l10n.timerHistoryLoadMore,
                                    ),
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

    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        child: Stack(
          children: [
            Positioned.fill(
              child: Container(
                color: listStyle.accent.withValues(alpha: 0.07),
              ),
            ),
            Positioned(
              left: 0,
              top: 0,
              bottom: 0,
              child: Container(
                width: 4,
                color: listStyle.accent.withValues(alpha: 0.7),
              ),
            ),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(16, 10, 12, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Top row: [badge + title | assignees + menu]
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            shad.OutlineBadge(
                              child: Text(_taskReference(task, board)),
                            ),
                            const shad.Gap(4),
                            Text(
                              title,
                              style: theme.typography.small.copyWith(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const shad.Gap(8),
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
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
                                child: Text(
                                  context.l10n.taskBoardDetailMoveTask,
                                ),
                              ),
                            ],
                            child: const Padding(
                              padding: EdgeInsets.only(left: 4),
                              child: Icon(Icons.more_horiz, size: 18),
                            ),
                          ),
                        ],
                      ),
                    ],
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
                              (project) => _ProjectBadge(
                                label: _taskProjectLabel(project),
                              ),
                            ),
                        ...task.labels.take(2).map(_TaskLabelBadge.new),
                        if (task.labels.length > 2)
                          shad.OutlineBadge(
                            child: Text('+${task.labels.length - 2}'),
                          ),
                        if (hasDescription)
                          Tooltip(
                            message: context
                                .l10n
                                .taskBoardDetailTaskDescriptionLabel,
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
    required this.isTasksLoaded,
    required this.height,
    required this.isLoadingTasks,
    required this.hasMoreTasks,
    required this.onTaskTap,
    required this.onTaskMove,
    required this.onCreateTask,
    this.onLoadMoreTasks,
    this.onEditList,
  });

  final TaskBoardDetail board;
  final TaskBoardList list;
  final List<TaskBoardTask> tasks;
  final bool isTasksLoaded;
  final double height;
  final bool isLoadingTasks;
  final bool hasMoreTasks;
  final VoidCallback? onLoadMoreTasks;
  final void Function(TaskBoardTask task) onTaskTap;
  final void Function(TaskBoardTask task) onTaskMove;
  final VoidCallback onCreateTask;
  final VoidCallback? onEditList;

  @override
  Widget build(BuildContext context) {
    final title = list.name?.trim().isNotEmpty == true
        ? list.name!.trim()
        : context.l10n.taskBoardDetailUntitledList;
    final style = _taskBoardListVisualStyle(context, list);
    final theme = shad.Theme.of(context);

    return SizedBox(
      width: context.isCompact ? 264 : 300,
      height: height,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: shad.Card(
          padding: EdgeInsets.zero,
          child: ColoredBox(
            color: style.accent.withValues(alpha: 0.05),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        decoration: BoxDecoration(
                          border: Border(
                            bottom: BorderSide(color: style.surfaceBorder),
                          ),
                        ),
                        padding: const EdgeInsets.fromLTRB(10, 8, 6, 8),
                        child: Row(
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
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: theme.typography.small.copyWith(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            const shad.Gap(4),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 7,
                                vertical: 3,
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
                            shad.IconButton.ghost(
                              icon: Icon(Icons.add, color: style.accent),
                              onPressed: onCreateTask,
                            ),
                            if (onEditList != null)
                              PopupMenuButton<_BoardListMenuAction>(
                                tooltip:
                                    context.l10n.taskBoardDetailListActions,
                                onSelected: (action) {
                                  if (action == _BoardListMenuAction.edit) {
                                    onEditList?.call();
                                  }
                                },
                                itemBuilder: (context) => [
                                  PopupMenuItem<_BoardListMenuAction>(
                                    value: _BoardListMenuAction.edit,
                                    child: Text(
                                      context.l10n.taskBoardDetailEditList,
                                    ),
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
                      Expanded(
                        child:
                            tasks.isEmpty && (!isTasksLoaded || isLoadingTasks)
                            ? Padding(
                                padding: const EdgeInsets.all(10),
                                child: Container(
                                  width: double.infinity,
                                  constraints: const BoxConstraints(
                                    minHeight: 170,
                                  ),
                                  padding: const EdgeInsets.all(16),
                                  decoration: BoxDecoration(
                                    color: theme.colorScheme.background
                                        .withValues(alpha: 0.65),
                                    borderRadius: BorderRadius.circular(14),
                                    border: Border.all(
                                      color: style.surfaceBorder.withValues(
                                        alpha: 0.7,
                                      ),
                                    ),
                                  ),
                                  child: Center(
                                    child: Column(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        const SizedBox(
                                          width: 22,
                                          height: 22,
                                          child: shad.CircularProgressIndicator(
                                            strokeWidth: 2,
                                          ),
                                        ),
                                        const shad.Gap(10),
                                        Text(
                                          context.l10n.notificationsLoadingMore,
                                          textAlign: TextAlign.center,
                                          style: theme.typography.textMuted,
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              )
                            : tasks.isEmpty && !isLoadingTasks
                            ? Padding(
                                padding: const EdgeInsets.all(10),
                                child: Container(
                                  width: double.infinity,
                                  constraints: const BoxConstraints(
                                    minHeight: 170,
                                  ),
                                  padding: const EdgeInsets.all(16),
                                  child: Center(
                                    child: Column(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Icon(
                                          Icons.inbox_outlined,
                                          size: 28,
                                          color: style.accent,
                                        ),
                                        const shad.Gap(10),
                                        Text(
                                          context
                                              .l10n
                                              .taskBoardDetailNoTasksInList,
                                          textAlign: TextAlign.center,
                                          style: theme.typography.textMuted,
                                        ),
                                        const shad.Gap(12),
                                        shad.PrimaryButton(
                                          leading: const Icon(Icons.add),
                                          size: shad.ButtonSize.small,
                                          onPressed: onCreateTask,
                                          child: Text(
                                            context
                                                .l10n
                                                .taskBoardDetailCreateTask,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              )
                            : ListView.separated(
                                primary: false,
                                physics: const AlwaysScrollableScrollPhysics(),
                                padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
                                itemCount:
                                    tasks.length +
                                    ((isLoadingTasks || hasMoreTasks) ? 1 : 0),
                                separatorBuilder: (_, _) => const shad.Gap(6),
                                itemBuilder: (context, index) {
                                  if (index >= tasks.length) {
                                    if (isLoadingTasks) {
                                      return const Center(
                                        child: SizedBox(
                                          width: 16,
                                          height: 16,
                                          child: shad.CircularProgressIndicator(
                                            strokeWidth: 2,
                                          ),
                                        ),
                                      );
                                    }
                                    return Center(
                                      child: shad.OutlineButton(
                                        onPressed: onLoadMoreTasks,
                                        child: Text(
                                          context.l10n.timerHistoryLoadMore,
                                        ),
                                      ),
                                    );
                                  }
                                  final task = tasks[index];
                                  return _BoardTaskTile(
                                    board: board,
                                    listStyle: style,
                                    task: task,
                                    onTap: () => onTaskTap(task),
                                    onMove: () => onTaskMove(task),
                                  );
                                },
                              ),
                      ),
                      // Container(
                      //   decoration: BoxDecoration(
                      //     border: Border(
                      //       top: BorderSide(color: style.surfaceBorder),
                      //     ),
                      //   ),
                      //   padding: const EdgeInsets.all(8),
                      //   child: InkWell(
                      //     borderRadius: BorderRadius.circular(8),
                      //     onTap: onCreateTask,
                      //     child: Container(
                      //       width: double.infinity,
                      //       padding: const EdgeInsets.symmetric(
                      //         vertical: 7,
                      //         horizontal: 10,
                      //       ),
                      //       decoration: BoxDecoration(
                      //         borderRadius: BorderRadius.circular(8),
                      //         border: Border.all(color: style.surfaceBorder),
                      //       ),
                      //       child: Row(
                      //         mainAxisSize: MainAxisSize.min,
                      //         children: [
                      //           Icon(
                      //             Icons.add,
                      //             size: 14,
                      //             color: theme.colorScheme.mutedForeground,
                      //           ),
                      //           const shad.Gap(4),
                      //           Text(
                      //             context.l10n.taskBoardDetailCreateTask,
                      //             style: theme.typography.small.copyWith(
                      //               fontSize: 12,
                      //               color: theme.colorScheme.mutedForeground,
                      //             ),
                      //           ),
                      //         ],
                      //       ),
                      //     ),
                      //   ),
                      // ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
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
