part of 'inventory_sales_page.dart';

class _InventorySaleCard extends StatelessWidget {
  const _InventorySaleCard({
    required this.sale,
    required this.onTap,
    required this.pendingCreate,
  });

  final InventorySaleSummary sale;
  final VoidCallback? onTap;
  final bool pendingCreate;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final title = sale.notice?.trim().isNotEmpty == true
        ? sale.notice!.trim()
        : l10n.inventorySalesFallbackTitle;
    final created = sale.createdAt?.toLocal();
    final metadata = [
      if (sale.customerName?.trim() case final name? when name.isNotEmpty) name,
      if (created != null)
        DateFormat.MMMd(l10n.localeName).add_jm().format(created),
      l10n.inventorySalesItemsCount(sale.itemsCount),
    ].join(' · ');
    final amount = switch ((pendingCreate, sale.currency)) {
      (true, _) => null,
      (false, final String currency) when currency.isNotEmpty => formatCurrency(
        sale.paidAmount,
        currency,
      ),
      _ => '${sale.paidAmount} (${l10n.inventoryStockHealthUnknown})',
    };
    return AppGroupedRow(
      leading: const AppIconTile(icon: LucideIcons.receipt, tone: AppTone.info),
      title: Text(title),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(metadata),
          if (amount != null)
            Text(amount, style: const TextStyle(fontWeight: FontWeight.w700)),
        ],
      ),
      onTap: onTap,
      showChevron: onTap != null,
    );
  }
}
