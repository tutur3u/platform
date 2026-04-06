import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/utils/event_colors.dart';

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
  final int firstDayOfWeek;

  List<CalendarEvent> _eventsForDay(DateTime date) {
    final dayStart = DateTime(date.year, date.month, date.day);
    final dayEnd = dayStart.add(const Duration(days: 1));

    return events.where((event) {
      final start = event.startAt;
      final end = event.endAt ?? start;
      if (start == null) {
        return false;
      }
      return start.isBefore(dayEnd) && end!.isAfter(dayStart);
    }).toList()..sort((a, b) {
      if (a.isAllDay && !b.isAllDay) return -1;
      if (!a.isAllDay && b.isAllDay) return 1;
      final aStart = a.startAt ?? DateTime(0);
      final bStart = b.startAt ?? DateTime(0);
      return aStart.compareTo(bStart);
    });
  }

  List<DateTime> _visibleDatesForMonth(DateTime month) {
    final firstOfMonth = DateTime(month.year, month.month);
    final startOffset = (firstOfMonth.weekday % 7 - firstDayOfWeek + 7) % 7;
    final gridStart = firstOfMonth.subtract(Duration(days: startOffset));

    return List<DateTime>.generate(
      42,
      (index) => gridStart.add(Duration(days: index)),
      growable: false,
    );
  }

  List<String> _weekdayLabels() {
    return List<String>.generate(7, (index) {
      final reference = DateTime(2024, 1, 7 + ((firstDayOfWeek + index) % 7));
      final label = DateFormat.E().format(reference);
      return label.isEmpty ? '' : label.substring(0, 1).toUpperCase();
    }, growable: false);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final month = DateTime(focusedMonth.year, focusedMonth.month);
    final visibleDates = _visibleDatesForMonth(month);
    final weekdayLabels = _weekdayLabels();
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
          child: Row(
            children: weekdayLabels
                .map(
                  (label) => Expanded(
                    child: Center(
                      child: Text(
                        label,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: colorScheme.onSurfaceVariant,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.4,
                        ),
                      ),
                    ),
                  ),
                )
                .toList(growable: false),
          ),
        ),
        Expanded(
          child: LayoutBuilder(
            builder: (context, constraints) {
              final cellHeight = constraints.maxHeight / 6;

              return GridView.builder(
                physics: const NeverScrollableScrollPhysics(),
                padding: EdgeInsets.zero,
                itemCount: visibleDates.length,
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 7,
                  mainAxisExtent: cellHeight,
                ),
                itemBuilder: (context, index) {
                  final date = visibleDates[index];
                  final isInFocusedMonth = date.month == month.month;
                  final isToday = date == today;
                  final isSelected =
                      date.year == selectedDate.year &&
                      date.month == selectedDate.month &&
                      date.day == selectedDate.day;
                  final dayEvents = _eventsForDay(date);

                  return _MonthDayCell(
                    date: date,
                    events: dayEvents,
                    isToday: isToday,
                    isSelected: isSelected,
                    isInFocusedMonth: isInFocusedMonth,
                    isFirstRow: index < 7,
                    isFirstColumn: index % 7 == 0,
                    onTap: () => onDaySelected(date),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }
}

class _MonthDayCell extends StatelessWidget {
  const _MonthDayCell({
    required this.date,
    required this.events,
    required this.isToday,
    required this.isSelected,
    required this.isInFocusedMonth,
    required this.isFirstRow,
    required this.isFirstColumn,
    required this.onTap,
  });

  final DateTime date;
  final List<CalendarEvent> events;
  final bool isToday;
  final bool isSelected;
  final bool isInFocusedMonth;
  final bool isFirstRow;
  final bool isFirstColumn;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final visibleDots = events.take(3).toList(growable: false);
    final remainingCount = events.length - visibleDots.length;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
          decoration: BoxDecoration(
            color: isSelected
                ? colorScheme.primary.withValues(alpha: 0.08)
                : Colors.transparent,
            border: Border(
              top: isFirstRow
                  ? BorderSide(
                      color: colorScheme.outlineVariant.withValues(alpha: 0.4),
                      width: 0.5,
                    )
                  : BorderSide.none,
              left: isFirstColumn
                  ? BorderSide(
                      color: colorScheme.outlineVariant.withValues(alpha: 0.4),
                      width: 0.5,
                    )
                  : BorderSide.none,
              right: BorderSide(
                color: colorScheme.outlineVariant.withValues(alpha: 0.4),
                width: 0.5,
              ),
              bottom: BorderSide(
                color: colorScheme.outlineVariant.withValues(alpha: 0.4),
                width: 0.5,
              ),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _MonthDayNumber(
                day: date.day,
                isToday: isToday,
                isSelected: isSelected,
                isInFocusedMonth: isInFocusedMonth,
              ),
              const Spacer(),
              if (events.isNotEmpty)
                Row(
                  children: [
                    ...visibleDots.map(
                      (event) => Padding(
                        padding: const EdgeInsets.only(right: 4),
                        child: Container(
                          width: 6,
                          height: 6,
                          decoration: BoxDecoration(
                            color: EventColors.fromString(event.color),
                            shape: BoxShape.circle,
                          ),
                        ),
                      ),
                    ),
                    if (remainingCount > 0)
                      Flexible(
                        child: Text(
                          '+$remainingCount',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: colorScheme.onSurfaceVariant,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                  ],
                ),
              if (events.isNotEmpty) const SizedBox(height: 4),
              Text(
                events.isEmpty
                    ? ''
                    : '${events.length} event${events.length == 1 ? '' : 's'}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: isInFocusedMonth
                      ? colorScheme.onSurfaceVariant
                      : colorScheme.onSurfaceVariant.withValues(alpha: 0.55),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MonthDayNumber extends StatelessWidget {
  const _MonthDayNumber({
    required this.day,
    required this.isToday,
    required this.isSelected,
    required this.isInFocusedMonth,
  });

  final int day;
  final bool isToday;
  final bool isSelected;
  final bool isInFocusedMonth;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Container(
      width: 32,
      height: 32,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: isSelected ? colorScheme.primary : Colors.transparent,
        border: isToday && !isSelected
            ? Border.all(color: colorScheme.primary.withValues(alpha: 0.6))
            : null,
      ),
      alignment: Alignment.center,
      child: Text(
        '$day',
        style: theme.textTheme.titleSmall?.copyWith(
          color: isSelected
              ? colorScheme.onPrimary
              : isToday
              ? colorScheme.primary
              : isInFocusedMonth
              ? colorScheme.onSurface
              : colorScheme.onSurfaceVariant.withValues(alpha: 0.68),
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}
