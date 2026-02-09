import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/utils/event_colors.dart';

/// 7-day week overview with colored event bars for each day.
///
/// Shows day headers with date circles and up to 4 event preview bars per day.
/// Tapping a column switches to the day view for that date.
/// The body is scrollable so tall days with many events aren't clipped.
class WeekView extends StatelessWidget {
  const WeekView({
    required this.selectedDate,
    required this.events,
    required this.onDaySelected,
    this.firstDayOfWeek = 0,
    super.key,
  });

  final DateTime selectedDate;
  final List<CalendarEvent> events;
  final ValueChanged<DateTime> onDaySelected;

  /// 0 = Sunday, 1 = Monday, 6 = Saturday.
  final int firstDayOfWeek;

  DateTime _weekStart(DateTime date) {
    final wd = date.weekday % 7; // Sunday = 0
    final diff = (wd - firstDayOfWeek + 7) % 7;
    return DateTime(date.year, date.month, date.day - diff);
  }

  List<CalendarEvent> _eventsForDay(DateTime date) {
    final dayStart = DateTime(date.year, date.month, date.day);
    final dayEnd = dayStart.add(const Duration(days: 1));
    return events.where((e) {
      final start = e.startAt;
      final end = e.endAt ?? start;
      if (start == null) return false;
      return start.isBefore(dayEnd) && end!.isAfter(dayStart);
    }).toList()..sort((a, b) {
      if (a.isAllDay && !b.isAllDay) return -1;
      if (!a.isAllDay && b.isAllDay) return 1;
      final aStart = a.startAt ?? DateTime(0);
      final bStart = b.startAt ?? DateTime(0);
      return aStart.compareTo(bStart);
    });
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final start = _weekStart(selectedDate);
    final dayFormat = DateFormat.E();

    return Column(
      children: [
        // Day headers.
        Container(
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: colorScheme.outlineVariant,
                width: 0.5,
              ),
            ),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
          child: Row(
            children: List.generate(7, (i) {
              final date = start.add(Duration(days: i));
              final isToday = date == today;
              final isSelected =
                  date.year == selectedDate.year &&
                  date.month == selectedDate.month &&
                  date.day == selectedDate.day;

              return Expanded(
                child: GestureDetector(
                  onTap: () => onDaySelected(date),
                  behavior: HitTestBehavior.opaque,
                  child: Column(
                    children: [
                      Text(
                        dayFormat.format(date),
                        style: textTheme.labelSmall?.copyWith(
                          color: isToday
                              ? colorScheme.primary
                              : colorScheme.onSurfaceVariant,
                          fontSize: 10,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Container(
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: isSelected ? colorScheme.primary : null,
                          border: isToday && !isSelected
                              ? Border.all(color: colorScheme.primary)
                              : null,
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          '${date.day}',
                          style: textTheme.bodySmall?.copyWith(
                            color: isSelected
                                ? colorScheme.onPrimary
                                : isToday
                                ? colorScheme.primary
                                : null,
                            fontWeight: isToday || isSelected
                                ? FontWeight.w600
                                : null,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }),
          ),
        ),
        // Event bars per day.
        Expanded(
          child: SingleChildScrollView(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: List.generate(7, (i) {
                final date = start.add(Duration(days: i));
                final dayEvents = _eventsForDay(date);

                return Expanded(
                  child: GestureDetector(
                    onTap: () => onDaySelected(date),
                    behavior: HitTestBehavior.opaque,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 1,
                        vertical: 4,
                      ),
                      child: _DayEventBars(
                        events: dayEvents,
                        textTheme: textTheme,
                        colorScheme: colorScheme,
                      ),
                    ),
                  ),
                );
              }),
            ),
          ),
        ),
      ],
    );
  }
}

/// Shows up to 4 colored event bars for a single day in the week view.
///
/// If there are more than 4 events, shows a "+N more" label.
class _DayEventBars extends StatelessWidget {
  const _DayEventBars({
    required this.events,
    required this.textTheme,
    required this.colorScheme,
  });

  final List<CalendarEvent> events;
  final TextTheme textTheme;
  final ColorScheme colorScheme;

  @override
  Widget build(BuildContext context) {
    if (events.isEmpty) return const SizedBox.shrink();

    final shown = events.take(4).toList();
    final remaining = events.length - shown.length;

    return Column(
      children: [
        ...shown.map((e) {
          final accentColor = EventColors.fromString(e.color);
          return Container(
            width: double.infinity,
            margin: const EdgeInsets.only(bottom: 2),
            padding: const EdgeInsets.symmetric(
              horizontal: 3,
              vertical: 2,
            ),
            decoration: BoxDecoration(
              color: EventColors.background(e.color),
              borderRadius: BorderRadius.circular(3),
              border: Border(
                left: BorderSide(color: accentColor, width: 2),
              ),
            ),
            child: Text(
              e.title ?? '',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: textTheme.labelSmall?.copyWith(
                fontSize: 8,
                fontWeight: FontWeight.w600,
                color: EventColors.bright(e.color),
                height: 1.2,
              ),
            ),
          );
        }),
        if (remaining > 0)
          Padding(
            padding: const EdgeInsets.only(top: 1),
            child: Text(
              '+$remaining',
              style: textTheme.labelSmall?.copyWith(
                fontSize: 8,
                color: colorScheme.primary,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
      ],
    );
  }
}
