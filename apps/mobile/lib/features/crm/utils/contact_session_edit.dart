import 'package:mobile/core/utils/timezone_location.dart';
import 'package:timezone/timezone.dart' as tz;

DateTime? contactSessionEditTime(String timestamp, String? timezone) {
  final instant = DateTime.tryParse(timestamp);
  if (instant == null) return null;
  if (timezone == null || timezone.isEmpty) return instant.toLocal();
  try {
    return tz.TZDateTime.from(instant, timezoneLocation(timezone));
  } on tz.LocationNotFoundException {
    return null;
  }
}

DateTime? contactSessionEditWallTime(
  DateTime current, {
  DateTime? date,
  int? hour,
  int? minute,
}) {
  final day = date ?? current;
  final nextHour = hour ?? current.hour;
  final nextMinute = minute ?? current.minute;
  if (day.year == current.year &&
      day.month == current.month &&
      day.day == current.day &&
      nextHour == current.hour &&
      nextMinute == current.minute) {
    return current;
  }
  final next = current is tz.TZDateTime
      ? tz.TZDateTime(
          current.location,
          day.year,
          day.month,
          day.day,
          nextHour,
          nextMinute,
        )
      : DateTime(day.year, day.month, day.day, nextHour, nextMinute);
  // Timezone constructors can roll a skipped wall time into a valid hour.
  if (next.year != day.year ||
      next.month != day.month ||
      next.day != day.day ||
      next.hour != nextHour ||
      next.minute != nextMinute) {
    return null;
  }
  return next;
}
