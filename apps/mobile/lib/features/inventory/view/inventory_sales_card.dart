part of 'inventory_sales_page.dart';

class _InventorySaleCard extends StatelessWidget {
  const _InventorySaleCard({
    required this.sale,
    required this.currency,
    required this.onTap,
    required this.pendingCreate,
  });

  final InventorySaleSummary sale;
  final String currency;
  final VoidCallback? onTap;
  final bool pendingCreate;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final title = sale.notice?.trim().isNotEmpty == true
        ? sale.notice!.trim()
        : context.l10n.inventorySalesFallbackTitle;
    final metadata = [
      if (sale.walletName?.isNotEmpty ?? false) sale.walletName!,
      if (sale.categoryName?.isNotEmpty ?? false) sale.categoryName!,
      context.l10n.inventorySalesItemsCount(sale.itemsCount),
    ].join(' • ');
    final creator = sale.creatorName?.trim();
    final customer = sale.customerName?.trim();

    return FinancePanel(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  title,
                  style: theme.typography.large.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const shad.Gap(12),
              Text(
                pendingCreate ? '—' : formatCurrency(sale.paidAmount, currency),
                style: theme.typography.large.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          if (metadata.isNotEmpty) ...[
            const shad.Gap(8),
            Text(
              metadata,
              style: theme.typography.textSmall.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            ),
          ],
          const shad.Gap(10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (sale.period != null)
                _SaleBadge(
                  label: sale.period!.name,
                  color: theme.colorScheme.primary,
                ),
              if (creator != null && creator.isNotEmpty)
                _SaleBadge(
                  label: context.l10n.inventorySalesCreatorBadge(creator),
                  color: FinancePalette.of(context).accent,
                ),
              ...sale.owners
                  .where((owner) => owner.trim().isNotEmpty)
                  .map(
                    (owner) => _SaleBadge(
                      label: owner.trim(),
                      color: FinancePalette.of(context).positive,
                    ),
                  ),
              if (customer != null && customer.isNotEmpty)
                _SaleBadge(
                  label: customer,
                  color: theme.colorScheme.mutedForeground,
                ),
            ],
          ),
          const shad.Gap(10),
          Row(
            children: [
              Expanded(
                child: Text(
                  DateFormat.yMMMd().add_jm().format(
                    sale.createdAt?.toLocal() ?? DateTime.now(),
                  ),
                  style: theme.typography.xSmall.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
              ),
              Icon(
                Icons.chevron_right_rounded,
                size: 18,
                color: theme.colorScheme.mutedForeground,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
