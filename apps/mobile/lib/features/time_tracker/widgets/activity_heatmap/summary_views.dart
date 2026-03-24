part of 'package:mobile/features/time_tracker/widgets/activity_heatmap.dart';

class _YearOverview extends StatelessWidget {
  const _YearOverview({
    required this.dailyActivity,
    required this.selectedMonth,
    required this.onSelectMonth,
    required this.localeTag,
  });

  final List<DailyActivity> dailyActivity;
  final DateTime selectedMonth;
  final ValueChanged<DateTime> onSelectMonth;
  final String localeTag;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final now = DateTime.now();
    final year = selectedMonth.year;
    final yearActivity = dailyActivity
        .where((day) => day.date.year == year)
        .toList();

    final monthly = List.generate(12, (index) {
      final month = index + 1;
      final monthStart = DateTime(year, month);
      final monthEnd = DateTime(year, month + 1, 0);

      var totalDuration = 0;
      var activeDays = 0;
      for (final day in yearActivity) {
        final normalized = DateTime(
          day.date.year,
          day.date.month,
          day.date.day,
        );
        if (normalized.isBefore(monthStart) || normalized.isAfter(monthEnd)) {
          continue;
        }
        totalDuration += day.duration;
        if (day.duration > 0) activeDays += 1;
      }

      return (monthStart, totalDuration, activeDays);
    });

