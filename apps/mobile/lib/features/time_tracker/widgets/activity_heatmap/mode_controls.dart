part of 'package:mobile/features/time_tracker/widgets/activity_heatmap.dart';

class _ViewModeSelector extends StatelessWidget {
  const _ViewModeSelector({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = AppTokens.of(context);
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
            const AppGap(AppSpacing.xs),
            Icon(
              LucideIcons.chevronDown,
              size: 12,
              color: theme.colorScheme.mutedForeground,
            ),
          ],
        ),
      ),
    );
  }
}

class _LegendRow extends StatelessWidget {
  const _LegendRow({required this.maxDuration});

  final int maxDuration;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = AppTokens.of(context);

    return Row(
      children: [
        Text(
          l10n.timerHeatmapLegendLess,
          style: theme.typography.small.copyWith(
            color: theme.colorScheme.mutedForeground,
          ),
        ),
        const AppGap(AppSpacing.sm),
        ...List.generate(4, (index) {
          final intensity = index + 1;
          return Padding(
            padding: const EdgeInsets.only(right: 4),
            child: _HeatCell(
              duration: (maxDuration * intensity) ~/ 4,
              maxDuration: maxDuration,
              size: 10,
            ),
          );
        }),
        const AppGap(AppSpacing.xxs),
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
