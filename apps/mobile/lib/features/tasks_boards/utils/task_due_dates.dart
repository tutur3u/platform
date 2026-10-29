import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/utils/timezone_location.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:timezone/timezone.dart' as tz;

/// The user's timezone setting, as Calendar resolves it; null uses the
/// device zone (no settings cubit, or preferences not loaded yet).
String? taskTimezone(BuildContext context) {
  final state = context.read<TimezoneSettingsCubit?>()?.state;
  return state?.resolved == true ? state!.effective : null;
}

/// The calendar day [instant] falls on in [zone].
DateTime taskDay(DateTime instant, String? zone) {
  final wall = zone == null
      ? instant.toLocal()
      : tz.TZDateTime.from(instant, timezoneLocation(zone));
  return DateTime(wall.year, wall.month, wall.day);
}

/// [instant] in [zone], for saving: the task repository snaps a
/// [tz.TZDateTime] to its own zone's day, a plain date to the device's.
DateTime taskInZone(DateTime instant, String? zone) => zone == null
    ? instant
    : tz.TZDateTime.from(instant, timezoneLocation(zone));

/// The first instant of calendar [day] in [zone], where start dates land.
DateTime taskStartOfDayIn(DateTime day, String? zone) => zone == null
    ? DateTime(day.year, day.month, day.day)
    : tz.TZDateTime(timezoneLocation(zone), day.year, day.month, day.day);

/// The last second of calendar [day] in [zone], where due dates land.
DateTime taskEndOfDayIn(DateTime day, String? zone) => zone == null
    ? DateTime(day.year, day.month, day.day, 23, 59, 59)
    : tz.TZDateTime(
        timezoneLocation(zone),
        day.year,
        day.month,
        day.day,
        23,
        59,
        59,
      );

/// Whether a task is overdue: its due (end) day is before today in [zone].
///
/// One rule for every board surface. Days, not times: due dates are saved
/// at the end of the chosen day, so a task is never overdue on its due day.
/// A task without a due date is never overdue, even with a past start.
bool taskIsOverdue({
  required DateTime? endDate,
  required DateTime now,
  String? zone,
}) => endDate != null && taskDay(endDate, zone).isBefore(taskDay(now, zone));

/// Time from [now] until the next midnight in [zone], so day views can
/// re-anchor "today" when the date changes.
Duration taskTimeUntilNextDay(DateTime now, String? zone) {
  if (zone == null) {
    final local = now.toLocal();
    return DateTime(local.year, local.month, local.day + 1).difference(local);
  }
  final location = timezoneLocation(zone);
  final wall = tz.TZDateTime.from(now, location);
  return tz.TZDateTime(
    location,
    wall.year,
    wall.month,
    wall.day + 1,
  ).difference(wall);
}
