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
