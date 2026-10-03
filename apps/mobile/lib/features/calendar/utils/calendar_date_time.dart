import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:timezone/data/latest.dart' as data;
import 'package:timezone/timezone.dart' as tz;

/// An immutable date/wall-clock carrier; UTC avoids device DST arithmetic.
DateTime calendarDate(
  int year, [
  int month = 1,
  int day = 1,
  int hour = 0,
  int minute = 0,
  int second = 0,
  int millisecond = 0,
  int microsecond = 0,
]) => DateTime.utc(
  year,
  month,
  day,
  hour,
  minute,
  second,
  millisecond,
  microsecond,
);

bool _initialized = false;
tz.Location _location(String zone) {
  if (zone == 'UTC') return tz.UTC;
  if (!_initialized) {
    data.initializeTimeZones();
    _initialized = true;
  }
  return tz.getLocation(zone);
}

/// Native DateTime values here carry wall-clock fields, never stored instants.
DateTime calendarWallDate(DateTime instant, String? zone) {
  final local = zone == null
      ? instant.toLocal()
      : tz.TZDateTime.from(instant, _location(zone));
  return DateTime.utc(
    local.year,
    local.month,
    local.day,
    local.hour,
    local.minute,
    local.second,
    local.millisecond,
    local.microsecond,
  );
}

DateTime calendarNow(String? zone) => calendarWallDate(DateTime.now(), zone);
String? calendarZone(BuildContext context) {
  final state = context.read<TimezoneSettingsCubit?>()?.state;
  return state?.resolved == true ? state!.effective : null;
}

DateTime calendarNowInContext(BuildContext context) =>
    context.dependOnInheritedWidgetOfExactType<CalendarWallClock>()?.now ??
    calendarNow(calendarZone(context));

/// Projected wall-clock shared by visible views; injectable for deterministic
/// event-end and midnight rendering tests.
class CalendarWallClock extends InheritedWidget {
  const CalendarWallClock({required this.now, required super.child, super.key});
  final DateTime now;
  @override
  bool updateShouldNotify(CalendarWallClock oldWidget) => now != oldWidget.now;
}

/// Build each boundary independently; a calendar day may be 23 or 25 hours.
DateTime calendarWallToUtc(DateTime wall, String? zone) {
  final instant = zone == null
      ? DateTime(
          wall.year,
          wall.month,
          wall.day,
          wall.hour,
          wall.minute,
          wall.second,
          wall.millisecond,
          wall.microsecond,
        )
      : tz.TZDateTime(
          _location(zone),
          wall.year,
          wall.month,
          wall.day,
          wall.hour,
          wall.minute,
          wall.second,
          wall.millisecond,
          wall.microsecond,
        );
  if (instant.year != wall.year ||
      instant.month != wall.month ||
      instant.day != wall.day ||
      instant.hour != wall.hour ||
      instant.minute != wall.minute ||
      instant.second != wall.second ||
      instant.millisecond != wall.millisecond ||
      instant.microsecond != wall.microsecond) {
    throw const FormatException('Nonexistent calendar local time');
  }
  return instant.toUtc();
}

CalendarEvent calendarProjectEvent(CalendarEvent event, String? zone) {
  final start = event.startAt;
  final end = event.endAt;
  if (start == null) return event;
  var wallStart = calendarWallDate(start, zone);
  var wallEnd = end == null ? null : calendarWallDate(end, zone);
  final legacyDateOnly =
      event.isAllDay &&
      start.isUtc &&
      end?.isUtc == true &&
      start.hour == 0 &&
      start.minute == 0 &&
      end!.hour == 0 &&
      end.minute == 0;
  // Retain the existing UTC-date contract of untagged legacy date-only rows.
  // Their original provider date and timezone are not available in the API.
  if (legacyDateOnly) {
    wallStart = DateTime.utc(start.year, start.month, start.day);
    wallEnd = DateTime.utc(end.year, end.month, end.day);
  }
  final zonedMidnights =
      end != null &&
      end.isAfter(start) &&
      wallEnd != null &&
      wallStart.hour == 0 &&
      wallStart.minute == 0 &&
      wallStart.second == 0 &&
      wallEnd.hour == 0 &&
      wallEnd.minute == 0 &&
      wallEnd.second == 0;
  return event.copyWith(
    startAt: wallStart,
    endAt: wallEnd,
    isAllDayOverride: event.isAllDay || zonedMidnights,
  );
}
