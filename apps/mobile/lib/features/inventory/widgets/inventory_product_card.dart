import 'package:flutter/material.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

bool inventoryProductHasLowStock(InventoryProduct product) => product.inventory
    .any((row) => row.amount != null && row.amount! <= row.minAmount);

/// Keep quantities beside their warehouse/unit; unlike units cannot be summed.
class InventoryProductCard extends StatelessWidget {
  const InventoryProductCard({
    required this.product,
    required this.currency,
    this.onTap,
    super.key,
  });

  final InventoryProduct product;
  final String currency;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final palette = FinancePalette.of(context);
    final l10n = context.l10n;
    final metadata = <String>{
      if (product.manufacturer?.trim().isNotEmpty ?? false)
        product.manufacturer!.trim(),
      if (product.owner?.name.trim().isNotEmpty ?? false)
        product.owner!.name.trim(),
      if (product.category?.trim().isNotEmpty ?? false)
        product.category!.trim(),
      if (product.financeCategory?.name.trim().isNotEmpty ?? false)
        product.financeCategory!.name.trim(),
    };

    return FinancePanel(
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      radius: 18,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            product.name?.trim().isNotEmpty == true
                ? product.name!.trim()
                : l10n.inventoryProductUntitled,
            style: theme.typography.small.copyWith(fontWeight: FontWeight.w700),
          ),
          if (metadata.isNotEmpty) ...[
            const shad.Gap(4),
            Text(
              metadata.join(' • '),
              style: theme.typography.textSmall.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            ),
          ],
          if (product.archived || inventoryProductHasLowStock(product)) ...[
            const shad.Gap(6),
            Text(
              product.archived
                  ? l10n.inventoryAuditEventArchived
                  : l10n.inventoryOverviewLowStock,
              style: theme.typography.textSmall.copyWith(
                color: product.archived
                    ? theme.colorScheme.mutedForeground
                    : palette.negative,
              ),
            ),
          ],
          if (product.inventory.isEmpty) ...[
            const shad.Gap(8),
            Text(l10n.inventoryStockNoRows, style: theme.typography.textSmall),
          ],
          for (final row in product.inventory) ...[
            const shad.Gap(10),
            _StockRow(row: row, currency: currency),
          ],
        ],
      ),
    );
  }
}

class _StockRow extends StatelessWidget {
  const _StockRow({required this.row, required this.currency});

  final InventoryStockEntry row;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final low = row.amount != null && row.amount! <= row.minAmount;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          [
            row.warehouseName,
            row.unitName,
          ].whereType<String>().where((value) => value.isNotEmpty).join(' • '),
          style: theme.typography.textSmall.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
        const shad.Gap(2),
        Text(
          context.l10n.inventoryProductAvailableSummary(
            inventoryStockAmount(context, row.amount),
            formatCurrency(row.price, currency),
          ),
          style: theme.typography.textSmall.copyWith(
            color: low
                ? FinancePalette.of(context).negative
                : theme.colorScheme.mutedForeground,
          ),
        ),
      ],
    );
  }
}
