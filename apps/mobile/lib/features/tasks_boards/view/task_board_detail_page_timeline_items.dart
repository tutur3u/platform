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

/// Today has nothing loaded; whether it is truly empty depends on whether
/// every page is loaded.
class _TimelineNothingTodayItem extends _TimelineItem {
  const _TimelineNothingTodayItem();
}

/// Overdue days are above the opening position; this jumps to them.
class _TimelineOverdueJumpItem extends _TimelineItem {
  const _TimelineOverdueJumpItem();
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
        if (agenda.past.isNotEmpty) const _TimelineOverdueJumpItem(),
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
    required this.allLoaded,
    required this.loading,
    required this.onTaskTap,
    required this.onShowLater,
    required this.onShowOverdue,
    required this.onLoadMore,
  });

  final _TimelineItem item;
  final Map<String, String> listNames;

  /// Every page of every open list is loaded.
  final bool allLoaded;
  final bool loading;
  final ValueChanged<TaskBoardTask> onTaskTap;
  final VoidCallback onShowLater;
  final VoidCallback onShowOverdue;
  final VoidCallback onLoadMore;

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
      // Never claim today is empty while pages remain unloaded.
      _TimelineNothingTodayItem() => _TimelineCardSegment(
        first: true,
        last: true,
        child: allLoaded
            ? AppGroupedRow(
                key: const ValueKey('task-timeline-nothing-today'),
                leading: const AppIconTile(icon: LucideIcons.sun),
                title: Text(l10n.taskTimelineNothingToday),
              )
            : AppGroupedRow(
                key: const ValueKey('task-timeline-today-loading'),
                leading: loading
                    ? const AppLoadingIndicator.inline()
                    : const AppIconTile(icon: LucideIcons.cloudDownload),
                title: Text(
                  loading
                      ? l10n.taskTimelineLoadingTasks
                      : l10n.taskTimelineNotAllLoaded,
                ),
                showChevron: !loading,
                onTap: loading ? null : onLoadMore,
              ),
      ),
      _TimelineOverdueJumpItem() => Padding(
        padding: const EdgeInsets.only(top: AppSpacing.sm),
        child: Align(
          alignment: AlignmentDirectional.centerStart,
          child: AppButton.ghost(
            key: const ValueKey('task-timeline-show-overdue'),
            onPressed: onShowOverdue,
            leading: const Icon(LucideIcons.arrowUp),
            child: Text(l10n.taskTimelineShowOverdue),
          ),
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