    final maxMonthDuration = math.max(
      1,
      monthly.fold<int>(0, (maxValue, item) => math.max(maxValue, item.$2)),
    );
    final activeDaysYear = yearActivity.where((d) => d.duration > 0).length;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: shad.Card(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '${l10n.timerHeatmapYearPattern} $year',
                    style: theme.typography.small.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    l10n.timerHeatmapActiveDays(activeDaysYear),
                    style: theme.typography.small.copyWith(
                      color: theme.colorScheme.mutedForeground,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
              const shad.Gap(10),
              SizedBox(
                height: 52,
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: List.generate(12, (index) {
                    final entry = monthly[index];
                    final monthDate = entry.$1;
                    final monthDuration = entry.$2;
                    final isFuture = monthDate.isAfter(
                      DateTime(now.year, now.month),
                    );
                    final isSelected =
                        selectedMonth.year == monthDate.year &&
                        selectedMonth.month == monthDate.month;

                    final double barHeight;
                    if (isFuture) {
                      barHeight = 3;
                    } else if (monthDuration > 0) {
                      barHeight = math.max(
                        8,
                        52 * (monthDuration / maxMonthDuration),
                      );
                    } else {
                      barHeight = 3;
                    }

                    return Expanded(
                      child: GestureDetector(
                        onTap: isFuture ? null : () => onSelectMonth(monthDate),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 1.5),
                          child: Container(
                            height: barHeight,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(3),
                              color: isFuture
                                  ? theme.colorScheme.muted.withValues(
                                      alpha: 0.3,
                                    )
                                  : isSelected
                                  ? theme.colorScheme.primary
                                  : monthDuration > 0
                                  ? theme.colorScheme.primary.withValues(
                                      alpha: 0.45,
                                    )
                                  : theme.colorScheme.muted.withValues(
                                      alpha: 0.5,
                                    ),
                              border: isSelected
                                  ? Border.all(
                                      color: theme.colorScheme.primary,
                                      width: 1.5,
                                    )
                                  : null,
                            ),
                          ),
                        ),
                      ),
                    );
                  }),
                ),
              ),
              const shad.Gap(4),
              Row(
                children: List.generate(12, (index) {
                  final entry = monthly[index];
                  final monthDate = entry.$1;
                  final isFuture = monthDate.isAfter(
                    DateTime(now.year, now.month),
                  );
                  final isSelected =
                      selectedMonth.year == monthDate.year &&
                      selectedMonth.month == monthDate.month;
                  final monthText = _formatHeatmapMonthLabel(
                    monthDate,
                    localeTag,
                    l10n,
                    heatmapNarrowColumn: false,
                  );

                  return Expanded(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 1),
                        child: Text(
                          monthText,
                          textAlign: TextAlign.center,
                          maxLines: 1,
                          style: theme.typography.small.copyWith(
                            fontSize: 12,
                            fontWeight: isSelected
                                ? FontWeight.w700
                                : FontWeight.w400,
                            color: isSelected
                                ? theme.colorScheme.primary
                                : isFuture
                                ? theme.colorScheme.mutedForeground.withValues(
                                    alpha: 0.35,
                                  )
                                : theme.colorScheme.mutedForeground,
                          ),
                        ),
                      ),
                    ),
                  );
                }),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MonthlyCalendarView extends StatelessWidget {
  const _MonthlyCalendarView({
    required this.activityByDate,
    required this.selectedMonth,
    required this.maxDuration,
    required this.localeTag,
    required this.firstDayOfWeekIndex,
    required this.onSelectDate,
    required this.onPrevMonth,
    required this.onNextMonth,
  });

  final Map<String, DailyActivity> activityByDate;
  final DateTime selectedMonth;
  final int maxDuration;
  final String localeTag;
  final int firstDayOfWeekIndex;
  final ValueChanged<DateTime> onSelectDate;
  final VoidCallback onPrevMonth;
  final VoidCallback onNextMonth;

  static const _kWebGreenLight = [
    Color(0xFFF3F4F6),
    Color(0xFFD1FAE5),
    Color(0xFF6EE7B7),
    Color(0xFF34D399),
    Color(0xFF059669),
  ];

  static const _kWebGreenDark = [
    Color(0xFF1F2937),
    Color(0xFF064E3B),
    Color(0xFF065F46),
    Color(0xFF047857),
    Color(0xFF10B981),
  ];

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final monthStart = DateTime(selectedMonth.year, selectedMonth.month);
    final monthEnd = DateTime(selectedMonth.year, selectedMonth.month + 1, 0);
    final monthStartWeekdayIndex = monthStart.weekday % 7;
    final monthEndWeekdayIndex = monthEnd.weekday % 7;
    final startOffset = (monthStartWeekdayIndex - firstDayOfWeekIndex + 7) % 7;
    final endOffset = (firstDayOfWeekIndex + 6 - monthEndWeekdayIndex + 7) % 7;
    final calendarStart = monthStart.subtract(Duration(days: startOffset));
    final calendarEnd = monthEnd.add(Duration(days: endOffset));

    final days = <DateTime>[];
    var cursor = calendarStart;
    while (!cursor.isAfter(calendarEnd)) {
      days.add(cursor);
      cursor = cursor.add(const Duration(days: 1));
    }

    final monthDuration = days
        .where(
          (day) =>
              day.year == selectedMonth.year &&
              day.month == selectedMonth.month,
        )
        .fold<int>(
          0,
          (sum, day) => sum + (activityByDate[_dateKey(day)]?.duration ?? 0),
        );
    final monthSessions = days
        .where(
          (day) =>
              day.year == selectedMonth.year &&
              day.month == selectedMonth.month,
        )
        .fold<int>(
          0,
          (sum, day) => sum + (activityByDate[_dateKey(day)]?.sessions ?? 0),
        );
    final activeDays = days
        .where(
          (day) =>
              day.year == selectedMonth.year &&
              day.month == selectedMonth.month,
        )
        .where((day) => (activityByDate[_dateKey(day)]?.duration ?? 0) > 0)
        .length;

    final localizedWeekdayLabels = [
      l10n.timerHeatmapSun,
      l10n.timerHeatmapMon,
      l10n.timerHeatmapTue,
      l10n.timerHeatmapWed,
      l10n.timerHeatmapThu,
      l10n.timerHeatmapFri,
      l10n.timerHeatmapSat,
    ];
    final weekdayLabels = List.generate(
      7,
      (index) => localizedWeekdayLabels[(firstDayOfWeekIndex + index) % 7],
    );

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: shad.Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              Row(
                children: [
                  shad.GhostButton(
                    onPressed: onPrevMonth,
                    density: shad.ButtonDensity.icon,
                    child: Icon(
                      shad.LucideIcons.chevronLeft,
                      size: 16,
                      color: theme.colorScheme.mutedForeground,
                    ),
                  ),
                  Expanded(
                    child: Text(
                      DateFormat('MMMM yyyy', localeTag).format(selectedMonth),
                      textAlign: TextAlign.center,
                      style: theme.typography.small.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  shad.GhostButton(
                    onPressed: onNextMonth,
                    density: shad.ButtonDensity.icon,
                    child: Icon(
                      shad.LucideIcons.chevronRight,
                      size: 16,
                      color: theme.colorScheme.mutedForeground,
                    ),
                  ),
                ],
              ),
              const shad.Gap(8),
              Row(
                children: weekdayLabels
                    .map(
                      (label) => Expanded(
                        child: Text(
                          label,
                          textAlign: TextAlign.center,
                          style: theme.typography.small.copyWith(
                            color: theme.colorScheme.mutedForeground,
                            fontSize: 11,
                          ),
                        ),
                      ),
                    )
                    .toList(),
              ),
              const shad.Gap(6),
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: days.length,
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 7,
                  crossAxisSpacing: 4,
                  mainAxisSpacing: 4,
                ),
                itemBuilder: (context, index) {
                  final day = days[index];
                  final key = _dateKey(day);
                  final entry = activityByDate[key];
                  final dayDuration = entry?.duration ?? 0;
                  final daySessions = entry?.sessions ?? 0;
                  final inMonth =
                      day.year == selectedMonth.year &&
                      day.month == selectedMonth.month;
                  final backgroundColor = inMonth
                      ? _colorForDuration(context, dayDuration, maxDuration)
                      : _outOfMonthColor(context);
                  return Tooltip(
                    message:
                        '$key\n'
                        '${_formatDuration(dayDuration, l10n)} • '
                        '${l10n.timerHeatmapSessions(daySessions)}',
                    child: Material(
                      color: Colors.transparent,
                      child: InkWell(
                        onTap: () => onSelectDate(day),
                        borderRadius: BorderRadius.circular(6),
                        child: Container(
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(6),
                            color: backgroundColor,
                            border: Border.all(
                              color: _isToday(day)
                                  ? _todayBorderColor(context)
                                  : Colors.transparent,
                              width: _isToday(day) ? 1.2 : 1,
                            ),
                          ),
                          child: Center(
                            child: Text(
                              '${day.day}',
                              style: theme.typography.small.copyWith(
                                fontSize: 10,
                                color: _textColorForDate(
                                  context,
                                  inMonth: inMonth,
                                  backgroundColor: backgroundColor,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
              const shad.Gap(8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  _SummaryStat(
                    label: l10n.timerHeatmapTotal,
                    value: _formatDuration(monthDuration, l10n),
                  ),
                  _SummaryStat(
                    label: l10n.timerHeatmapSessionsLabel,
                    value: '$monthSessions',
                  ),
                  _SummaryStat(
                    label: l10n.timerHeatmapActiveDaysLabel,
                    value: '$activeDays',
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  bool _isToday(DateTime date) {
    final now = DateTime.now();
    return date.year == now.year &&
        date.month == now.month &&
        date.day == now.day;
  }

  Color _colorForDuration(BuildContext context, int duration, int maxDuration) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final palette = isDark ? _kWebGreenDark : _kWebGreenLight;
    if (duration <= 0) return palette[0];

    final ratio = (duration / maxDuration).clamp(0.0, 1.0);
    final level = ratio < 0.25
        ? 1
        : ratio < 0.5
        ? 2
        : ratio < 0.75
        ? 3
        : 4;

    return palette[level];
  }

  Color _outOfMonthColor(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final palette = isDark ? _kWebGreenDark : _kWebGreenLight;
    return palette[0].withValues(alpha: isDark ? 0.4 : 0.65);
  }

  Color _todayBorderColor(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final palette = isDark ? _kWebGreenDark : _kWebGreenLight;
    return palette[4];
  }

  Color _textColorForDate(
    BuildContext context, {
    required bool inMonth,
    required Color backgroundColor,
  }) {
    if (!inMonth) {
      return shad.Theme.of(context).colorScheme.mutedForeground;
    }

    return backgroundColor.computeLuminance() < 0.45
        ? Colors.white
        : const Color(0xFF0F172A);
  }
}

class _CompactCardsView extends StatelessWidget {
  const _CompactCardsView({
    required this.dailyActivity,
    required this.localeTag,
  });

  final List<DailyActivity> dailyActivity;
  final String localeTag;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    final monthly = <String, ({int duration, int sessions, int activeDays})>{};
    for (final day in dailyActivity) {
      final key =
          '${day.date.year}-${day.date.month.toString().padLeft(2, '0')}';
      final current = monthly[key] ?? (duration: 0, sessions: 0, activeDays: 0);
      monthly[key] = (
        duration: current.duration + day.duration,
        sessions: current.sessions + day.sessions,
        activeDays: current.activeDays + (day.duration > 0 ? 1 : 0),
      );
    }

    final keys = monthly.keys.toList()..sort((a, b) => b.compareTo(a));
    final visibleKeys = keys.take(4).toList();

    if (visibleKeys.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: shad.Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Text(l10n.timerHeatmapNoActivityYet),
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        children: visibleKeys.map((key) {
          final data = monthly[key]!;
          final segments = key.split('-');
          final label = DateFormat('MMMM yyyy', localeTag).format(
            DateTime(int.parse(segments[0]), int.parse(segments[1])),
          );

          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: shad.Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        label,
                        style: shad.Theme.of(context).typography.small.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    Flexible(
                      child: Wrap(
                        spacing: 10,
                        runSpacing: 6,
                        alignment: WrapAlignment.end,
                        children: [
                          Text(
                            '${l10n.timerHeatmapTotal}: '
                            '${_formatDuration(data.duration, l10n)}',
                          ),
                          Text(
                            '${l10n.timerHeatmapSessionsLabel}: '
                            '${data.sessions}',
                          ),
                          Text(
                            '${l10n.timerHeatmapActiveDaysLabel}: '
                            '${data.activeDays}',
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
