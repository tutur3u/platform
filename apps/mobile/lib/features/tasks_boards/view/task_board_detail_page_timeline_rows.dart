part of 'task_board_detail_page.dart';

/// One row's slice of its day card. Consecutive slices read as one grouped
/// card, so a day's rows stay individually lazy.
class _TimelineCardSegment extends StatelessWidget {
  const _TimelineCardSegment({
    required this.first,
    required this.last,
    required this.child,
  });

  final bool first;
  final bool last;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final solid = MediaQuery.highContrastOf(context);
    final radius = Radius.circular(tokens.interface.radius(AppRadius.card));
    final border = BorderSide(
      color: c.border.withValues(alpha: solid ? 1 : 0.6),
    );
    final shape = BorderRadius.vertical(
      top: first ? radius : Radius.zero,
      bottom: last ? radius : Radius.zero,
    );
    return DecoratedBox(
      decoration: BoxDecoration(
        color: c.card.withValues(alpha: solid ? 1 : 0.72),
        borderRadius: shape,
        border: Border(
          left: border,
          right: border,
          top: first ? border : BorderSide.none,
          bottom: last ? border : BorderSide.none,
        ),
      ),
      child: ClipRRect(
        borderRadius: shape,
        child: Material(
          type: MaterialType.transparency,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (!first)
                Divider(
                  height: 1,
                  thickness: 0.5,
                  indent: AppLayout.rowDividerInset,
                  color: c.border.withValues(alpha: 0.6),
                ),
              child,
            ],
          ),
        ),
      ),
    );
  }
}

/// A task on the agenda: priority tile, name, and where it is in its span.
class _TimelineTaskRow extends StatelessWidget {
  const _TimelineTaskRow({
    required this.item,
    required this.today,
    required this.listName,
    required this.onTap,
  });

  final _TimelineTaskItem item;

  /// The agenda's today, in the user's timezone setting.
  final DateTime today;
  final String? listName;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final c = AppTokens.of(context).colorScheme;
    final task = item.task;
    final entry = item.entry;
    final priority = _taskPriorityStyle(context, task.priority);
    final title = task.name?.trim().isNotEmpty == true
        ? task.name!.trim()
        : l10n.taskBoardDetailUntitledTask;
    final date = DateFormat.MMMd(l10n.localeName);
    final span = entry == null
        ? null
        : switch (entry.placement) {
            TaskTimelinePlacement.overdue => l10n.taskBoardDetailDueAt(
              date.format(entry.end),
            ),
            TaskTimelinePlacement.ongoing => l10n.taskTimelineOngoing(
              taskTimelineDayOfSpan(entry, today),
              entry.spanDays,
              date.format(entry.end),
            ),
            TaskTimelinePlacement.open => l10n.taskTimelineStarted(
              date.format(entry.start),
            ),
            TaskTimelinePlacement.starts =>
              '${date.format(entry.start)} – ${date.format(entry.end)}',
            TaskTimelinePlacement.single => null,
          };
    final subtitle = [?span, ?listName].join(' · ');
    final overdue = entry?.placement == TaskTimelinePlacement.overdue;

    return AppGroupedRow(
      key: ValueKey('task-timeline-row-${task.id}'),
      leading: ExcludeSemantics(
        child: SizedBox.square(
          dimension: AppLayout.rowLeadingSize,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: priority.background,
              borderRadius: BorderRadius.circular(AppRadius.xs),
            ),
            child: Icon(priority.icon, size: 18, color: priority.foreground),
          ),
        ),
      ),
      semanticLabel: [
        title,
        priority.label,
        if (subtitle.isNotEmpty) subtitle,
      ].join(', '),
      title: Text(title, maxLines: 2, overflow: TextOverflow.ellipsis),
      subtitle: subtitle.isEmpty
          ? null
          : Text(
              subtitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: overdue ? TextStyle(color: c.destructive) : null,
            ),
      showChevron: true,
      onTap: onTap,
    );
  }
}
