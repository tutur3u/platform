import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/features/inventory/widgets/inventory_product_image.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/l10n/l10n.dart';

bool inventoryStockIsLow(InventoryStockEntry row) =>
    row.amount != null && row.amount! <= row.minAmount;

bool inventoryProductHasLowStock(InventoryProduct product) =>
    product.inventory.any(inventoryStockIsLow);

/// Item list row: name, category and each location's quantity.
///
/// Quantities stay beside their warehouse and unit because unlike units
/// cannot be summed. Prices and secondary metadata belong to item detail.
class InventoryItemRow extends StatelessWidget {
  const InventoryItemRow({
    required this.product,
    this.stockVisible,
    this.onTap,
    this.onLongPress,
    super.key,
  });

  /// Locations listed inline before the row points to the item instead.
  static const maxLocations = 3;
  static const leadingSize = 40.0;
  static const double dividerInset =
      AppLayout.rowHorizontalPadding + leadingSize + AppLayout.rowLeadingGap;

  final InventoryProduct product;

  /// False when the actor lacks view-stock, so the API omitted stock rows;
  /// null while permissions load, when an empty list stays unlabelled.
  final bool? stockVisible;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final type = tokens.typography;
    final l10n = context.l10n;
    final name = product.name?.trim() ?? '';
    final category = product.category?.trim() ?? '';
    final rows = product.inventory;
    final hidden = rows.length - maxLocations;
    final muted = type.small.copyWith(color: c.mutedForeground, height: 1.35);

    final row = ConstrainedBox(
      constraints: const BoxConstraints(minHeight: AppLayout.rowMinHeight + 8),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppLayout.rowHorizontalPadding,
          vertical: AppSpacing.md,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (product.avatarUrl?.isNotEmpty ?? false)
              InventoryProductImage(product: product, size: leadingSize)
            else
              const AppIconTile(icon: LucideIcons.package, size: leadingSize),
            const SizedBox(width: AppLayout.rowLeadingGap),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    name.isEmpty ? l10n.inventoryProductUntitled : name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: type.base.copyWith(
                      color: c.foreground,
                      fontWeight: FontWeight.w600,
                      height: 1.3,
                    ),
                  ),
                  if (category.isNotEmpty || product.archived)
                    Padding(
                      padding: const EdgeInsets.only(top: AppSpacing.xxs),
                      child: Text(
                        [
                          if (category.isNotEmpty) category,
                          if (product.archived) l10n.inventoryItemArchived,
                        ].join(' · '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: muted,
                      ),
                    ),
                  if (stockVisible == false)
                    _StockNote(l10n.inventoryItemStockHidden, style: muted)
                  else if (rows.isEmpty) ...[
                    if (stockVisible == true)
                      _StockNote(l10n.inventoryItemNoStock, style: muted),
                  ] else ...[
                    const SizedBox(height: AppSpacing.xs),
                    for (final entry in rows.take(maxLocations))
                      InventoryLocationLine(entry: entry),
                    if (hidden > 0)
                      Text(
                        l10n.inventoryItemMoreLocations(hidden),
                        style: muted,
                      ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );

    return Semantics(
      button: onTap != null,
      child: Material(
        type: MaterialType.transparency,
        child: onTap == null && onLongPress == null
            ? row
            : InkWell(onTap: onTap, onLongPress: onLongPress, child: row),
      ),
    );
  }
}

class _StockNote extends StatelessWidget {
  const _StockNote(this.text, {required this.style});

  final String text;
  final TextStyle style;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: AppSpacing.sm),
    child: Text(text, style: style),
  );
}

/// "Warehouse · Unit" with its quantity, toned by stock health.
class InventoryLocationLine extends StatelessWidget {
  const InventoryLocationLine({required this.entry, super.key});

  final InventoryStockEntry entry;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final type = tokens.typography;
    final l10n = context.l10n;
    final amount = entry.amount;
    final low = inventoryStockIsLow(entry);
    final tone = amount == null
        ? AppTone.neutral
        : amount <= 0
        ? AppTone.destructive
        : low
        ? AppTone.warning
        : null;
    final warehouse = entry.warehouseName?.trim() ?? '';
    final unit = entry.unitName?.trim() ?? '';
    final location = [
      if (warehouse.isNotEmpty)
        warehouse
      else
        '${l10n.inventoryProductWarehouse} ${entry.warehouseId}',
      if (unit.isNotEmpty)
        unit
      else
        '${l10n.inventoryProductUnit} ${entry.unitId}',
    ].join(' · ');
    final quantity = inventoryStockAmount(context, amount);
    final minimum = inventoryStockAmount(context, entry.minAmount);
    final label = [
      location,
      l10n.inventoryItemAvailable(quantity),
      if (low) ...[
        l10n.inventoryOverviewLowStock,
        '${l10n.inventoryProductMinAmount}: $minimum',
      ],
    ].join(' · ');

    return Semantics(
      container: true,
      excludeSemantics: true,
      label: label,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxs),
        // The amount hugs the trailing edge; long values (large text, tiny
        // fractions) wrap within at most 45% of the line.
        child: LayoutBuilder(
          builder: (context, constraints) => Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  location,
                  style: type.small.copyWith(color: c.foreground, height: 1.35),
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              if (low) ...[
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Icon(
                    LucideIcons.triangleAlert,
                    // Tracks the amount text at large text sizes.
                    size: MediaQuery.textScalerOf(context).scale(14),
                    color: tone!.foreground(c),
                  ),
                ),
                const SizedBox(width: AppSpacing.xs),
              ],
              ConstrainedBox(
                constraints: BoxConstraints(
                  maxWidth: constraints.maxWidth * 0.45,
                ),
                child: Text(
                  quantity,
                  textAlign: TextAlign.end,
                  style: type.small.copyWith(
                    color: tone?.foreground(c) ?? c.foreground,
                    fontWeight: amount == null
                        ? FontWeight.w500
                        : FontWeight.w600,
                    fontFeatures: const [FontFeature.tabularFigures()],
                    height: 1.35,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
