import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';

enum _HeatmapViewMode { original, hybrid, calendarOnly, compactCards }

class ActivityHeatmap extends StatefulWidget {
  const ActivityHeatmap({required this.dailyActivity, super.key});

  final List<DailyActivity> dailyActivity;

  @override
  State<ActivityHeatmap> createState() => _ActivityHeatmapState();
}

class _ActivityHeatmapState extends State<ActivityHeatmap> {
  static const _viewPrefKey = 'time_tracker_heatmap_view_mode';

  _HeatmapViewMode _viewMode = _HeatmapViewMode.hybrid;
  DateTime _selectedMonth = DateTime(DateTime.now().year, DateTime.now().month);

  @override
  void initState() {
    super.initState();
    unawaited(_loadViewMode());
  }

  Future<void> _loadViewMode() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_viewPrefKey);
    final parsed = _HeatmapViewMode.values.firstWhere(
      (value) => value.name == raw,
      orElse: () => _HeatmapViewMode.hybrid,
    );
    if (!mounted) return;
    setState(() => _viewMode = parsed);
  }

  Future<void> _setViewMode(_HeatmapViewMode mode) async {
    setState(() => _viewMode = mode);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_viewPrefKey, mode.name);
  }

  String _modeLabel(AppLocalizations l10n, _HeatmapViewMode mode) {
    switch (mode) {
      case _HeatmapViewMode.original:
        return l10n.timerHeatmapViewOriginal;
      case _HeatmapViewMode.hybrid:
        return l10n.timerHeatmapViewHybrid;
      case _HeatmapViewMode.calendarOnly:
        return l10n.timerHeatmapViewCalendarOnly;
      case _HeatmapViewMode.compactCards:
        return l10n.timerHeatmapViewCompactCards;
    }
  }

  void _showViewModeSheet(BuildContext context) {
    final l10n = context.l10n;
    unawaited(
      showModalBottomSheet<void>(
        context: context,
        useSafeArea: true,
        backgroundColor: Colors.transparent,
        builder: (sheetContext) => _ViewModeSheet(
          currentMode: _viewMode,
          modeLabel: (mode) => _modeLabel(l10n, mode),
          onSelect: (mode) {
            Navigator.of(sheetContext).pop();
            unawaited(_setViewMode(mode));
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final localeTag = Localizations.localeOf(context).toLanguageTag();

    final activityByDate = <String, DailyActivity>{};
    for (final day in widget.dailyActivity) {
      activityByDate[_dateKey(day.date)] = day;
    }

    final totalDuration = widget.dailyActivity.fold<int>(
      0,
      (sum, entry) => sum + entry.duration,
    );
    final maxDuration = math.max(
      1,
      widget.dailyActivity.fold<int>(
        0,
        (maxValue, entry) => math.max(maxValue, entry.duration),
      ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary.withValues(alpha: 0.16),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Icon(
                  shad.LucideIcons.calendar,
                  size: 18,
                  color: theme.colorScheme.primary,
                ),
              ),
              const shad.Gap(10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.timerActivityHeatmap,
                      style: theme.typography.small.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      totalDuration > 0
                          ? l10n.timerHeatmapTrackedThisYear(
                              _formatDuration(totalDuration, l10n),
                            )
                          : l10n.timerHeatmapStartTracking,
                      style: theme.typography.small.copyWith(
                        color: theme.colorScheme.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
              const shad.Gap(8),
              _ViewModeSelector(
                label: _modeLabel(l10n, _viewMode),
                onTap: () => _showViewModeSheet(context),
              ),
            ],
          ),
        ),
        if (_viewMode == _HeatmapViewMode.original)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: _LegendRow(maxDuration: maxDuration),
          ),
        _buildModeContent(
          context,
          activityByDate,
          maxDuration,
          localeTag,
        ),
      ],
    );
  }

  Widget _buildModeContent(
    BuildContext context,
    Map<String, DailyActivity> activityByDate,
    int maxDuration,
    String localeTag,
  ) {
    switch (_viewMode) {
      case _HeatmapViewMode.original:
        return _OriginalHeatmapView(
          activityByDate: activityByDate,
          maxDuration: maxDuration,
        );
      case _HeatmapViewMode.hybrid:
        return Column(
          children: [
            _YearOverview(
              dailyActivity: widget.dailyActivity,
              selectedMonth: _selectedMonth,
              onSelectMonth: (month) => setState(() => _selectedMonth = month),
              localeTag: localeTag,
            ),
            const shad.Gap(8),
            _MonthlyCalendarView(
              activityByDate: activityByDate,
              selectedMonth: _selectedMonth,
              maxDuration: maxDuration,
              localeTag: localeTag,
              onPrevMonth: () => setState(
                () => _selectedMonth = DateTime(
                  _selectedMonth.year,
                  _selectedMonth.month - 1,
                ),
              ),
              onNextMonth: () => setState(
                () => _selectedMonth = DateTime(
                  _selectedMonth.year,
                  _selectedMonth.month + 1,
                ),
              ),
            ),
          ],
        );
      case _HeatmapViewMode.calendarOnly:
        return _MonthlyCalendarView(
          activityByDate: activityByDate,
          selectedMonth: _selectedMonth,
          maxDuration: maxDuration,
          localeTag: localeTag,
          onPrevMonth: () => setState(
            () => _selectedMonth = DateTime(
              _selectedMonth.year,
              _selectedMonth.month - 1,
            ),
          ),
          onNextMonth: () => setState(
            () => _selectedMonth = DateTime(
              _selectedMonth.year,
              _selectedMonth.month + 1,
            ),
          ),
        );
      case _HeatmapViewMode.compactCards:
        return _CompactCardsView(
          dailyActivity: widget.dailyActivity,
          localeTag: localeTag,
        );
    }
  }

  String _formatDuration(int totalSeconds, AppLocalizations l10n) {
    final hours = totalSeconds ~/ 3600;
    final minutes = (totalSeconds % 3600) ~/ 60;
    if (hours > 0) {
      return '$hours${l10n.timerHourUnitShort} '
          '$minutes${l10n.timerMinuteUnitShort}';
    }
    return '$minutes${l10n.timerMinuteUnitShort}';
  }
}

