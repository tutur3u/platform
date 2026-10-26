import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/features/profile/view/profile_activity_chart.dart';
import 'package:mobile/l10n/l10n.dart';

/// Compact tracked time for a stat value: "45m", "2h" or "1h 5m".
String profileTrackedDuration(AppLocalizations l10n, int seconds) {
  final minutes = seconds ~/ 60;
  final hours = minutes ~/ 60;
  final rest = minutes % 60;
  if (hours == 0) return l10n.profileDurationMinutes(minutes);
  if (rest == 0) return l10n.profileDurationHours(hours);
  return l10n.profileDurationHoursMinutes(hours, rest);
}

/// Today, this week and this month as stat tiles, then the 12-week heatmap.
class ProfileActivitySummary extends StatelessWidget {
  const ProfileActivitySummary({required this.stats, super.key});

  final TimeTrackerStats stats;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        _ProfileStatTiles(
          equalHeight: true,
          children: [
            for (final (label, seconds, icon) in [
              (l10n.timerToday, stats.todayTime, LucideIcons.sun),
              (l10n.timerThisWeek, stats.weekTime, LucideIcons.calendarDays),
              (l10n.timerThisMonth, stats.monthTime, LucideIcons.calendar),
            ])
              AppStatTile(
                label: label,
                value: profileTrackedDuration(l10n, seconds),
                icon: icon,
                tone: AppTone.info,
                semanticLabel:
                    '$label: ${l10n.profileTrackedMinutes(seconds ~/ 60)}',
              ),
          ],
        ),
        const SizedBox(height: AppLayout.itemGap),
        AppPanel(
          title: l10n.profileRecentActivity,
          child: ProfileActivityChart(activity: stats.dailyActivity),
        ),
      ],
    );
  }
}

/// Static first-load shapes in the layout the summary will take.
class ProfileActivitySkeleton extends StatelessWidget {
  const ProfileActivitySkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    Widget block(double height) => Container(
      height: height,
      decoration: BoxDecoration(
        color: colors.muted,
        borderRadius: BorderRadius.circular(AppRadius.md + AppSpacing.xs),
      ),
    );
    return Semantics(
      label: context.l10n.commonLoading,
      liveRegion: true,
      child: ExcludeSemantics(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            _ProfileStatTiles(children: [block(104), block(104), block(104)]),
            const SizedBox(height: AppLayout.itemGap),
            block(220),
          ],
        ),
      ),
    );
  }
}

/// Three tiles in one row when they fit. Where only two columns fit, the
/// first tile leads at full width so the grid never leaves an empty cell.
class _ProfileStatTiles extends StatelessWidget {
  const _ProfileStatTiles({required this.children, this.equalHeight = false});

  final List<Widget> children;
  final bool equalHeight;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final columns = AppAdaptiveGrid.columnsFor(
        constraints.maxWidth,
        minTileWidth: 150,
        maxColumns: 3,
      );
      Widget grid(List<Widget> tiles) => AppAdaptiveGrid(
        equalHeight: equalHeight,
        maxColumns: 3,
        minTileWidth: 150,
        children: tiles,
      );
      if (columns != 2) return grid(children);
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          children.first,
          const SizedBox(height: AppLayout.itemGap),
          grid(children.sublist(1)),
        ],
      );
    },
  );
}
