part of 'task_board_detail_page.dart';

class _KanbanDraggableCard extends StatelessWidget {
  const _KanbanDraggableCard({
    required this.task,
    required this.now,
    required this.list,
    required this.workspaceId,
    required this.selected,
    required this.bulkSelect,
    required this.canDrag,
    required this.onTap,
    required this.onMenu,
  });

  final TaskBoardTask task;
  final DateTime now;
  final TaskBoardList list;
  final String workspaceId;
  final bool selected;
  final bool bulkSelect;
  final bool canDrag;
  final VoidCallback onTap;
  final VoidCallback onMenu;

  @override
  Widget build(BuildContext context) {
    final title = _taskBoardTaskTitle(context, task);
    final card = _KanbanCard(
      task: task,
      now: now,
      list: list,
      title: title,
      selected: selected,
      workspaceId: workspaceId,
      bulkSelect: bulkSelect,
      onTap: onTap,
      onMenu: onMenu,
    );
    if (!canDrag) return card;
    final tokens = AppTokens.of(context);
    return LayoutBuilder(
      builder: (context, constraints) => LongPressDraggable<TaskBoardTask>(
        key: ValueKey('kanban-drag-${task.id}'),
        data: task,
        hapticFeedbackOnStart: false,
        dragAnchorStrategy: pointerDragAnchorStrategy,
        rootOverlay: true,
        maxSimultaneousDrags: 1,
        onDragStarted: () {
          unawaited(AppHaptics.pickup());
        },
        feedback: Transform.translate(
          offset: Offset(-constraints.maxWidth / 2, -30),
          child: Material(
            color: tokens.colorScheme.card,
            elevation: 4,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(tokens.shapes.card),
              side: BorderSide(color: tokens.colorScheme.primary),
            ),
            child: Container(
              constraints: BoxConstraints(maxWidth: constraints.maxWidth),
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Text(
                title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: tokens.typography.body.copyWith(
                  color: tokens.colorScheme.foreground,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ),
        childWhenDragging: Opacity(opacity: .35, child: card),
        child: card,
      ),
    );
  }
}

class _KanbanCard extends StatelessWidget {
  const _KanbanCard({
    required this.task,
    required this.now,
    required this.list,
    required this.title,
    required this.selected,
    required this.workspaceId,
    required this.bulkSelect,
    required this.onTap,
    required this.onMenu,
  });

  final TaskBoardTask task;
  final DateTime now;
  final TaskBoardList list;
  final String title;
  final bool selected;
  final String workspaceId;
  final bool bulkSelect;
  final VoidCallback onTap;
  final VoidCallback onMenu;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final l10n = context.l10n;
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(tokens.shapes.card),
      side: BorderSide(color: selected ? c.primary : c.border),
    );
    final priority = TaskPriorityLevel.tryParse(task.priority);
    final fleet = fleetMetaOrNull(task, listStatus: list.status);
    return PendingSyncFrame(
      workspaceId: workspaceId,
      feature: 'tasks',
      entityId: task.id,
      child: Material(
        shape: shape,
        color: c.card,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          customBorder: shape,
          onTap: onTap,
          onLongPress: bulkSelect ? onTap : null,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (task.description case final description?
                  when description.contains('"image'))
                _KanbanTaskCover(
                  description: description,
                  workspaceId: workspaceId,
                ),
              Padding(
                padding: const EdgeInsetsDirectional.fromSTEB(
                  AppSpacing.md,
                  AppSpacing.xs,
                  AppSpacing.sm,
                  AppSpacing.sm,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  spacing: AppSpacing.xs,
                  children: [
                    Row(
                      spacing: AppSpacing.xs,
                      children: [
                        if (bulkSelect)
                          Icon(
                            selected
                                ? LucideIcons.squareCheck
                                : LucideIcons.square,
                            size: 18,
                            color: selected ? c.primary : c.mutedForeground,
                          ),
                        if (priority != null) TaskPriorityMark(level: priority),
                        Expanded(
                          child: Text(
                            title,
                            maxLines: fleet == null ? 3 : 2,
                            overflow: TextOverflow.ellipsis,
                            style: tokens.typography.body.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        if (!bulkSelect)
                          AppIconButton(
                            key: ValueKey('kanban-task-menu-${task.id}'),
                            tooltip: l10n.taskBoardDetailTaskActions,
                            icon: const Icon(LucideIcons.ellipsis, size: 17),
                            onPressed: onMenu,
                          ),
                      ],
                    ),
                    if (task.endDate != null ||
                        task.labels.isNotEmpty ||
                        task.assignees.isNotEmpty)
                      Row(
                        spacing: AppSpacing.xs,
                        children: [
                          Expanded(
                            child: Wrap(
                              spacing: AppSpacing.xs,
                              runSpacing: AppSpacing.xs,
                              children: [
                                for (final label in task.labels.take(3))
                                  if (label.name case final name?
                                      when name.isNotEmpty)
                                    TaskMetadataChip(
                                      label: name,
                                      icon: LucideIcons.tag,
                                    ),
                                if (task.labels.length > 3)
                                  TaskMetadataChip(
                                    label: '+${task.labels.length - 3}',
                                  ),
                                if (task.endDate case final due?)
                                  TaskDueChip(
                                    due: due,
                                    now: now,
                                    zone: taskTimezone(context),
                                    completed: list.suppressesDeadlines,
                                  ),
                              ],
                            ),
                          ),
                          TaskAssigneeStack(assignees: task.assignees),
                        ],
                      ),
                    if (fleet != null) FleetTaskTileBlock(meta: fleet),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