// ── View mode selector button ────────────────────────────────────────────────

class _ViewModeSelector extends StatelessWidget {
  const _ViewModeSelector({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: theme.colorScheme.border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: theme.typography.small.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const shad.Gap(4),
            Icon(
              shad.LucideIcons.chevronDown,
              size: 12,
              color: theme.colorScheme.mutedForeground,
            ),
          ],
        ),
      ),
    );
  }
}

// ── View mode bottom sheet ───────────────────────────────────────────────────

class _ViewModeSheet extends StatelessWidget {
  const _ViewModeSheet({
    required this.currentMode,
    required this.modeLabel,
    required this.onSelect,
  });

  final _HeatmapViewMode currentMode;
  final String Function(_HeatmapViewMode) modeLabel;
  final ValueChanged<_HeatmapViewMode> onSelect;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    const modes = _HeatmapViewMode.values;

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.card,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 12),
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: theme.colorScheme.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            ...modes.map((mode) {
              final selected = mode == currentMode;
              return InkWell(
                onTap: () => onSelect(mode),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 14,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          modeLabel(mode),
                          style: theme.typography.base.copyWith(
                            fontWeight: selected
                                ? FontWeight.w600
                                : FontWeight.w400,
                            color: selected
                                ? theme.colorScheme.primary
                                : theme.colorScheme.foreground,
                          ),
                        ),
                      ),
                      if (selected)
                        Icon(
                          shad.LucideIcons.check,
                          size: 18,
                          color: theme.colorScheme.primary,
                        ),
                    ],
                  ),
                ),
              );
            }),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}

// ── Legend row (Original mode only) ─────────────────────────────────────────

