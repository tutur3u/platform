import 'package:flutter/material.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/utils/event_colors.dart';

/// Full month grid with compact colored event bars under each date.
///
/// Shows up to 3 thin colored bars per day cell (more informative than dots).
/// Tapping a cell switches to the day view for that date.
class MonthView extends StatelessWidget {
  const MonthView({
    required this.selectedDate,
    required this.focusedMonth,
    required this.events,
    required this.onDaySelected,
    this.firstDayOfWeek = 0,
    super.key,
  });

  final DateTime selectedDate;
  final DateTime focusedMonth;
  final List<CalendarEvent> events;
  final ValueChanged<DateTime> onDaySelected;

  /// 0 = Sunday, 1 = Monday, 6 = Saturday.
  final int firstDayOfWeek;

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

    final month = DateTime(focusedMonth.year, focusedMonth.month);
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    final startWeekday = (month.weekday % 7 - firstDayOfWeek + 7) % 7;

    const allDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    final weekDays = [
      for (var i = 0; i < 7; i++) allDays[(firstDayOfWeek + i) % 7],
    ];

    return Column(
      children: [
        // Weekday headers.
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
          child: Row(
            children: weekDays
                .map(
                  (d) => Expanded(
                    child: Center(
                      child: Text(
                        d,
                        style: textTheme.labelSmall?.copyWith(
                          color: colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                  ),
                )
                .toList(),
          ),
        ),
        // Month grid.
        Expanded(
          child: GridView.builder(
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 7,
              childAspectRatio: 0.72,
            ),
            itemCount: startWeekday + daysInMonth,
            itemBuilder: (context, index) {
              if (index < startWeekday) return const SizedBox();

              final day = index - startWeekday + 1;
              final date = DateTime(month.year, month.month, day);
              final isToday = date == today;
              final isSelected =
                  date.year == selectedDate.year &&
                  date.month == selectedDate.month &&
                  date.day == selectedDate.day;
              final dayEvents = _eventsForDay(date);

              return GestureDetector(
                onTap: () => onDaySelected(date),
                behavior: HitTestBehavior.opaque,
                child: Padding(
                  padding: const EdgeInsets.all(1),
                  child: Column(
                    children: [
                      // Day number.
                      Container(
                        width: 26,
                        height: 26,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: isSelected ? colorScheme.primary : null,
                          border: isToday && !isSelected
                              ? Border.all(color: colorScheme.primary)
                              : null,
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          '$day',
                          style: textTheme.bodySmall?.copyWith(
                            fontSize: 11,
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
                      const SizedBox(height: 2),
                      // Event bars (up to 3 compact colored bars).
                      ...dayEvents.take(3).map((e) {
                        return Container(
                          width: double.infinity,
                          height: 4,
                          margin: const EdgeInsets.only(
                            bottom: 1,
                            left: 2,
                            right: 2,
                          ),
                          decoration: BoxDecoration(
                            color: EventColors.bright(e.color),
                            borderRadius: BorderRadius.circular(2),
                          ),
                        );
                      }),
                      // "+N" indicator.
                      if (dayEvents.length > 3)
                        Text(
                          '+${dayEvents.length - 3}',
                          style: textTheme.labelSmall?.copyWith(
                            fontSize: 7,
                            color: colorScheme.primary,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
