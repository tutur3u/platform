part of 'task_board_detail_page.dart';

class _TaskMetadataRow extends StatelessWidget {
  const _TaskMetadataRow({
    required this.task,
    required this.board,
    required this.isOverdue,
    required this.isCompleted,
  });

  final TaskBoardTask task;
  final TaskBoardDetail board;
  final bool isOverdue;
  final bool isCompleted;

  @override
  Widget build(BuildContext context) {
    final priority = task.priority;
    final endDate = task.endDate;
    final labels = task.labels;
    final estimationLabel = _taskEstimationLabel(task, board);
    final hasDescription = _taskHasDescription(task.description);
    final relationshipIndicators = _taskRelationshipIndicators(task);

    final metadataWidgets = <Widget>[];

    final chips = <Widget>[_PriorityBadge(priority: priority)];

    if (task.projects.isNotEmpty) {
      chips
        ..add(const shad.Gap(6))
        ..add(_ProjectChip(project: task.projects.first));
    }

    if (estimationLabel != null) {
      chips
        ..add(const shad.Gap(6))
        ..add(
          _MetadataChip(
            icon: Icons.timer_outlined,
            label: estimationLabel,
          ),
        );
    }

    if (labels.isNotEmpty) {
      chips.add(const shad.Gap(6));
      final visibleLabels = labels.take(3).toList();
      for (var i = 0; i < visibleLabels.length; i++) {
        chips.add(_CompactLabelChip(label: visibleLabels[i]));
        if (i < visibleLabels.length - 1 || labels.length > 3) {
          chips.add(const shad.Gap(4));
        }
      }
      if (labels.length > 3) {
        chips.add(
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: shad.Theme.of(
                context,
              ).colorScheme.muted.withValues(alpha: 0.3),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              '+${labels.length - 3}',
              style: shad.Theme.of(context).typography.small.copyWith(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                color: shad.Theme.of(context).colorScheme.mutedForeground,
              ),
            ),
          ),
        );
      }
    }

    if (hasDescription) {
      chips
        ..add(const shad.Gap(6))
        ..add(
          Tooltip(
            message: context.l10n.taskBoardDetailTaskDescriptionLabel,
            child: const Icon(
              Icons.notes_outlined,
              size: 14,
              color: Colors.grey,
            ),
          ),
        );
    }

    if (endDate != null && !isCompleted) {
      chips
        ..add(const shad.Gap(6))
        ..add(
          _DueDateDisplay(
            endDate: endDate,
            isOverdue: isOverdue,
            isCompleted: isCompleted,
          ),
        );
    }

    if (relationshipIndicators.isNotEmpty) {
      chips.add(const shad.Gap(6));
      for (var i = 0; i < relationshipIndicators.length; i++) {
        chips.add(_RelationshipChip(indicator: relationshipIndicators[i]));
        if (i < relationshipIndicators.length - 1) {
          chips.add(const shad.Gap(4));
        }
      }
    }

    metadataWidgets.addAll(chips);

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      physics: const BouncingScrollPhysics(),
      child: Row(
        children: metadataWidgets,
      ),
    );
  }
}
