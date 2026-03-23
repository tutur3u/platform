part of 'package:mobile/features/time_tracker/widgets/activity_heatmap.dart';

String _dateKey(DateTime date) {
  final normalized = DateTime(date.year, date.month, date.day);
  final month = normalized.month.toString().padLeft(2, '0');
  final day = normalized.day.toString().padLeft(2, '0');
  return '${normalized.year}-$month-$day';
}

DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

DateTime _sundayOfWeekContaining(DateTime date) {
  final n = _dateOnly(date);
  final daysBack = n.weekday == DateTime.sunday ? 0 : n.weekday;
  return n.subtract(Duration(days: daysBack));
}

String _formatHeatmapMonthLabel(
  DateTime date,
  String localeTag,
  AppLocalizations l10n, {
  required bool heatmapNarrowColumn,
}) {
  final lc = localeTag.toLowerCase();
  if (lc.startsWith('vi')) {
    return heatmapNarrowColumn ? '${date.month}' : 'Thg ${date.month}';
  }
  return DateFormat('MMM', localeTag).format(date);
}

String? _heatmapMonthColumnLabel(
  DateTime weekSunday,
  DateTime? prevWeekSunday,
  String localeTag,
  AppLocalizations l10n,
  Set<String> emittedMonthKeys,
) {
  DateTime? labelDate;

  for (var i = 0; i < 7; i++) {
    final d = weekSunday.add(Duration(days: i));
    if (d.day == 1) {
      labelDate = d;
      break;
    }
  }

  if (labelDate == null) {
    final monthChanged =
        prevWeekSunday == null ||
        weekSunday.month != prevWeekSunday.month ||
        weekSunday.year != prevWeekSunday.year;
    if (!monthChanged) {
      return null;
    }
    labelDate = weekSunday;
  }

  final key = '${labelDate.year}-${labelDate.month.toString().padLeft(2, '0')}';
  if (emittedMonthKeys.contains(key)) {
    return null;
  }
  emittedMonthKeys.add(key);

  return _formatHeatmapMonthLabel(
    labelDate,
    localeTag,
    l10n,
    heatmapNarrowColumn: true,
  );
}
