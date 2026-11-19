import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/tasks_boards/utils/task_timeline_window.dart';
import 'package:mobile/l10n/l10n.dart';

/// A range with no bars: one line, plus a shortcut to the tasks without
/// dates (or Load more while pages remain unloaded).
class TaskTimelineEmpty extends StatelessWidget {
  const TaskTimelineEmpty({
    required this.span,
    required this.undatedCount,
    this.loading = false,
    this.onShowUndated,
    this.onLoadMore,
    super.key,
  });

  final TaskTimelineSpan span;
  final int undatedCount;

  /// Pages are still loading, so the range is not known to be empty.
  final bool loading;
  final VoidCallback? onShowUndated;
  final VoidCallback? onLoadMore;

  @override
  Widget build(BuildContext context) {
    if (loading) return const AppLoadingIndicator.page();
    final l10n = context.l10n;
    final showUndated = undatedCount > 0 && onShowUndated != null;
    return AppStateMessage(
      key: const ValueKey('task-timeline-empty'),
      icon: LucideIcons.calendarDays,
      illustration: const AppIllustration(AppIllustrationKind.calendarFree),
      title: switch (span) {
        TaskTimelineSpan.week => l10n.taskTimelineEmptyWeek,
        TaskTimelineSpan.twoWeeks => l10n.taskTimelineEmptyTwoWeeks,
        TaskTimelineSpan.month => l10n.taskTimelineEmptyMonth,
      },
      actionLabel: showUndated
          ? l10n.taskTimelineUndatedCount(undatedCount)
          : onLoadMore != null
          ? l10n.timerHistoryLoadMore
          : null,
      onAction: showUndated ? onShowUndated : onLoadMore,
    );
  }
}
