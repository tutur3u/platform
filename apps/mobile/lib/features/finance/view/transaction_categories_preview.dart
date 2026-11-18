part of 'transaction_categories_page.dart';

class _ManageFinanceCardSkeleton extends StatelessWidget {
  const _ManageFinanceCardSkeleton();

  @override
  Widget build(BuildContext context) {
    return const FinancePanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              FinanceSkeletonBlock(width: 52, height: 52, radius: 18),
              shad.Gap(14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    FinanceSkeletonBlock(width: 140, height: 18),
                    shad.Gap(10),
                    FinanceSkeletonBlock(width: 112, height: 28, radius: 999),
                  ],
                ),
              ),
              FinanceSkeletonBlock(width: 88, height: 22),
            ],
          ),
        ],
      ),
    );
  }
}

class _TaxonomyPreviewCard extends StatelessWidget {
  const _TaxonomyPreviewCard({
    required this.name,
    required this.subtitle,
    required this.previewColor,
    required this.icon,
  });

  final String name;
  final String subtitle;
  final Color previewColor;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return FinancePanel(
      padding: const EdgeInsets.all(14),
      radius: 22,
      backgroundColor: FinancePalette.of(context).elevatedPanel,
      borderColor: previewColor.withValues(alpha: 0.18),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: previewColor.withValues(alpha: 0.16),
            ),
            child: Icon(icon, size: 18, color: previewColor),
          ),
          const shad.Gap(12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const shad.Gap(4),
                Text(
                  subtitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.xSmall.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TaxonomyColorSection extends StatelessWidget {
  const _TaxonomyColorSection({
    required this.colorHex,
    required this.previewColor,
    required this.onPickColor,
    required this.onRandomize,
    this.onClear,
  });

  final String colorHex;
  final Color previewColor;
  final VoidCallback onPickColor;
  final VoidCallback onRandomize;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: theme.colorScheme.card,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: theme.colorScheme.border.withValues(alpha: 0.72),
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: previewColor,
                ),
              ),
              const shad.Gap(10),
              Expanded(
                child: Text(
                  colorHex,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.small.copyWith(
                    color: theme.colorScheme.mutedForeground,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ),
        const shad.Gap(10),
        Row(
          children: [
            Expanded(
              child: shad.OutlineButton(
                onPressed: onPickColor,
                child: Center(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(context.l10n.financePickColor),
                  ),
                ),
              ),
            ),
            const shad.Gap(8),
            Expanded(
              child: shad.OutlineButton(
                onPressed: onRandomize,
                child: Center(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(context.l10n.financeRandomizeColor),
                  ),
                ),
              ),
            ),
            if (onClear != null) ...[
              const shad.Gap(8),
              shad.GhostButton(
                onPressed: onClear,
                child: const Icon(Icons.close_rounded, size: 18),
              ),
            ],
          ],
        ),
      ],
    );
  }
}
