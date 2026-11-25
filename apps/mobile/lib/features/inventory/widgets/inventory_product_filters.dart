import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/inventory/inventory_stock_movement.dart';
import 'package:mobile/features/inventory/inventory_stock_summary.dart';
import 'package:mobile/l10n/l10n.dart';

String inventoryStockFilterLabel(
  BuildContext context,
  InventoryStockFilter filter,
) {
  final l10n = context.l10n;
  return switch (filter) {
    InventoryStockFilter.any => l10n.inventoryFilterAnyStock,
    InventoryStockFilter.inStock => l10n.inventoryStockIn,
    InventoryStockFilter.low => l10n.inventoryFilterLowStock,
    InventoryStockFilter.out => l10n.inventoryStockOut,
  };
}

String inventorySortLabel(BuildContext context, InventoryProductSort sort) {
  final l10n = context.l10n;
  return switch (sort) {
    InventoryProductSort.newest => l10n.inventorySortNewest,
    InventoryProductSort.oldest => l10n.inventorySortOldest,
    InventoryProductSort.nameAsc => l10n.inventorySortNameAsc,
    InventoryProductSort.nameDesc => l10n.inventorySortNameDesc,
  };
}

/// Status pills, then the category, warehouse and stock pickers and the
/// sort button. Each picker shows its current choice and highlights while
/// it narrows the list.
class InventoryProductFilters extends StatelessWidget {
  const InventoryProductFilters({
    required this.status,
    required this.onStatus,
    required this.sort,
    required this.onSort,
    required this.stock,
    required this.onStock,
    required this.onCategory,
    required this.onWarehouse,
    this.categoryLabel,
    this.warehouseLabel,
    this.showStock = true,
    super.key,
  });

  final String status;
  final ValueChanged<String> onStatus;
  final InventoryProductSort sort;
  final VoidCallback onSort;
  final InventoryStockFilter stock;
  final VoidCallback onStock;
  final VoidCallback onCategory;
  final VoidCallback onWarehouse;

  /// Selected category or warehouse name; null when not filtering.
  final String? categoryLabel;
  final String? warehouseLabel;

  /// False when the actor cannot see stock, so stock filters do nothing.
  final bool showStock;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppFilterBar<String>(
          options: [
            AppFilterOption(value: 'active', label: l10n.commonActive),
            AppFilterOption(value: 'archived', label: l10n.commonArchived),
            AppFilterOption(value: 'all', label: l10n.commonAll),
          ],
          selected: status,
          onSelected: onStatus,
        ),
        const SizedBox(height: AppSpacing.sm),
        AppHorizontalScrollView(
          child: Row(
            children: [
              AppFilterButton(
                label: categoryLabel ?? l10n.inventoryFilterCategory,
                icon: LucideIcons.tag,
                menu: true,
                active: categoryLabel != null,
                onPressed: onCategory,
              ),
              if (showStock) ...[
                const SizedBox(width: AppSpacing.sm),
                AppFilterButton(
                  label: warehouseLabel ?? l10n.inventoryFilterWarehouse,
                  icon: LucideIcons.warehouse,
                  menu: true,
                  active: warehouseLabel != null,
                  onPressed: onWarehouse,
                ),
                const SizedBox(width: AppSpacing.sm),
                AppFilterButton(
                  label: stock == InventoryStockFilter.any
                      ? l10n.inventoryFilterStock
                      : inventoryStockFilterLabel(context, stock),
                  icon: LucideIcons.packageSearch,
                  menu: true,
                  active: stock != InventoryStockFilter.any,
                  onPressed: onStock,
                ),
              ],
              const SizedBox(width: AppSpacing.sm),
              AppFilterButton(
                label: inventorySortLabel(context, sort),
                onPressed: onSort,
                active: sort != InventoryProductSort.newest,
              ),
            ],
          ),
        ),
      ],
    );
  }
}