class _LegendRow extends StatelessWidget {
  const _LegendRow({required this.maxDuration});

  final int maxDuration;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return Row(
      children: [
        Text(
          l10n.timerHeatmapLegendLess,
          style: theme.typography.small.copyWith(
            color: theme.colorScheme.mutedForeground,
          ),
        ),
        const shad.Gap(8),
        ...List.generate(4, (index) {
          final intensity = index + 1;
          return Padding(
            padding: const EdgeInsets.only(right: 4),
            child: _HeatCell(
              duration: (maxDuration * intensity) ~/ 4,
              maxDuration: maxDuration,
              size: 10,
              useGreen: true,
            ),
          );
        }),
        const shad.Gap(2),
        Text(
          l10n.timerHeatmapLegendMore,
          style: theme.typography.small.copyWith(
            color: theme.colorScheme.mutedForeground,
          ),
        ),
      ],
    );
  }
}

// ── Original (GitHub-style) heatmap ─────────────────────────────────────────

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

// ── Year overview bar chart (Hybrid mode) ────────────────────────────────────

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
    final year = now.year;

    final monthly = List.generate(12, (index) {
      final month = index + 1;
      final monthStart = DateTime(year, month);
      final monthEnd = DateTime(year, month + 1, 0);

      var totalDuration = 0;
      var activeDays = 0;
      for (final day in dailyActivity) {
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
    final activeDaysYear = dailyActivity.where((d) => d.duration > 0).length;

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
              // Bar chart
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
              // Localized abbreviated month names (per locale)
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

// ── Monthly calendar view ────────────────────────────────────────────────────

class _MonthlyCalendarView extends StatelessWidget {
  const _MonthlyCalendarView({
    required this.activityByDate,
    required this.selectedMonth,
    required this.maxDuration,
    required this.localeTag,
    required this.onPrevMonth,
    required this.onNextMonth,
  });

  final Map<String, DailyActivity> activityByDate;
  final DateTime selectedMonth;
  final int maxDuration;
  final String localeTag;
  final VoidCallback onPrevMonth;
  final VoidCallback onNextMonth;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final monthStart = DateTime(selectedMonth.year, selectedMonth.month);
    final monthEnd = DateTime(selectedMonth.year, selectedMonth.month + 1, 0);
    final startOffset = (monthStart.weekday + 6) % 7;
    final endOffset = 7 - monthEnd.weekday;
    final calendarStart = monthStart.subtract(Duration(days: startOffset));
    final calendarEnd = monthEnd.add(Duration(days: endOffset % 7));

    final days = <DateTime>[];
    var cursor = calendarStart;
    while (!cursor.isAfter(calendarEnd)) {
      days.add(cursor);
      cursor = cursor.add(const Duration(days: 1));
    }

    final monthDuration = days
        .where((day) => day.month == selectedMonth.month)
        .fold<int>(
          0,
          (sum, day) => sum + (activityByDate[_dateKey(day)]?.duration ?? 0),
        );
    final monthSessions = days
        .where((day) => day.month == selectedMonth.month)
        .fold<int>(
          0,
          (sum, day) => sum + (activityByDate[_dateKey(day)]?.sessions ?? 0),
        );
    final activeDays = days
        .where((day) => day.month == selectedMonth.month)
        .where((day) => (activityByDate[_dateKey(day)]?.duration ?? 0) > 0)
        .length;

    final weekdayLabels = [
      l10n.timerHeatmapMon,
      l10n.timerHeatmapTue,
      l10n.timerHeatmapWed,
      l10n.timerHeatmapThu,
      l10n.timerHeatmapFri,
      l10n.timerHeatmapSat,
      l10n.timerHeatmapSun,
    ];

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
                  final inMonth = day.month == selectedMonth.month;
                  return Tooltip(
                    message:
                        '$key\n'
                        '${_formatDuration(dayDuration, l10n)} • '
                        '${l10n.timerHeatmapSessions(daySessions)}',
                    child: Container(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(6),
                        color: inMonth
                            ? _colorForDuration(
                                context,
                                dayDuration,
                                maxDuration,
                              )
                            : theme.colorScheme.muted.withValues(alpha: 0.2),
                        border: Border.all(
                          color: _isToday(day)
                              ? theme.colorScheme.primary
                              : Colors.transparent,
                        ),
                      ),
                      child: Center(
                        child: Text(
                          '${day.day}',
                          style: theme.typography.small.copyWith(
                            fontSize: 10,
                            color: inMonth
                                ? theme.colorScheme.foreground
                                : theme.colorScheme.mutedForeground,
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
    final theme = shad.Theme.of(context);
    if (duration <= 0) return theme.colorScheme.muted.withValues(alpha: 0.4);
    final ratio = (duration / maxDuration).clamp(0.0, 1.0);
    return theme.colorScheme.primary.withValues(
      alpha: 0.2 + ratio * 0.75,
    );
  }

  String _formatDuration(int totalSeconds, AppLocalizations l10n) {
    final hours = totalSeconds ~/ 3600;
    final minutes = (totalSeconds % 3600) ~/ 60;
    if (hours > 0) {
      return '$hours${l10n.timerHourUnitShort} '
          '$minutes${l10n.timerMinuteUnitShort}';
    }
    return '$minutes${l10n.timerMinuteUnitShort}';
  }
}

// ── Compact cards view ───────────────────────────────────────────────────────

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
                    Text(
                      '${l10n.timerHeatmapTotal}: '
                      '${_formatDuration(data.duration, l10n)}',
                    ),
                    const shad.Gap(10),
                    Text('${l10n.timerHeatmapSessionsLabel}: ${data.sessions}'),
                    const shad.Gap(10),
                    Text(
                      '${l10n.timerHeatmapActiveDaysLabel}: ${data.activeDays}',
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

  String _formatDuration(int totalSeconds, AppLocalizations l10n) {
    final hours = totalSeconds ~/ 3600;
    final minutes = (totalSeconds % 3600) ~/ 60;
    if (hours > 0) {
      return '$hours${l10n.timerHourUnitShort} '
          '$minutes${l10n.timerMinuteUnitShort}';
    }
    return '$minutes${l10n.timerMinuteUnitShort}';
  }
}

// ── Shared small widgets ─────────────────────────────────────────────────────

class _SummaryStat extends StatelessWidget {
  const _SummaryStat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Column(
      children: [
        Text(
          label,
          style: theme.typography.small.copyWith(
            color: theme.colorScheme.mutedForeground,
            fontSize: 11,
          ),
        ),
        const shad.Gap(2),
        Text(
          value,
          style: theme.typography.small.copyWith(fontWeight: FontWeight.w700),
        ),
      ],
    );
  }
}

class _MonthColumnLabel extends StatelessWidget {
  const _MonthColumnLabel({
    required this.text,
    required this.width,
    required this.height,
  });

  final String? text;
  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final fontSize = responsiveValue<double>(
      context,
      compact: 12,
      medium: 13,
      expanded: 14,
    );
    return SizedBox(
      width: width,
      height: height,
      child: text == null
          ? null
          : Center(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 1),
                  child: Text(
                    text!,
                    maxLines: 1,
                    textAlign: TextAlign.center,
                    style: theme.typography.small.copyWith(
                      fontSize: fontSize,
                      fontWeight: FontWeight.w600,
                      color: theme.colorScheme.mutedForeground,
                    ),
                  ),
                ),
              ),
            ),
    );
  }
}

class _DayLabel extends StatelessWidget {
  const _DayLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final double labelHeight = responsiveValue(
      context,
      compact: 14,
      medium: 16,
      expanded: 18,
    );
    return SizedBox(
      height: labelHeight,
      child: text.isNotEmpty
          ? Text(
              text,
              style: theme.typography.small.copyWith(
                fontSize: 9,
                color: theme.colorScheme.mutedForeground,
              ),
            )
          : null,
    );
  }
}

