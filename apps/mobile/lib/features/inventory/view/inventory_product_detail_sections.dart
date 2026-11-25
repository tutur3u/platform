import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/models/inventory/inventory_stock_movement.dart';
import 'package:mobile/features/inventory/inventory_stock_summary.dart';
import 'package:mobile/features/inventory/widgets/inventory_product_row.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/l10n/l10n.dart';

/// Image, name, classification and stock state, with the manager actions.
class InventoryDetailHeader extends StatelessWidget {
  const InventoryDetailHeader({
    required this.product,
    required this.summary,
    this.onEdit,
    this.onAdjustStock,
    this.onDelete,
    super.key,
  });

  final InventoryProduct product;
  final InventoryStockSummary summary;
  final VoidCallback? onEdit;
  final VoidCallback? onAdjustStock;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final type = tokens.typography;
    final l10n = context.l10n;
    final name = product.name?.trim() ?? '';
    final badge = inventoryStockBadge(context, summary);
    final classification = [
      if (product.category?.trim().isNotEmpty ?? false)
        product.category!.trim(),
      if (product.manufacturer?.trim().isNotEmpty ?? false)
        product.manufacturer!.trim(),
    ].join(' · ');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            InventoryProductThumb(product: product, size: 72),
            const SizedBox(width: AppSpacing.lg),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name.isEmpty ? l10n.inventoryProductUntitled : name,
                    style: type.h4.copyWith(color: c.foreground, height: 1.25),
                  ),
                  if (classification.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      classification,
                      style: type.small.copyWith(color: c.mutedForeground),
                    ),
                  ],
                  const SizedBox(height: AppSpacing.sm),
                  Wrap(
                    spacing: AppSpacing.sm,
                    runSpacing: AppSpacing.xs,
                    children: [
                      AppMetaItem(
                        label: badge.label,
                        icon: badge.icon,
                        color: badge.tone == AppTone.neutral
                            ? null
                            : badge.tone.foreground(c),
                      ),
                      if (product.archived)
                        AppMetaItem(
                          label: l10n.inventoryItemArchived,
                          icon: LucideIcons.archive,
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
        if (onEdit != null || onAdjustStock != null || onDelete != null) ...[
          const SizedBox(height: AppSpacing.lg),
          Row(
            children: [
              if (onEdit != null)
                Expanded(
                  child: AppButton.primary(
                    onPressed: onEdit,
                    leading: const Icon(LucideIcons.pencil, size: 16),
                    child: Text(l10n.commonEdit),
                  ),
                ),
              if (onAdjustStock != null) ...[
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: AppButton.outline(
                    onPressed: onAdjustStock,
                    leading: const Icon(LucideIcons.packagePlus, size: 16),
                    child: Text(l10n.inventoryAdjustStock),
                  ),
                ),
              ],
              if (onDelete != null) ...[
                const SizedBox(width: AppSpacing.sm),
                AppIconButton(
                  icon: const Icon(LucideIcons.trash2),
                  tooltip: l10n.commonDelete,
                  variant: AppButtonVariant.outline,
                  onPressed: onDelete,
                ),
              ],
            ],
          ),
        ],
      ],
    );
  }
}

/// On-hand, location count and price at a glance.
class InventoryDetailFacts extends StatelessWidget {
  const InventoryDetailFacts({
    required this.summary,
    required this.currency,
    super.key,
  });

  final InventoryStockSummary summary;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final onHand = switch (summary.state) {
      InventoryStockState.hidden || InventoryStockState.none => '—',
      InventoryStockState.unlimited => l10n.inventoryStockUnlimited,
      _ when summary.total != null => [
        inventoryStockAmount(context, summary.total),
        if (summary.unit?.isNotEmpty ?? false) summary.unit!,
      ].join(' '),
      _ => l10n.inventoryItemLocations(summary.locations),
    };
    return AppStatStrip(
      items: [
        AppStatStripItem(label: l10n.inventoryDetailOnHand, value: onHand),
        AppStatStripItem(
          label: l10n.inventoryDetailLocations,
          value: '${summary.locations}',
        ),
        AppStatStripItem(
          label: l10n.inventoryDetailPrice,
          value: inventoryPriceLabel(context, summary, currency) ?? '—',
        ),
      ],
    );
  }
}

/// One row per warehouse and unit, toned by its stock health.
class InventoryDetailStock extends StatelessWidget {
  const InventoryDetailStock({
    required this.rows,
    required this.currency,
    super.key,
  });

  final List<InventoryStockEntry> rows;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppSectionHeader(
          title: l10n.inventoryDetailStock,
          count: rows.isEmpty ? null : rows.length,
        ),
        AppGroupedCard(
          children: [
            if (rows.isEmpty)
              AppStateMessage.inline(
                icon: LucideIcons.packageOpen,
                title: l10n.inventoryItemNoStock,
              )
            else
              for (final row in rows) _StockRow(row: row, currency: currency),
          ],
        ),
      ],
    );
  }
}

/// One warehouse and unit; unknown names fall back to their ids, as a
/// queued edit can reference a location the catalog has not loaded.
class _StockRow extends StatelessWidget {
  const _StockRow({required this.row, required this.currency});

