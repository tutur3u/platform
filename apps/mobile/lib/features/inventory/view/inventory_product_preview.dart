part of 'inventory_product_editor_page.dart';

class _InventoryDraftPreviewCard extends StatelessWidget {
  const _InventoryDraftPreviewCard({
    required this.title,
    required this.subtitle,
    required this.amountLabel,
    required this.stockRowsLabel,
    this.ownerLabel,
    this.categoryLabel,
    this.financeCategoryLabel,
  });

  final String title;
  final String subtitle;
  final String amountLabel;
  final String stockRowsLabel;
  final String? ownerLabel;
  final String? categoryLabel;
  final String? financeCategoryLabel;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final accent = FinancePalette.of(context).accent;
    final stockCountLabel = [
      stockRowsLabel,
      context.l10n.inventoryProductInventory,
    ].join(' ');

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: accent.withValues(alpha: 0.18)),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            accent.withValues(alpha: 0.18),
            FinancePalette.of(context).panel,
            FinancePalette.of(context).elevatedPanel,
          ],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          LayoutBuilder(
            builder: (context, constraints) {
              final compact = constraints.maxWidth < 390;
              final identity = Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: accent.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(
                      Icons.inventory_2_outlined,
                      size: 20,
                      color: accent,
                    ),
                  ),
                  const shad.Gap(12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: theme.typography.small.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        if (subtitle.trim().isNotEmpty) ...[
                          const shad.Gap(4),
                          Text(
                            subtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.typography.xSmall.copyWith(
                              color: theme.colorScheme.mutedForeground,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              );
              final value = Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    amountLabel,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.typography.large.copyWith(
                      fontWeight: FontWeight.w900,
                      color: accent,
                      height: 1.05,
                    ),
                  ),
                  const shad.Gap(2),
                  _InventoryPreviewChip(
                    icon: Icons.layers_outlined,
                    label: stockCountLabel,
                    color: theme.colorScheme.mutedForeground,
                  ),
                ],
              );

              if (compact) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    identity,
                    const shad.Gap(12),
                    Align(alignment: Alignment.centerRight, child: value),
                  ],
                );
              }

              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: identity),
                  const shad.Gap(12),
                  value,
                ],
              );
            },
          ),
          const shad.Gap(10),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              if (ownerLabel?.trim().isNotEmpty ?? false)
                _InventoryPreviewChip(
                  icon: Icons.people_outline_rounded,
                  label: ownerLabel!,
                  color: theme.colorScheme.foreground,
                ),
              if (categoryLabel?.trim().isNotEmpty ?? false)
                _InventoryPreviewChip(
                  icon: Icons.category_outlined,
                  label: categoryLabel!,
                  color: accent,
                ),
              if (financeCategoryLabel?.trim().isNotEmpty ?? false)
                _InventoryPreviewChip(
                  icon: Icons.account_balance_wallet_outlined,
                  label: financeCategoryLabel!,
                  color: theme.colorScheme.mutedForeground,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _InventoryPreviewChip extends StatelessWidget {
  const _InventoryPreviewChip({
    required this.icon,
    required this.label,
    required this.color,
  });

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const shad.Gap(4),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 148),
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: shad.Theme.of(context).typography.xSmall.copyWith(
                color: color,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
