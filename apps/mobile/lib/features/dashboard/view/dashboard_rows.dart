part of 'dashboard_page.dart';

class _TaskRow extends StatelessWidget {
  const _TaskRow({required this.task});

  final UserTask task;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final location = [
      task.list?.board?.name,
      task.list?.name,
    ].whereType<String>().where((value) => value.isNotEmpty).join(' · ');
    final (dueLabel, tone) = _due(context, task.endDate);

    return AppGroupedRow(
      leading: AppIconTile(
        icon: tone == AppTone.destructive
            ? LucideIcons.circleAlert
            : LucideIcons.circle,
        tone: tone,
      ),
      title: Text(task.name ?? context.l10n.tasksUntitled),
      subtitle: Text.rich(
        TextSpan(
          children: [
            if (dueLabel != null)
              TextSpan(
                text: dueLabel,
                style: TextStyle(
                  color: tone == AppTone.neutral
                      ? null
                      : tone.foreground(tokens.colorScheme),
                  fontWeight: FontWeight.w600,
                ),
              ),
            if (dueLabel != null && location.isNotEmpty)
              const TextSpan(text: ' · '),
            if (location.isNotEmpty) TextSpan(text: location),
          ],
        ),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      showChevron: true,
      onTap: () => unawaited(
        openUserTaskBoardDetailWithWorkspace(
          context,
          task,
          workspaceCubit: context.read<WorkspaceCubit>(),
        ),
      ),
    );
  }

  (String?, AppTone) _due(BuildContext context, DateTime? date) {
    final l10n = context.l10n;
    if (date == null) return (null, AppTone.neutral);
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final delta = DateTime(
      date.year,
      date.month,
      date.day,
    ).difference(today).inDays;

    if (delta < 0) return (l10n.dashboardTaskOverdue, AppTone.destructive);
    if (delta == 0) return (l10n.dashboardTaskToday, AppTone.warning);
    if (delta == 1) return (l10n.dashboardTaskTomorrow, AppTone.primary);
    final locale = Localizations.localeOf(context).toLanguageTag();
    return (DateFormat.MMMEd(locale).format(date), AppTone.neutral);
  }
}

class _EventRow extends StatelessWidget {
  const _EventRow({required this.event});

  static const double _leafSize = 44;
  static const double dividerInset =
      AppLayout.rowHorizontalPadding + _leafSize + AppLayout.rowLeadingGap;

  final CalendarEvent event;

  @override
  Widget build(BuildContext context) {
    final start = event.startAt;
    final locale = Localizations.localeOf(context).toLanguageTag();
    final when = start == null
        ? context.l10n.dashboardEventAllDay
        : '${DateFormat.EEEE(locale).format(start)}'
              ' · ${DateFormat.Hm(locale).format(start)}';
    final detail = calendarDescriptionPreview(event.description ?? '');

    return AppGroupedRow(
      leading: _DateLeaf(date: start, size: _leafSize),
      title: Text(event.title ?? context.l10n.dashboardUntitledEvent),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(when, maxLines: 1, overflow: TextOverflow.ellipsis),
          if (detail.isNotEmpty)
            Text(detail, maxLines: 1, overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}

/// Calendar-leaf date badge: short month above the day number.
class _DateLeaf extends StatelessWidget {
  const _DateLeaf({required this.date, required this.size});

  final DateTime? date;
  final double size;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final locale = Localizations.localeOf(context).toLanguageTag();
    final date = this.date;
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: AppTone.primary.fill(c),
          borderRadius: BorderRadius.circular(AppRadius.sm),
        ),
        padding: const EdgeInsets.all(AppSpacing.xs),
        child: FittedBox(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                date == null
                    ? '--'
                    : DateFormat.MMM(locale).format(date).toUpperCase(),
                maxLines: 1,
                style: tokens.typography.xSmall.copyWith(
                  fontSize: 10,
                  height: 1.1,
                  color: c.primary,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.4,
                ),
              ),
              Text(
                date == null ? '' : '${date.day}',
                maxLines: 1,
                style: tokens.typography.large.copyWith(
                  height: 1.1,
                  color: c.foreground,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
