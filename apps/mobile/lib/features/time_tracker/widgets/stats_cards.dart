import 'package:flutter/material.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/l10n/l10n.dart';

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
          const SizedBox(width: 8),
          _StatCard(
            label: l10n.timerThisWeek,
            value: _formatSeconds(stats?.weekTime ?? 0),
          ),
          const SizedBox(width: 8),
          _StatCard(
            label: l10n.timerThisMonth,
            value: _formatSeconds(stats?.monthTime ?? 0),
          ),
          const SizedBox(width: 8),
          _StatCard(
            label: l10n.timerStreak,
            value: l10n.timerDays(stats?.streak ?? 0),
            icon: Icons.local_fire_department,
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
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;

    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Icon(icon, size: 18, color: colorScheme.tertiary),
                ),
              Text(
                value,
                style: textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 2),
              Text(
                label,
                style: textTheme.labelSmall?.copyWith(
                  color: colorScheme.onSurfaceVariant,
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
