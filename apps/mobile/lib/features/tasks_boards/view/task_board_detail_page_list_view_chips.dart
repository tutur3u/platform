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

    if (endDate != null) {
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
      chips
        ..add(const shad.Gap(6))
        ..add(_RelationshipChip(indicator: relationshipIndicators.first));
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

class _MetadataChip extends StatelessWidget {
  const _MetadataChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return shad.OutlineBadge(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: theme.colorScheme.mutedForeground),
          const shad.Gap(3),
          Text(
            label,
            style: theme.typography.small.copyWith(fontSize: 11),
          ),
        ],
      ),
    );
  }
}

class _ProjectChip extends StatelessWidget {
  const _ProjectChip({required this.project});

  final TaskBoardTaskProject project;

  @override
  Widget build(BuildContext context) {
    final label = _taskProjectLabel(project);
    final theme = shad.Theme.of(context);
    return shad.OutlineBadge(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.folder_outlined,
            size: 12,
            color: theme.colorScheme.mutedForeground,
          ),
          const shad.Gap(3),
          Text(
            label,
            style: theme.typography.small.copyWith(fontSize: 11),
          ),
        ],
      ),
    );
  }
}

class _RelationshipChip extends StatelessWidget {
  const _RelationshipChip({required this.indicator});

  final _TaskRelationshipIndicator indicator;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final (icon, color) = switch (indicator.kind) {
      _TaskRelationshipKind.parent => (
        Icons.account_tree_outlined,
        theme.colorScheme.mutedForeground,
      ),
      _TaskRelationshipKind.child => (
        Icons.account_tree,
        theme.colorScheme.mutedForeground,
      ),
      _TaskRelationshipKind.blockedBy => (Icons.block, const Color(0xFFDC2626)),
      _TaskRelationshipKind.blocking => (
        Icons.warning_amber_rounded,
        const Color(0xFFF59E0B),
      ),
      _TaskRelationshipKind.related => (
        Icons.link,
        theme.colorScheme.mutedForeground,
      ),
    };

    return shad.OutlineBadge(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          if (indicator.count > 1) ...[
            const shad.Gap(2),
            Text(
              '${indicator.count}',
              style: theme.typography.small.copyWith(
                fontSize: 10,
                color: color,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _CompactLabelChip extends StatelessWidget {
  const _CompactLabelChip({required this.label});

  final TaskBoardTaskLabel label;

  @override
  Widget build(BuildContext context) {
    final color = parseTaskLabelColor(label.color);
    final resolvedLabel = _taskLabelName(label);

    if (resolvedLabel == null) {
      return const SizedBox.shrink();
    }

    if (color == null) {
      return shad.OutlineBadge(
        child: Text(
          resolvedLabel,
          style: const TextStyle(fontSize: 10),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withAlpha(30),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withAlpha(180)),
      ),
      child: Text(
        resolvedLabel,
        style: shad.Theme.of(context).typography.small.copyWith(
          fontSize: 10,
          color: color.withAlpha(240),
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _PriorityBadge extends StatelessWidget {
  const _PriorityBadge({this.priority});

  final String? priority;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final style = _taskPriorityStyle(context, priority);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
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

class _DueDateDisplay extends StatelessWidget {
  const _DueDateDisplay({
    required this.endDate,
    required this.isOverdue,
    required this.isCompleted,
  });

  final DateTime? endDate;
  final bool isOverdue;
  final bool isCompleted;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    if (endDate == null) {
      return const SizedBox.shrink();
    }

    final color = isOverdue && !isCompleted
        ? const Color(0xFFDC2626)
        : theme.colorScheme.mutedForeground;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (isOverdue && !isCompleted) ...[
          Icon(
            Icons.error_outline,
            size: 12,
            color: color,
          ),
        ] else
          Icon(
            Icons.calendar_today_outlined,
            size: 12,
            color: color,
          ),
        const shad.Gap(4),
        Flexible(
          child: Text(
            _formatShortDate(context, endDate!),
            style: theme.typography.small.copyWith(
              fontSize: 11,
              color: color,
              fontWeight: isOverdue && !isCompleted
                  ? FontWeight.w600
                  : FontWeight.normal,
            ),
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }

  String _formatShortDate(BuildContext context, DateTime date) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final target = DateTime(date.year, date.month, date.day);
    final diff = target.difference(today).inDays;

    if (diff == 0) return context.l10n.taskBoardDetailToday;
    if (diff == 1) return context.l10n.taskBoardDetailTomorrow;
    if (diff == -1) return context.l10n.taskBoardDetailYesterday;

    return DateFormat('MMM d').format(date);
  }
}
