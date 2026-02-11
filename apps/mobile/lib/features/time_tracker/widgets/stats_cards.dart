import 'package:flutter/material.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class StatsCards extends StatelessWidget {
  const StatsCards({required this.stats, super.key});

  final TimeTrackerStats? stats;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          _StatCard(
            label: l10n.timerToday,
            value: _formatSeconds(stats?.todayTime ?? 0),
          ),
          const shad.Gap(8),
          _StatCard(
            label: l10n.timerThisWeek,
            value: _formatSeconds(stats?.weekTime ?? 0),
          ),
          const shad.Gap(8),
          _StatCard(
            label: l10n.timerThisMonth,
            value: _formatSeconds(stats?.monthTime ?? 0),
          ),
          const shad.Gap(8),
          _StatCard(
            label: l10n.timerStreak,
            value: l10n.timerDays(stats?.streak ?? 0),
            icon: shad.LucideIcons.flame,
          ),
        ],
      ),
    );
  }

  String _formatSeconds(int totalSeconds) {
    final hours = totalSeconds ~/ 3600;
    final minutes = (totalSeconds % 3600) ~/ 60;
    if (hours > 0) return '${hours}h ${minutes}m';
    return '${minutes}m';
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.label,
    required this.value,
    this.icon,
  });

  final String label;
  final String value;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Expanded(
      child: shad.Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Icon(
                    icon,
                    size: 18,
                    color: theme.colorScheme.secondary,
                  ),
                ),
              Text(
                value,
                style: theme.typography.small.copyWith(
                  fontWeight: FontWeight.w700,
                ),
                textAlign: TextAlign.center,
              ),
              const shad.Gap(2),
              Text(
                label,
                style: theme.typography.small.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
