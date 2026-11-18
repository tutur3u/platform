import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// Formats wall-clock fields using the locale and the system's 24-hour setting.
DateFormat calendarTimeFormat(BuildContext context) {
  final locale = Localizations.localeOf(context).toLanguageTag();
  return MediaQuery.alwaysUse24HourFormatOf(context)
      ? DateFormat.Hm(locale)
      : DateFormat.jm(locale);
}

String formatCalendarTimeRange(
  BuildContext context,
  DateTime? start,
  DateTime? end,
) {
  final format = calendarTimeFormat(context);
  return [
    if (start != null) format.format(start),
    if (end != null) format.format(end),
  ].join(' – ');
}