// ── Heat cell (GitHub-style greens for original, primary tint elsewhere) ─────

class _HeatCell extends StatelessWidget {
  const _HeatCell({
    required this.duration,
    required this.maxDuration,
    required this.size,
    this.useGreen = false,
  });

  final int duration;
  final int maxDuration;
  final double size;
  final bool useGreen;

  // GitHub contribution graph green palette – light mode
  static const _kGreenLight = [
    Color(0xFF9BE9A8),
    Color(0xFF40C463),
    Color(0xFF30A14E),
    Color(0xFF216E39),
  ];

  // GitHub contribution graph green palette – dark mode
  static const _kGreenDark = [
    Color(0xFF0E4429),
    Color(0xFF006D32),
    Color(0xFF26A641),
    Color(0xFF39D353),
  ];

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    if (duration <= 0) {
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(2),
          color: theme.colorScheme.muted,
        ),
      );
    }

    final intensity = (duration / maxDuration).clamp(0.0, 1.0);
    final Color cellColor;

    if (useGreen) {
      final greens = isDark ? _kGreenDark : _kGreenLight;
      final level = intensity < 0.25
          ? 0
          : intensity < 0.5
          ? 1
          : intensity < 0.75
          ? 2
          : 3;
      cellColor = greens[level];
    } else {
      cellColor = theme.colorScheme.primary.withValues(
        alpha: 0.2 + intensity * 0.8,
      );
    }

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(2),
        color: cellColor,
      ),
    );
  }
}

