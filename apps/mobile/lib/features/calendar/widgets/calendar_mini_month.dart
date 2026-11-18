import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/breakpoints.dart';
import 'package:mobile/core/ui/kit/app_event_block.dart';
import 'package:mobile/core/ui/kit/app_mini_calendar.dart';
import 'package:mobile/core/ui/kit/app_panel.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/calendar/utils/event_tone.dart';

class CalendarMiniMonth extends StatefulWidget {
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
  State<CalendarMiniMonth> createState() => _CalendarMiniMonthState();
}

class _CalendarMiniMonthState extends State<CalendarMiniMonth> {
  bool? _expanded;
  DateTime? _weekPreview;

  @override
  void didUpdateWidget(CalendarMiniMonth oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.selectedDate != widget.selectedDate ||
        oldWidget.firstDayOfWeek != widget.firstDayOfWeek) {
      _weekPreview = null;
    }
  }

  DateTime _weekStart(DateTime date) => calendarDate(
    date.year,
    date.month,
    date.day - (date.weekday % 7 - widget.firstDayOfWeek + 7) % 7,
  );

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
    child: LayoutBuilder(
      builder: (context, constraints) {
        final viewport = MediaQuery.sizeOf(context);
        final expanded =
            _expanded ??
            (viewport.width >= Breakpoints.mediumMin &&
                viewport.height >= 900 &&
                constraints.maxHeight >= 360);
        final week = _weekPreview ?? _weekStart(widget.selectedDate);
        final month = expanded
            ? widget.focusedMonth
            : week.add(const Duration(days: 3));
        return AppPanel(
          padded: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: AppMiniCalendar(
              month: month,
              selected: widget.selectedDate,
              today: calendarNowInContext(context),
              firstDayOfWeek: widget.firstDayOfWeek,
              weekStart: expanded ? null : week,
              maxHeight: math.max(0, constraints.maxHeight - 8),
              onSelect: widget.onDateSelected,
              onToggleExpanded: () {
                setState(() => _expanded = !expanded);
                if (!expanded) {
                  widget.onMonthChanged(calendarDate(month.year, month.month));
                }
              },
              onPageChanged: (date) {
                if (expanded) {
                  widget.onMonthChanged(date);
                } else {
                  setState(() => _weekPreview = date);
                  final midweek = date.add(const Duration(days: 3));
                  widget.onMonthChanged(
                    calendarDate(midweek.year, midweek.month),
                  );
                }
              },
              dotsForDay: (date) => widget.events
                  .where((event) => calendarEventOverlapsDay(event, date))
                  .take(3)
                  .map((e) => AppEventBlock.hueOf(context, eventTone(e)).ink)
                  .toList(),
            ),
          ),
        );
      },
    ),
  );
}
