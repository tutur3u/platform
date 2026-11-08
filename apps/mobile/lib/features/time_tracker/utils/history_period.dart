import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mobile/features/time_tracker/utils/history_anchor.dart';

int timeTrackerFirstDayOfWeek(CalendarSettingsState settings, String locale) =>
    (settings.resolvedFirstDayIndex(locale) + 6) % 7 + 1;

({DateTime start, DateTime end}) timeTrackerHistoryPeriod(
  HistoryViewMode mode,
  DateTime anchor, {
  int firstDayOfWeek = DateTime.monday,
}) {
  final localAnchor = resolveTimeTrackerHistoryAnchorDate(anchor);
  switch (mode) {
    case HistoryViewMode.day:
      final start = DateTime(
        localAnchor.year,
        localAnchor.month,
        localAnchor.day,
      );
      final end = start
          .add(const Duration(days: 1))
          .subtract(const Duration(microseconds: 1));
      return (start: start, end: end);
    case HistoryViewMode.week:
      final normalizedAnchor = DateTime(
        localAnchor.year,
        localAnchor.month,
        localAnchor.day,
      );
      final offset = (normalizedAnchor.weekday - firstDayOfWeek + 7) % 7;
      final start = normalizedAnchor.subtract(Duration(days: offset));
      final end = start
          .add(const Duration(days: 7))
          .subtract(const Duration(microseconds: 1));
      return (start: start, end: end);
    case HistoryViewMode.month:
      final start = DateTime(localAnchor.year, localAnchor.month);
      final end = DateTime(
        localAnchor.year,
        localAnchor.month + 1,
      ).subtract(const Duration(microseconds: 1));
      return (start: start, end: end);
  }
}