class _GridDay {
  const _GridDay({required this.date, required this.duration});
  final DateTime date;
  final int duration;
}

String _dateKey(DateTime date) {
  final normalized = DateTime(date.year, date.month, date.day);
  final month = normalized.month.toString().padLeft(2, '0');
  final day = normalized.day.toString().padLeft(2, '0');
  return '${normalized.year}-$month-$day';
}

DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

/// US/GitHub-style week: Sunday (row 0) through Saturday (row 6).
DateTime _sundayOfWeekContaining(DateTime date) {
  final n = _dateOnly(date);
  final daysBack = n.weekday == DateTime.sunday ? 0 : n.weekday;
  return n.subtract(Duration(days: daysBack));
}

/// Vietnamese `DateFormat('MMM')` can collapse to a shared "Thg" prefix
/// without a month digit. Use [AppLocalizations.timerHeatmapMonthCompact] for
/// wide surfaces; for very narrow per-week columns use
/// [AppLocalizations.timerHeatmapMonthNarrowColumn] (month index only).
String _formatHeatmapMonthLabel(
  DateTime date,
  String localeTag,
  AppLocalizations l10n, {
  required bool heatmapNarrowColumn,
}) {
  final lc = localeTag.toLowerCase();
  if (lc.startsWith('vi')) {
    if (heatmapNarrowColumn) {
      return l10n.timerHeatmapMonthNarrowColumn(date.month);
    }
    return l10n.timerHeatmapMonthCompact(date.month);
  }
  return DateFormat('MMM', localeTag).format(date);
}

/// Month label for one week column (week starts on [weekSunday], Sun–Sat).
///
/// **Algorithm (left-to-right):**
/// 1. **Contains the 1st** — If any day in this week is day `1` of a month,
///    label that month (the month the `1` falls in).
/// 2. **Else, week-start boundary** — If [prevWeekSunday] is null (first
///    column) or this week’s Sunday is in a different month/year than the
///    previous column’s Sunday, label the month of this week’s Sunday.
///
/// **Duplicates (fixed):** Rule (1) labels April on the week that contains
/// Apr 1. The next week is still April; rule (2) then saw “Sunday month
/// changed” vs March and labeled April again. **Dedupe:** at most one label
/// per calendar month using [emittedMonthKeys] (`yyyy-MM`).
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
