import 'package:flutter/material.dart';
import 'package:mobile/core/ui/kit/app_event_block.dart';
import 'package:mobile/core/ui/kit/app_mini_calendar.dart';
import 'package:mobile/core/ui/kit/app_panel.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/calendar/utils/event_tone.dart';

class CalendarMiniMonth extends StatelessWidget {
  const CalendarMiniMonth({
    required this.selectedDate,
    required this.focusedMonth,
    required this.events,
    required this.onDateSelected,
    required this.onMonthChanged,
    this.firstDayOfWeek = 0,
    super.key,
  });
  final DateTime selectedDate;
  final DateTime focusedMonth;
  final List<CalendarEvent> events;
  final ValueChanged<DateTime> onDateSelected;
  final ValueChanged<DateTime> onMonthChanged;
  final int firstDayOfWeek;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
    child: AppPanel(
      padded: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
        child: AppMiniCalendar(
          month: focusedMonth,
          selected: selectedDate,
          today: calendarNowInContext(context),
          firstDayOfWeek: firstDayOfWeek,
          onSelect: onDateSelected,
          onMonthChanged: onMonthChanged,
          dotsForDay: (date) => events
              .where((event) {
                final start = event.startAt;
                final end = event.endAt;
                return start != null &&
                    start.isBefore(date.add(const Duration(days: 1))) &&
                    (end?.isAfter(date) ?? !start.isBefore(date));
              })
              .take(3)
              .map((e) => AppEventBlock.hueOf(context, eventTone(e)).ink)
              .toList(),
        ),
      ),
    ),
  );
}
