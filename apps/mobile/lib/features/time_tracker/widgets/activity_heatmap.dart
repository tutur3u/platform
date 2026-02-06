import 'package:flutter/material.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/l10n/l10n.dart';

class ActivityHeatmap extends StatelessWidget {
  const ActivityHeatmap({required this.dailyActivity, super.key});

  final List<DailyActivity> dailyActivity;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;

    final activityMap = <String, int>{};
    for (final day in dailyActivity) {
      final key = _dateKey(day.date);
      activityMap[key] = day.duration;
    }

    // Build 52 weeks × 7 days grid from today going back
    final today = DateTime.now();
    final weeks = <List<_DayData>>[];

    for (var w = 51; w >= 0; w--) {
      final week = <_DayData>[];
      for (var d = 0; d < 7; d++) {
        final date = today.subtract(Duration(days: w * 7 + (6 - d)));
        final key = _dateKey(date);
        week.add(_DayData(date: date, duration: activityMap[key] ?? 0));
      }
      weeks.add(week);
    }

    final maxDuration = activityMap.values.fold<int>(
      1,
      (max, v) => v > max ? v : max,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Text(
            l10n.timerActivityHeatmap,
            style: textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
          ),
        ),
        SizedBox(
          height: 110,
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Day labels
                Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _dayLabel('', textTheme),
                    _dayLabel('M', textTheme),
                    _dayLabel('', textTheme),
                    _dayLabel('W', textTheme),
                    _dayLabel('', textTheme),
                    _dayLabel('F', textTheme),
                    _dayLabel('', textTheme),
                  ],
                ),
                const SizedBox(width: 4),
                ...weeks.map(
                  (week) => Column(
                    mainAxisSize: MainAxisSize.min,
                    children: week.map((day) {
                      final intensity = day.duration / maxDuration;
                      return Padding(
                        padding: const EdgeInsets.all(1),
                        child: Container(
                          width: 12,
                          height: 12,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(2),
                            color: day.duration > 0
                                ? colorScheme.primary.withValues(
                                    alpha: 0.2 + intensity * 0.8,
                                  )
                                : colorScheme.surfaceContainerHighest,
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  String _dateKey(DateTime date) =>
      '${date.year}-${date.month.toString().padLeft(2, '0')}'
      '-${date.day.toString().padLeft(2, '0')}';
}

Widget _dayLabel(String text, TextTheme textTheme) {
  return SizedBox(
    height: 14,
    child: text.isNotEmpty
        ? Text(
            text,
            style: textTheme.labelSmall?.copyWith(fontSize: 9),
          )
        : null,
  );
}

class _DayData {
  const _DayData({required this.date, required this.duration});
  final DateTime date;
  final int duration;
}
