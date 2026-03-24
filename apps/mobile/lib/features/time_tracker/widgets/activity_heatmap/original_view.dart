part of 'package:mobile/features/time_tracker/widgets/activity_heatmap.dart';

class _OriginalHeatmapView extends StatelessWidget {
  const _OriginalHeatmapView({
    required this.activityByDate,
    required this.maxDuration,
  });

  final Map<String, DailyActivity> activityByDate;
  final int maxDuration;

  static const _numWeeks = 53;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final localeTag = Localizations.localeOf(context).toLanguageTag();

    final double cellSize = responsiveValue(
      context,
      compact: 13,
      medium: 15,
      expanded: 17,
    );
    final double monthRowHeight = responsiveValue(
      context,
      compact: 24,
      medium: 26,
      expanded: 28,
    );

    final today = _dateOnly(DateTime.now());
    final endSunday = _sundayOfWeekContaining(today);
    final startSunday = endSunday.subtract(
      const Duration(days: 7 * (_numWeeks - 1)),
    );

    final weeks = <List<_GridDay>>[];
    for (var wi = 0; wi < _numWeeks; wi++) {
      final weekSunday = startSunday.add(Duration(days: wi * 7));
      final week = <_GridDay>[];
      for (var d = 0; d < 7; d++) {
        final date = weekSunday.add(Duration(days: d));
        final isFuture = date.isAfter(today);
        final key = _dateKey(date);
        final duration = isFuture ? 0 : (activityByDate[key]?.duration ?? 0);
        week.add(_GridDay(date: date, duration: duration));
      }
      weeks.add(week);
    }

    final monthLabels = <String?>[];
    final emittedMonthKeys = <String>{};
    DateTime? prevSunday;
    for (var wi = 0; wi < _numWeeks; wi++) {
      final weekSunday = startSunday.add(Duration(days: wi * 7));
      monthLabels.add(
        _heatmapMonthColumnLabel(
          weekSunday,
          prevSunday,
          localeTag,
          l10n,
          emittedMonthKeys,
        ),
      );
      prevSunday = weekSunday;
    }

    final weekdayLabels = [
      l10n.timerHeatmapSun,
      l10n.timerHeatmapMon,
      l10n.timerHeatmapTue,
      l10n.timerHeatmapWed,
      l10n.timerHeatmapThu,
      l10n.timerHeatmapFri,
      l10n.timerHeatmapSat,
    ];

    final columnWidth = cellSize + 2;
    final gridHeight = 7 * columnWidth;
    final heatmapHeight = monthRowHeight + 2 + gridHeight;

    return SizedBox(
      height: heatmapHeight,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(height: monthRowHeight),
                ...weekdayLabels.map(_DayLabel.new),
              ],
            ),
            const shad.Gap(4),
            ...List.generate(_numWeeks, (wi) {
              final week = weeks[wi];
              return Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _MonthColumnLabel(
                    text: monthLabels[wi],
                    width: columnWidth,
                    height: monthRowHeight,
                  ),
                  ...week.map(
                    (day) => Padding(
                      padding: const EdgeInsets.all(1),
                      child: _HeatCell(
                        duration: day.duration,
                        maxDuration: maxDuration,
                        size: cellSize,
                        useGreen: true,
                      ),
                    ),
                  ),
                ],
              );
            }),
          ],
        ),
      ),
    );
  }
}
