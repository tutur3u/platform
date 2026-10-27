import 'package:intl/intl.dart';

/// Formats UTC+7 wall time independently of the device timezone.
abstract final class Gmt7 {
  static DateTime wallTime(DateTime value) =>
      value.toUtc().add(const Duration(hours: 7));

  static String date(DateTime value, String locale) =>
      DateFormat.yMMMd(locale).format(wallTime(value));
  static String time(DateTime value, String locale) =>
      DateFormat('HH:mm', locale).format(wallTime(value));
  static String dateTime(DateTime value, String locale) =>
      '${date(value, locale)} ${time(value, locale)} GMT+7';
  static String day(DateTime value, String locale) =>
      DateFormat.MMMd(locale).format(wallTime(value));
}
