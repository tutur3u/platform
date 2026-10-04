import 'package:flutter/material.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Short summaries share a row; longer quantities retain the full card width.
class InventoryLowStockCard extends StatelessWidget {
  const InventoryLowStockCard({required this.product, super.key});

  final InventoryLowStockProduct product;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return FinancePanel(
      child: LayoutBuilder(
        builder: (context, constraints) => Wrap(
          alignment: WrapAlignment.spaceBetween,
          spacing: 12,
          runSpacing: 8,
          children: [
            ConstrainedBox(
              constraints: BoxConstraints(maxWidth: constraints.maxWidth),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product.productName ?? 'Untitled product',
                    style: theme.typography.large.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const shad.Gap(4),
                  Text(
                    [
                          product.ownerName,
                          product.categoryName,
                          product.warehouseName,
                          product.unitName,
                        ]
                        .whereType<String>()
                        .where((name) => name.isNotEmpty)
                        .join(' • '),
                  ),
                ],
              ),
            ),
            ConstrainedBox(
              constraints: BoxConstraints(maxWidth: constraints.maxWidth),
              child: Text(
                [
                  inventoryStockAmount(context, product.amount),
                  if (product.minAmount == null)
                    context.l10n.inventoryStockHealthUnknown
                  else
                    inventoryStockAmount(context, product.minAmount),
                ].join(' / '),
                style: theme.typography.large.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
