part of 'task_board_detail_page.dart';

class _TaskMetadataRow extends StatelessWidget {
  const _TaskMetadataRow({
    required this.task,
    required this.board,
    required this.dueDay,
    required this.today,
    required this.isOverdue,
  });

  final TaskBoardTask task;
  final TaskBoardDetail board;
  final DateTime? dueDay;
  final DateTime today;
  final bool isOverdue;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final labels = task.labels.map(_taskLabelName).whereType<String>().toList();
    final priority = TaskPriorityLevel.tryParse(task.priority);
    final estimate = _taskEstimationLabel(task, board);
    final children = <Widget>[
      if (dueDay case final day?)
        _DueDateDisplay(day: day, today: today, isOverdue: isOverdue),
      if (priority != null)
        AppBadge(
          variant: switch (priority) {
            TaskPriorityLevel.critical => AppBadgeVariant.destructive,
            TaskPriorityLevel.high => AppBadgeVariant.warning,
            _ => AppBadgeVariant.secondary,
          },
          leading: Icon(priority.icon),
          child: Text(priority.label(l10n)),
        ),
      for (final label in labels.take(3)) AppBadge.outline(child: Text(label)),
      if (labels.length > 3) AppBadge(child: Text('+${labels.length - 3}')),
      if (task.projects.isNotEmpty)
        AppBadge.outline(
          leading: const Icon(LucideIcons.folder),
          child: Text(_taskProjectLabel(task.projects.first)),
        ),
      if (estimate != null)
        AppBadge.outline(
          leading: const Icon(LucideIcons.timer),
          child: Text(estimate),
        ),
      if (_taskHasDescription(task.description))
        Tooltip(
          message: l10n.taskBoardDetailTaskDescriptionLabel,
          child: const AppBadge.outline(child: Icon(LucideIcons.alignLeft)),
        ),
      for (final indicator in _taskRelationshipIndicators(task))
        _RelationshipChip(indicator: indicator),
    ];

    if (children.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xs),
      child: Wrap(
        spacing: AppSpacing.xs,
        runSpacing: AppSpacing.xs,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: children,
      ),
    );
  }
}
