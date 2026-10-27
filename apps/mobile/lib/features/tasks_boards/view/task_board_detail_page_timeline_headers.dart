part of 'task_board_detail_page.dart';

/// Range switch and the Today anchor above the agenda.
class _TimelineToolbar extends StatelessWidget {
  const _TimelineToolbar({
    required this.range,
    required this.onRangeChanged,
    required this.onToday,
  });

  final TaskTimelineRange range;
  final ValueChanged<TaskTimelineRange> onRangeChanged;
  final VoidCallback? onToday;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Row(
      children: [
        Expanded(
          child: AppSegmentedControl<TaskTimelineRange>(
            key: const ValueKey('task-timeline-range'),
            selected: range,
            onChanged: onRangeChanged,
            segments: [
              AppSegment(
                value: TaskTimelineRange.week,
                label: l10n.taskTimelineRangeWeek,
              ),
              AppSegment(
                value: TaskTimelineRange.month,
                label: l10n.taskTimelineRangeMonth,
              ),
              AppSegment(
                value: TaskTimelineRange.all,
                label: l10n.taskTimelineRangeAll,
              ),
            ],
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        AppButton.outline(
          key: const ValueKey('task-timeline-today-button'),
          onPressed: onToday,
          leading: const Icon(LucideIcons.locateFixed),
          child: Text(l10n.taskBoardDetailToday),
        ),
      ],
    );
  }
}

/// Day caption: relative words for today and tomorrow, then the date.
/// Overdue days add a destructive label instead of a task count.
class _TimelineDayHeader extends StatelessWidget {
  const _TimelineDayHeader({required this.day, required this.overdue});

  final DateTime day;
  final bool overdue;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final tomorrow = DateTime(today.year, today.month, today.day + 1);
    final date = DateFormat.MMMEd(l10n.localeName).format(day);
    final title = day == today
        ? '${l10n.taskBoardDetailToday} · $date'
        : day == tomorrow
        ? '${l10n.taskBoardDetailTomorrow} · $date'
        : date;
    return _TimelineSectionTitle(
      title: title,
      highlight: day == today,
      trailing: overdue ? l10n.taskBoardDetailOverdue : null,
    );
  }
}

class _TimelineSectionTitle extends StatelessWidget {
  const _TimelineSectionTitle({
    required this.title,
    this.subtitle,
    this.trailing,
    this.highlight = false,
  });

  final String title;
  final String? subtitle;

  /// Short destructive status, such as Overdue.
  final String? trailing;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.xs,
        AppLayout.sectionGap,
        AppSpacing.xs,
        AppLayout.sectionCaptionGap,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(
                    title,
                    style: tokens.typography.base.copyWith(
                      fontWeight: FontWeight.w700,
                      color: highlight ? c.primary : c.foreground,
                    ),
                  ),
                ),
              ),
              if (trailing case final trailing?)
                Text(
                  trailing,
                  style: tokens.typography.small.copyWith(
                    color: c.destructive,
                    fontWeight: FontWeight.w600,
                  ),
                ),
            ],
          ),
          if (subtitle case final subtitle?) ...[
            const SizedBox(height: AppSpacing.xxs),
            Text(
              subtitle,
              style: tokens.typography.small.copyWith(color: c.mutedForeground),
            ),
          ],
        ],
      ),
    );
  }
}
