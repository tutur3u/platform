part of 'transaction_categories_page.dart';

class _CategoryCard extends StatelessWidget {
  const _CategoryCard({
    required this.category,
    required this.currencyCode,
    required this.showAmounts,
    required this.onEdit,
    required this.onDelete,
  });

  final TransactionCategory category;
  final String currencyCode;
  final bool showAmounts;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final isExpense = category.isExpense != false;
    final baseColor = isExpense
        ? theme.colorScheme.destructive
        : theme.colorScheme.primary;
    final color = parseHex(category.color) ?? baseColor;
    final icon = resolvePlatformIcon(
      category.icon,
      fallback: isExpense ? Icons.arrow_downward : Icons.arrow_upward,
    );

    return FinancePanel(
      radius: 22,
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, size: 18, color: color),
          ),
          const shad.Gap(12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  category.name ?? '-',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.large.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const shad.Gap(6),
                if (category.amount != null) ...[
                  Text(
                    maskFinanceValue(
                      formatCurrency(category.amount!, currencyCode),
                      showAmounts: showAmounts,
                    ),
                    style: theme.typography.textSmall.copyWith(
                      color: color,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const shad.Gap(6),
                ],
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(999),
                        color: color.withValues(alpha: 0.12),
                      ),
                      child: Text(
                        isExpense
                            ? context.l10n.financeExpense
                            : context.l10n.financeIncome,
                        style: theme.typography.xSmall.copyWith(
                          color: color,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    if (category.transactionCount != null) ...[
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 5,
                        ),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(999),
                          color: theme.colorScheme.muted.withValues(
                            alpha: 0.24,
                          ),
                        ),
                        child: Text(
                          '${category.transactionCount} '
                          '${context.l10n.financeTransactionCountShort}',
                          style: theme.typography.xSmall.copyWith(
                            color: theme.colorScheme.mutedForeground,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          shad.GhostButton(
            density: shad.ButtonDensity.icon,
            onPressed: onEdit,
            child: const Icon(Icons.edit_outlined, size: 16),
          ),
          shad.GhostButton(
            density: shad.ButtonDensity.icon,
            onPressed: onDelete,
            child: const Icon(Icons.delete_outline, size: 16),
          ),
        ],
      ),
    );
  }
}

class _TagCard extends StatelessWidget {
  const _TagCard({
    required this.tag,
    required this.currencyCode,
    required this.showAmounts,
    required this.onEdit,
    required this.onDelete,
  });

  final FinanceTag tag;
  final String currencyCode;
  final bool showAmounts;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final color = parseHex(tag.color) ?? theme.colorScheme.primary;

    return FinancePanel(
      radius: 22,
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(Icons.sell_outlined, color: color, size: 18),
          ),
          const shad.Gap(12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tag.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.large.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                if (tag.description != null &&
                    tag.description!.trim().isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      tag.description!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.textSmall.copyWith(
                        color: theme.colorScheme.mutedForeground,
                      ),
                    ),
                  ),
                if (tag.amount != null || tag.transactionCount != null) ...[
                  const shad.Gap(8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      if (tag.amount != null)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 5,
                          ),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(999),
                            color: color.withValues(alpha: 0.12),
                          ),
                          child: Text(
                            maskFinanceValue(
                              formatCurrency(tag.amount!, currencyCode),
                              showAmounts: showAmounts,
                            ),
                            style: theme.typography.xSmall.copyWith(
                              color: color,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      if (tag.transactionCount != null)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 5,
                          ),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(999),
                            color: theme.colorScheme.muted.withValues(
                              alpha: 0.24,
                            ),
                          ),
                          child: Text(
                            '${tag.transactionCount} '
                            '${context.l10n.financeTransactionCountShort}',
                            style: theme.typography.xSmall.copyWith(
                              color: theme.colorScheme.mutedForeground,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          shad.GhostButton(
            density: shad.ButtonDensity.icon,
            onPressed: onEdit,
            child: const Icon(Icons.edit_outlined, size: 16),
          ),
          shad.GhostButton(
            density: shad.ButtonDensity.icon,
            onPressed: onDelete,
            child: const Icon(Icons.delete_outline, size: 16),
          ),
        ],
      ),
    );
  }
}
