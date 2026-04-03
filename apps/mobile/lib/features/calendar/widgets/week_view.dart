import 'package:flutter/material.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/widgets/multi_day_schedule_view.dart';

class WeekView extends StatelessWidget {
  const WeekView({
    required this.selectedDate,
    required this.events,
    required this.onEventTap,
    required this.onCreateAtTime,
    required this.onDaySelected,
    required this.onSwipe,
    super.key,
    this.firstDayOfWeek = 0,
  });

  final DateTime selectedDate;
  final List<CalendarEvent> events;
  final ValueChanged<CalendarEvent> onEventTap;
  final ValueChanged<DateTime> onCreateAtTime;
  final ValueChanged<DateTime> onDaySelected;
  final ValueChanged<int> onSwipe;
  final int firstDayOfWeek;

  @override
  Widget build(BuildContext context) {
    return MultiDayScheduleView(
      selectedDate: selectedDate,
      events: events,
      onEventTap: onEventTap,
      onCreateAtTime: onCreateAtTime,
      onDaySelected: onDaySelected,
      onSwipe: onSwipe,
      visibleDayCount: 7,
      alignToWeekStart: true,
      firstDayOfWeek: firstDayOfWeek,
    );
  }
}
