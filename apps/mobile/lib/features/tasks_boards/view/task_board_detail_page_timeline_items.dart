part of 'task_board_detail_page.dart';

/// One lazily built line of the timeline agenda.
sealed class _TimelineItem {
  const _TimelineItem();
}

class _TimelineDayHeaderItem extends _TimelineItem {
  const _TimelineDayHeaderItem(this.day, {this.overdue = false});

  final DateTime day;
  final bool overdue;
}

/// A task row; [first] and [last] place it in its day's card.
class _TimelineTaskItem extends _TimelineItem {
  const _TimelineTaskItem({
    required this.task,
    required this.first,
    required this.last,
    this.entry,
  });

  final TaskBoardTask task;

  /// Null for unscheduled tasks.
  final TaskTimelineEntry? entry;
  final bool first;
  final bool last;
}

class _TimelineNothingTodayItem extends _TimelineItem {
  const _TimelineNothingTodayItem();
}

class _TimelineUnscheduledHeaderItem extends _TimelineItem {
  const _TimelineUnscheduledHeaderItem();
}

class _TimelineShowLaterItem extends _TimelineItem {
  const _TimelineShowLaterItem();
}

/// The agenda flattened into the three slivers around today.
class _TimelineItems {
  const _TimelineItems({
    required this.pastBottomUp,
    required this.today,
    required this.after,
  });

  const _TimelineItems.empty()
    : pastBottomUp = const [],
      today = const [],
      after = const [];

  factory _TimelineItems.from(TaskTimelineAgenda agenda) {
    List<_TimelineItem> rows(List<TaskTimelineEntry> entries) => [
      for (final (index, entry) in entries.indexed)
        _TimelineTaskItem(
          task: entry.task,
          entry: entry,
          first: index == 0,
          last: index == entries.length - 1,
        ),
    ];

    final past = <_TimelineItem>[
      // Nearest overdue day last, so it sits directly above today.
      for (final day in agenda.past.reversed) ...[
        _TimelineDayHeaderItem(day.day, overdue: true),
        ...rows(day.entries),
      ],
    ];
    final unscheduled = agenda.unscheduled;
    return _TimelineItems(
      pastBottomUp: past.reversed.toList(growable: false),
      today: [
        _TimelineDayHeaderItem(agenda.today.day),
        if (agenda.today.entries.isEmpty)
          const _TimelineNothingTodayItem()
        else
          ...rows(agenda.today.entries),
      ],
      after: [
        for (final day in agenda.upcoming) ...[
          _TimelineDayHeaderItem(day.day),
          ...rows(day.entries),
        ],
        if (agenda.hasHiddenLater) const _TimelineShowLaterItem(),
        if (unscheduled.isNotEmpty) ...[
          const _TimelineUnscheduledHeaderItem(),
          for (final (index, task) in unscheduled.indexed)
            _TimelineTaskItem(
              task: task,
              first: index == 0,
              last: index == unscheduled.length - 1,
            ),
        ],
      ],
    );
  }

  final List<_TimelineItem> pastBottomUp;
  final List<_TimelineItem> today;
  final List<_TimelineItem> after;
}

class _TimelineItemView extends StatelessWidget {
  const _TimelineItemView({
    required this.item,
    required this.listNames,
    required this.onTaskTap,
    required this.onShowLater,
  });

  final _TimelineItem item;
  final Map<String, String> listNames;
  final ValueChanged<TaskBoardTask> onTaskTap;
  final VoidCallback onShowLater;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return switch (item) {
      _TimelineDayHeaderItem(:final day, :final overdue) => _TimelineDayHeader(
        day: day,
        overdue: overdue,
      ),
      final _TimelineTaskItem task => _TimelineCardSegment(
        first: task.first,
        last: task.last,
        child: _TimelineTaskRow(
          item: task,
          listName: listNames[task.task.listId],
          onTap: () => onTaskTap(task.task),
        ),
      ),
      _TimelineNothingTodayItem() => _TimelineCardSegment(
        first: true,
        last: true,
        child: AppGroupedRow(
          leading: const AppIconTile(icon: LucideIcons.sun),
          title: Text(l10n.taskTimelineNothingToday),
        ),
      ),
      _TimelineUnscheduledHeaderItem() => _TimelineSectionTitle(
        title: l10n.taskBoardDetailTimelineUnscheduledTitle,
        subtitle: l10n.taskBoardDetailTimelineEmptyDescription,
      ),
      _TimelineShowLaterItem() => Padding(
        padding: const EdgeInsets.only(top: AppSpacing.lg),
        child: Center(
          child: AppButton.ghost(
            key: const ValueKey('task-timeline-show-later'),
            onPressed: onShowLater,
            trailing: const Icon(LucideIcons.chevronDown),
            child: Text(l10n.taskTimelineShowLater),
          ),
        ),
      ),
    };
  }
}
