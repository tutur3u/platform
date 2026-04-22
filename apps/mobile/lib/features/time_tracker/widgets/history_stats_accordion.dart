import 'package:flutter/material.dart';
import 'package:mobile/data/models/time_tracking/period_stats.dart';
import 'package:mobile/features/time_tracker/utils/category_color.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class HistoryStatsAccordion extends StatelessWidget {
  const HistoryStatsAccordion({
    required this.isOpen,
    required this.onToggle,
    required this.stats,
    required this.isLoading,
    super.key,
  });

  final bool isOpen;
  final VoidCallback onToggle;
  final TimeTrackingPeriodStats? stats;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return shad.Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            InkWell(
              onTap: onToggle,
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
                child: Row(
                  children: [
                    Icon(
                      Icons.bar_chart,
                      size: 16,
                      color: theme.colorScheme.mutedForeground,
                    ),
                    const shad.Gap(8),
                    Expanded(
                      child: Text(
                        l10n.timerHistoryOverview,
                        style: theme.typography.small.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    Icon(
                      isOpen ? Icons.expand_less : Icons.expand_more,
                      size: 18,
                      color: theme.colorScheme.mutedForeground,
                    ),
                  ],
                ),
              ),
            ),
            AnimatedCrossFade(
              firstChild: const SizedBox.shrink(),
              secondChild: Padding(
                padding: const EdgeInsets.only(top: 8),
                child: _Body(stats: stats, isLoading: isLoading),
              ),
              crossFadeState: isOpen
                  ? CrossFadeState.showSecond
                  : CrossFadeState.showFirst,
              duration: const Duration(milliseconds: 180),
            ),
          ],
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.stats, required this.isLoading});

  final TimeTrackingPeriodStats? stats;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    if (isLoading) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.symmetric(vertical: 12),
          child: shad.CircularProgressIndicator(),
        ),
      );
    }

    final data = stats;
    if (data == null) {
      return Text(
        l10n.commonSomethingWentWrong,
        style: theme.typography.small.copyWith(
          color: theme.colorScheme.mutedForeground,
        ),
      );
    }

    final totalDuration = data.totalDuration;
    final breakdown = data.breakdown;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: _SummaryStat(
                label: l10n.timerHistoryTotalTime,
                value: _formatSeconds(totalDuration),
              ),
            ),
            const shad.Gap(8),
            Expanded(
              child: _SummaryStat(
                label: l10n.timerTotalSessions,
                value: '${data.sessionCount}',
              ),
            ),
          ],
        ),
        if (breakdown.isNotEmpty) ...[
          const shad.Gap(12),
          ...breakdown.map((entry) {
            final percent = totalDuration > 0
                ? entry.duration / totalDuration
                : 0.0;
            final fillColor = resolveTimeTrackingCategoryColor(
              context,
              entry.color,
              fallback: theme.colorScheme.primary,
            );
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          entry.name,
                          style: theme.typography.small,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const shad.Gap(8),
                      Text(
                        '${(percent * 100).toStringAsFixed(0)}%',
                        style: theme.typography.small.copyWith(
                          color: theme.colorScheme.mutedForeground,
                        ),
                      ),
                      const shad.Gap(8),
                      Text(
                        _formatSeconds(entry.duration),
                        style: theme.typography.small.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                  const shad.Gap(6),
                  _CategoryShareBar(
                    value: percent.clamp(0, 1),
                    fillColor: fillColor,
                    trackColor: theme.colorScheme.muted,
                  ),
                ],
              ),
            );
          }),
        ],
      ],
    );
  }

  String _formatSeconds(int totalSeconds) {
    if (totalSeconds < 60) {
      return '${totalSeconds}s';
    }
    final hours = totalSeconds ~/ 3600;
    final minutes = (totalSeconds % 3600) ~/ 60;
    if (hours > 0) return '${hours}h ${minutes}m';
    return '${minutes}m';
  }
}

class _CategoryShareBar extends StatelessWidget {
  const _CategoryShareBar({
    required this.value,
    required this.fillColor,
    required this.trackColor,
  });

  final double value;
  final Color fillColor;
  final Color trackColor;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: SizedBox(
        height: 6,
        child: Stack(
          fit: StackFit.expand,
          children: [
            ColoredBox(color: trackColor),
            Align(
              alignment: Alignment.centerLeft,
              child: FractionallySizedBox(
                widthFactor: value,
                heightFactor: 1,
                child: ColoredBox(color: fillColor),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SummaryStat extends StatelessWidget {
  const _SummaryStat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: theme.colorScheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: theme.typography.small.copyWith(fontWeight: FontWeight.w700),
          ),
          const shad.Gap(2),
          Text(
            label,
            style: theme.typography.small.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}
