import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/l10n/l10n.dart';

class StatsCards extends StatelessWidget {
  const StatsCards({required this.stats, super.key});

  final TimeTrackerStats? stats;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    String duration(int seconds) {
      final hours = seconds ~/ 3600;
      final minutes = seconds ~/ 60 % 60;
      final minuteLabel = '$minutes${l10n.timerMinuteUnitShort}';
      return hours > 0
          ? '$hours${l10n.timerHourUnitShort} $minuteLabel'
          : minuteLabel;
    }

    return AppAdaptiveGrid(
      minTileWidth: 128,
      equalHeight: true,
      children: [
        AppStatTile(
          label: l10n.timerToday,
          value: duration(stats?.todayTime ?? 0),
          icon: LucideIcons.calendar,
          tone: AppTone.primary,
        ),
        AppStatTile(
          label: l10n.timerThisWeek,
          value: duration(stats?.weekTime ?? 0),
          icon: LucideIcons.chartNoAxesColumn,
          tone: AppTone.primary,
        ),
        AppStatTile(
          label: l10n.timerThisMonth,
          value: duration(stats?.monthTime ?? 0),
          icon: LucideIcons.calendarDays,
          tone: AppTone.primary,
        ),
        AppStatTile(
          label: l10n.timerStreak,
          value: l10n.timerDays(stats?.streak ?? 0),
          icon: LucideIcons.flame,
          tone: AppTone.primary,
        ),
      ],
    );
  }
}
