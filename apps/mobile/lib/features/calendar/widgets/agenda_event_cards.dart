part of 'agenda_view.dart';

/// Banner-style card for all-day events in the agenda view.
///
/// Visually distinct from timed events: uses a gradient background, a leading
/// calendar icon, and shows "Day X of Y" for multi-day events with a thin
/// progress bar.
class _AllDayBanner extends StatelessWidget {
  const _AllDayBanner({
    required this.event,
    required this.isPast,
    required this.displayDate,
    required this.onTap,
  });

  final CalendarEvent event;
  final bool isPast;

  /// The calendar date this banner appears under — used to compute
  /// "Day X of Y" for multi-day events.
  final DateTime displayDate;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final baseColor = EventColors.fromString(event.color);
    final opacity = isPast ? 0.45 : 1.0;
    final info = _dayInfo();

    return Opacity(
      opacity: opacity,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 3),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                baseColor.withValues(alpha: 0.9),
                baseColor.withValues(alpha: 0.65),
              ],
            ),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Main content row.
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                child: Row(
                  children: [
                    // Leading icon.
                    Icon(
                      Icons.wb_sunny_outlined,
                      size: 18,
                      color: Colors.white.withValues(alpha: 0.9),
                    ),
                    const SizedBox(width: 10),
                    // Title + subtitle.
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            event.title ?? '',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.w600,
                              color: Colors.white,
                              decoration: isPast
                                  ? TextDecoration.lineThrough
                                  : null,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            _buildSubtitle(context, info),
                            style: textTheme.bodySmall?.copyWith(
                              color: Colors.white.withValues(alpha: 0.85),
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (isPast)
                      Icon(
                        Icons.check_circle_outline,
                        size: 18,
                        color: Colors.white.withValues(alpha: 0.6),
                      ),
                  ],
                ),
              ),
              // Progress bar for multi-day events.
              if (info.totalDays > 1)
                ClipRRect(
                  borderRadius: const BorderRadius.vertical(
                    bottom: Radius.circular(10),
                  ),
                  child: LinearProgressIndicator(
                    value: info.dayNumber / info.totalDays,
                    minHeight: 3,
                    backgroundColor: Colors.white.withValues(alpha: 0.2),
                    valueColor: AlwaysStoppedAnimation(
                      Colors.white.withValues(alpha: 0.7),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  _DayInfo _dayInfo() {
    if (event.startAt == null || event.endAt == null) {
      return const _DayInfo(dayNumber: 1, totalDays: 1);
    }

    final startDay = DateTime(
      event.startAt!.year,
      event.startAt!.month,
      event.startAt!.day,
    );
    // endAt is exclusive (midnight after last day).
    final lastDay = event.endAt!.subtract(const Duration(days: 1));
    final endDay = DateTime(lastDay.year, lastDay.month, lastDay.day);
    final totalDays = endDay.difference(startDay).inDays + 1;

    if (totalDays <= 1) {
      return const _DayInfo(dayNumber: 1, totalDays: 1);
    }

    final day = DateTime(displayDate.year, displayDate.month, displayDate.day);
    final dayNumber = day.difference(startDay).inDays + 1;
    return _DayInfo(dayNumber: dayNumber, totalDays: totalDays);
  }

  String _buildSubtitle(BuildContext context, _DayInfo info) {
    final l10n = context.l10n;
    if (info.totalDays <= 1) return l10n.calendarAllDay;

    final progress = l10n.calendarAllDayProgress(
      info.dayNumber,
      info.totalDays,
    );
    return '${l10n.calendarAllDay} · $progress';
  }
}

/// Helper to hold computed day-of-total info for an all-day banner.
class _DayInfo {
  const _DayInfo({required this.dayNumber, required this.totalDays});
  final int dayNumber;
  final int totalDays;
}

class _AgendaEventCard extends StatelessWidget {
  const _AgendaEventCard({
    required this.event,
    required this.isPast,
    required this.onTap,
  });

  final CalendarEvent event;
  final bool isPast;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final use24Hours = MediaQuery.alwaysUse24HourFormatOf(context);
    final format = use24Hours ? DateFormat.Hm(locale) : DateFormat.jm(locale);
    final start = event.startAt!.toLocal();
    final end = (event.endAt ?? event.startAt)!.toLocal();
    final time = '${format.format(start)} – ${format.format(end)}';
    final titleColor = EventColors.bright(event.color);
    final wide =
        MediaQuery.sizeOf(context).width >= Breakpoints.mediumMin &&
        MediaQuery.textScalerOf(context).scale(14) < 24;
    final timeLabel = Text(
      time,
      style: theme.textTheme.bodySmall?.copyWith(color: titleColor),
    );
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Material(
        color: EventColors.background(event.color),
        borderRadius: BorderRadius.circular(14),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              border: BorderDirectional(
                start: BorderSide(
                  color: EventColors.fromString(event.color),
                  width: 4,
                ),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (wide) ...[
                  SizedBox(width: 160, child: timeLabel),
                  const SizedBox(width: 16),
                ],
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        event.title ?? '',
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: titleColor,
                        ),
                      ),
                      if (!wide) ...[const SizedBox(height: 4), timeLabel],
                      if (event.description?.isNotEmpty == true) ...[
                        const SizedBox(height: 6),
                        Text(
                          event.description!,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                if (isPast) ...[
                  const SizedBox(width: 8),
                  Icon(
                    Icons.check_circle_outline,
                    size: 18,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
