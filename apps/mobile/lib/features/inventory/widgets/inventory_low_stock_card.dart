import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/l10n/l10n.dart';

class InventoryLowStockCard extends StatelessWidget {
  const InventoryLowStockCard({
    required this.product,
    this.onAdjustStock,
    super.key,
  });

  final InventoryLowStockProduct product;
  final VoidCallback? onAdjustStock;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final location = [
      product.warehouseName,
      product.unitName,
    ].whereType<String>().where((name) => name.isNotEmpty).join(' · ');
    return AppGroupedRow(
      leading: const AppIconTile(
        icon: LucideIcons.packageMinus,
        tone: AppTone.warning,
      ),
      title: Text(product.productName ?? l10n.inventoryProductUntitled),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (location.isNotEmpty) Text(location),
          Text(
            [
              inventoryStockAmount(context, product.amount),
              if (product.minAmount == null)
                l10n.inventoryStockHealthUnknown
              else
                inventoryStockAmount(context, product.minAmount),
            ].join(' / '),
          ),
        ],
      ),
      onTap: onAdjustStock,
      showChevron: onAdjustStock != null,
    );
  }
}