  final InventoryStockEntry row;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final amount = row.amount;
    final low = inventoryStockIsLow(row);
    final tone = amount == null
        ? AppTone.info
        : amount <= 0
        ? AppTone.destructive
        : low
        ? AppTone.warning
        : AppTone.success;
    final warehouse = row.warehouseName?.trim() ?? '';
    final unit = row.unitName?.trim() ?? '';
    final warehouseLabel = warehouse.isEmpty
        ? '${l10n.inventoryProductWarehouse} ${row.warehouseId}'
        : warehouse;
    final unitLabel = unit.isEmpty
        ? '${l10n.inventoryProductUnit} ${row.unitId}'
        : unit;
    final quantity = inventoryStockAmount(context, amount);
    final minimum = inventoryStockAmount(context, row.minAmount);
    final label = [
      warehouseLabel,
      unitLabel,
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
      child: AppGroupedRow(
        leading: AppIconTile(icon: LucideIcons.warehouse, tone: tone),
        title: Text(warehouseLabel),
        subtitle: Text(
          [
            unitLabel,
            formatCurrency(row.price, currency),
            if (amount != null) l10n.inventoryDetailMinimum(minimum),
          ].join(' · '),
        ),
        trailing: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 120),
          child: Text(
            quantity,
            textAlign: TextAlign.end,
            style: tokens.typography.base.copyWith(
              color: tone == AppTone.success
                  ? c.foreground
                  : tone.foreground(c),
              fontWeight: FontWeight.w600,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ),
      ),
    );
  }
}

/// Owner, manufacturer, finance link, usage and description.
class InventoryDetailInfo extends StatelessWidget {
  const InventoryDetailInfo({required this.product, super.key});

  final InventoryProduct product;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final created = product.createdAt?.toLocal();
    String? text(String? value) =>
        value == null || value.trim().isEmpty ? null : value.trim();
    final pairs = <(String, String)>[
      if (text(product.owner?.name) case final owner?)
        (l10n.inventoryProductOwner, owner),
      if (text(product.manufacturer) case final manufacturer?)
        (l10n.inventoryProductManufacturer, manufacturer),
      if (text(product.financeCategory?.name) case final finance?)
        (l10n.inventoryProductFinanceCategory, finance),
      if (text(product.usage) case final usage?)
        (l10n.inventoryProductUsage, usage),
      if (created != null)
        (
          l10n.inventoryDetailCreated,
          DateFormat.yMMMd(l10n.localeName).format(created),
        ),
    ];
    final description = text(product.description);
    if (pairs.isEmpty && description == null) return const SizedBox.shrink();
    return AppPanel(
      title: l10n.inventoryDetailInfo,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final (label, value) in pairs)
            AppKeyValueRow(label: label, value: value),
          if (description != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              description,
              style: tokens.typography.small.copyWith(
                color: tokens.colorScheme.foreground,
                height: 1.45,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Newest stock movements with explicit paging.
class InventoryDetailHistory extends StatelessWidget {
  const InventoryDetailHistory({
    required this.movements,
    required this.loading,
    required this.failed,
    required this.hasMore,
    required this.onRetry,
    required this.onLoadMore,
    super.key,
  });

  final List<InventoryStockMovement> movements;
  final bool loading;
  final bool failed;
  final bool hasMore;
  final VoidCallback onRetry;
  final VoidCallback onLoadMore;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppSectionHeader(title: l10n.inventoryDetailHistory),
        AppGroupedCard(
          children: [
            if (movements.isEmpty && loading)
              const AppSkeletonRows(count: 3)
            else if (movements.isEmpty && failed)
              AppStateMessage.inline(
                icon: LucideIcons.cloudOff,
                tone: AppTone.destructive,
                title: l10n.inventoryDetailHistoryFailed,
                actionLabel: l10n.commonRetry,
                onAction: onRetry,
              )
            else if (movements.isEmpty)
              AppStateMessage.inline(
                icon: LucideIcons.history,
                title: l10n.inventoryDetailHistoryEmpty,
              )
            else
              for (final movement in movements)
                _MovementRow(movement: movement),
          ],
        ),
        if (movements.isNotEmpty && (hasMore || failed || loading))
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.sm),
            child: Center(
              child: loading
                  ? const AppLoadingIndicator.inline()
                  : AppButton.ghost(
                      size: AppButtonSize.small,
                      onPressed: failed ? onRetry : onLoadMore,
                      child: Text(
                        failed
                            ? l10n.commonRetry
                            : l10n.inventoryDetailLoadMore,
                      ),
                    ),
            ),
          ),
      ],
    );
  }
}

class _MovementRow extends StatelessWidget {
  const _MovementRow({required this.movement});

  final InventoryStockMovement movement;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final when = movement.timestamp?.toLocal();
    final amount = inventoryStockAmount(context, movement.delta.abs());
    final unit = movement.unitName ?? '';
    final title = '${movement.added ? '+' : '−'}$amount $unit'.trim();
    final subtitle = [
      ?movement.warehouseName,
      if (movement.operatorName case final name?) l10n.inventoryHistoryBy(name),
      if (movement.beneficiaryName case final name?)
        l10n.inventoryHistoryFor(name),
      if (when != null) DateFormat.MMMd(l10n.localeName).add_jm().format(when),
    ].join(' · ');
    final note = movement.note;
    return AppGroupedRow(
      leading: AppIconTile(
        icon: movement.added
            ? LucideIcons.arrowDownToLine
            : LucideIcons.arrowUpFromLine,
        tone: movement.added ? AppTone.success : AppTone.destructive,
      ),
      title: Text(title),
      subtitle: Text(
        [subtitle, if (note != null && note.isNotEmpty) note].join('\n'),
        maxLines: 3,
        overflow: TextOverflow.ellipsis,
      ),
    );
  }
}
