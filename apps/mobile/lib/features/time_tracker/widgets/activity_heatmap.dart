import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';

part 'activity_heatmap/mode_controls.dart';
part 'activity_heatmap/original_view.dart';
part 'activity_heatmap/summary_views.dart';
part 'activity_heatmap/shared_widgets.dart';
part 'activity_heatmap/utils.dart';

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

  void _navigateToHistoryDate(DateTime date) {
    final normalizedDate = DateTime(date.year, date.month, date.day);
    final formattedDate = DateFormat('yyyy-MM-dd').format(normalizedDate);
    final targetUri = Uri(
      path: Routes.timerHistory,
      queryParameters: {
        'historyPeriod': 'day',
        'historyDate': formattedDate,
      },
    );
    context.go(targetUri.toString());
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
    final locale = Localizations.localeOf(context);
    final firstDayOfWeekIndex = context
        .watch<CalendarSettingsCubit>()
        .state
        .resolvedFirstDayIndex(locale.languageCode);

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
              firstDayOfWeekIndex: firstDayOfWeekIndex,
              onSelectDate: _navigateToHistoryDate,
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
          firstDayOfWeekIndex: firstDayOfWeekIndex,
          onSelectDate: _navigateToHistoryDate,
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
