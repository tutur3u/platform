part of 'package:mobile/features/time_tracker/widgets/activity_heatmap.dart';

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
