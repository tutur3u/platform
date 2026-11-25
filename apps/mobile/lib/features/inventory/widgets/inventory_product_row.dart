import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/features/inventory/inventory_stock_summary.dart';
import 'package:mobile/features/inventory/widgets/inventory_product_image.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/l10n/l10n.dart';

/// Leading image of an item, or the package glyph when it has none.
class InventoryProductThumb extends StatelessWidget {
  const InventoryProductThumb({
    required this.product,
    this.size = InventoryProductRow.leadingSize,
    super.key,
  });

  final InventoryProduct product;
  final double size;

  @override
  Widget build(BuildContext context) => product.avatarUrl?.isNotEmpty ?? false
      ? ClipRRect(
          borderRadius: BorderRadius.circular(size * 0.22),
          child: InventoryProductImage(product: product, size: size),
        )
      : AppIconTile(icon: LucideIcons.package, size: size);
}

/// Label, icon and tone of an item's stock roll-up.
({String label, IconData icon, AppTone tone}) inventoryStockBadge(
  BuildContext context,
  InventoryStockSummary summary,
) {
  final l10n = context.l10n;
  final quantity = summary.total == null
      ? null
      : [
          inventoryStockAmount(context, summary.total),
          if (summary.unit?.isNotEmpty ?? false) summary.unit!,
        ].join(' ');
  return switch (summary.state) {
    InventoryStockState.hidden => (
      label: l10n.inventoryItemStockHidden,
      icon: LucideIcons.eyeOff,
      tone: AppTone.neutral,
    ),
    InventoryStockState.none => (
      label: l10n.inventoryItemNoStock,
      icon: LucideIcons.packageOpen,
      tone: AppTone.neutral,
    ),
    InventoryStockState.unlimited => (
      label: l10n.inventoryStockUnlimited,
      icon: LucideIcons.infinity,
      tone: AppTone.info,
    ),
    InventoryStockState.out => (
      label: l10n.inventoryStockOut,
      icon: LucideIcons.packageX,
      tone: AppTone.destructive,
    ),
    InventoryStockState.low => (
      label: quantity == null
          ? l10n.inventoryOverviewLowStock
          : l10n.inventoryStockLowQuantity(quantity),
      icon: LucideIcons.triangleAlert,
      tone: AppTone.warning,
    ),
    InventoryStockState.inStock => (
      label: quantity ?? l10n.inventoryStockIn,
      icon: LucideIcons.packageCheck,
      tone: AppTone.success,
    ),
  };
}

/// Price, or the lowest price when locations differ.
String? inventoryPriceLabel(
  BuildContext context,
  InventoryStockSummary summary,
  String currency,
) {
  final price = summary.minPrice;
  if (price == null) return null;
  final text = formatCurrency(price, currency);
  return summary.hasPriceRange ? context.l10n.inventoryPriceFrom(text) : text;
}

/// Items list row: image, name, category, stock roll-up and price.
class InventoryProductRow extends StatelessWidget {
  const InventoryProductRow({
    required this.product,
    required this.currency,
    this.stockVisible,
    this.selected = false,
    this.onTap,
    this.onLongPress,
    super.key,
  });

  static const leadingSize = 44.0;
  static const double dividerInset =
      AppLayout.rowHorizontalPadding + leadingSize + AppLayout.rowLeadingGap;

  final InventoryProduct product;
  final String currency;

  /// False when the actor lacks view-stock, so the API omitted stock rows;
  /// null while permissions load.
  final bool? stockVisible;
  final bool selected;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final c = AppTokens.of(context).colorScheme;
    final name = product.name?.trim() ?? '';
    final summary = InventoryStockSummary.of(
      product,
      stockVisible: stockVisible,
    );
    final badge = inventoryStockBadge(context, summary);
    final subtitle = [
      if (product.category?.trim().isNotEmpty ?? false)
        product.category!.trim(),
      if (product.manufacturer?.trim().isNotEmpty ?? false)
        product.manufacturer!.trim(),
      if (product.archived) l10n.inventoryItemArchived,
    ].join(' · ');
    final price = stockVisible == false
        ? null
        : inventoryPriceLabel(context, summary, currency);
    final locations = summary.locations > 1
        ? l10n.inventoryItemLocations(summary.locations)
        : null;
    final title = name.isEmpty ? l10n.inventoryProductUntitled : name;
    return AppRichRow(
      title: title,
      subtitle: subtitle.isEmpty ? null : subtitle,
      selected: selected,
      onTap: onTap,
      onLongPress: onLongPress,
      semanticLabel: [
        title,
        if (subtitle.isNotEmpty) subtitle,
        badge.label,
        ?locations,
        ?price,
      ].join(', '),
      leading: InventoryProductThumb(product: product),
      meta: [
        AppMetaItem(
          label: badge.label,
          icon: badge.icon,
          color: badge.tone == AppTone.neutral
              ? null
              : badge.tone.foreground(c),
        ),
        if (locations != null)
          AppMetaItem(label: locations, icon: LucideIcons.warehouse),
      ],
      trailing: price == null ? null : Text(price),
    );
  }
}
