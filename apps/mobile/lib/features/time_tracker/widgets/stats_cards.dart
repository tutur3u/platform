import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class StatsCards extends StatelessWidget {
  const StatsCards({required this.stats, super.key});

  final TimeTrackerStats? stats;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return Padding(
      padding: EdgeInsets.symmetric(
        horizontal: ResponsivePadding.horizontal(context.deviceClass),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          const spacing = 8.0;
          const fallbackTotalWidth = 320.0;
          const minCardWidth = 140.0;
          final baseWidth =
              constraints.hasBoundedWidth && constraints.maxWidth.isFinite
              ? constraints.maxWidth
              : fallbackTotalWidth;
          final availableWidth = math.max(0, baseWidth - spacing);
          final cardWidth = math.min(
            baseWidth,
            math.max(minCardWidth, availableWidth / 2),
          );

          return Wrap(
            spacing: spacing,
            runSpacing: spacing,
            children: [
              SizedBox(
                width: cardWidth,
                child: _StatCard(
                  label: l10n.timerToday,
                  value: _formatSeconds(stats?.todayTime ?? 0),
                  icon: shad.LucideIcons.calendar,
                  iconColor: theme.colorScheme.primary,
                  iconBackgroundColor: theme.colorScheme.primary.withValues(
                    alpha: 0.16,
                  ),
                ),
              ),
              SizedBox(
                width: cardWidth,
                child: _StatCard(
                  label: l10n.timerThisWeek,
                  value: _formatSeconds(stats?.weekTime ?? 0),
                  icon: shad.LucideIcons.trendingUp,
                  iconColor: const Color(0xFF16A34A),
                  iconBackgroundColor: const Color(0xFF16A34A).withValues(
                    alpha: 0.16,
                  ),
                ),
              ),
              SizedBox(
                width: cardWidth,
                child: _StatCard(
                  label: l10n.timerThisMonth,
                  value: _formatSeconds(stats?.monthTime ?? 0),
                  icon: shad.LucideIcons.zap,
                  iconColor: const Color(0xFF7C3AED),
                  iconBackgroundColor: const Color(0xFF7C3AED).withValues(
                    alpha: 0.16,
                  ),
                ),
              ),
              SizedBox(
                width: cardWidth,
                child: _StatCard(
                  label: l10n.timerStreak,
                  value: l10n.timerDays(stats?.streak ?? 0),
                  icon: shad.LucideIcons.clock,
                  iconColor: theme.colorScheme.destructive,
                  iconBackgroundColor: theme.colorScheme.destructive.withValues(
                    alpha: 0.16,
                  ),
                ),
              ),
            ],
          );
        },
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
    required this.icon,
    required this.iconColor,
    required this.iconBackgroundColor,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color iconColor;
  final Color iconBackgroundColor;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return shad.Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Container(
                width: 28,
                height: 28,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: iconBackgroundColor,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Icon(
                  icon,
                  size: 16,
                  color: iconColor,
                ),
              ),
            ),
            Text(
              value,
              style: theme.typography.p.copyWith(
                fontWeight: FontWeight.w700,
              ),
              textAlign: TextAlign.center,
            ),
            const shad.Gap(2),
            Text(
              label,
              style: theme.typography.textSmall.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}
