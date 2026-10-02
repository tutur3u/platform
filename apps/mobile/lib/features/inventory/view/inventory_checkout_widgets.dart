part of 'inventory_checkout_page.dart';

class _CheckoutOptionsAlert extends StatelessWidget {
  const _CheckoutOptionsAlert({required this.onRetry});

  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final accent = FinancePalette.of(context).accent;
    return FinancePanel(
      child: LayoutBuilder(
        builder: (context, constraints) {
          final message = Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(Icons.cloud_off_outlined, color: accent, size: 18),
              ),
              const shad.Gap(10),
              Expanded(
                child: Text(
                  context.l10n.inventoryCheckoutOptionsUnavailable,
                  style: theme.typography.small.copyWith(
                    color: theme.colorScheme.mutedForeground,
                    height: 1.35,
                  ),
                ),
              ),
            ],
          );
          final retry = shad.OutlineButton(
            onPressed: onRetry,
            size: shad.ButtonSize.small,
            leading: const Icon(Icons.refresh_rounded, size: 16),
            child: Text(context.l10n.commonRetry),
          );
          if (constraints.maxWidth < 430) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [message, const shad.Gap(10), retry],
            );
          }
          return Row(
            children: [
              Expanded(child: message),
              const shad.Gap(12),
              retry,
            ],
          );
        },
      ),
    );
  }
}

class _SellableRow {
  const _SellableRow({required this.product, required this.inventory});

  final InventoryProduct product;
  final InventoryStockEntry inventory;
}

class _CheckoutTabSelector extends StatelessWidget {
  const _CheckoutTabSelector({
    required this.browseLabel,
    required this.cartLabel,
    required this.cartCount,
    required this.activeTab,
    required this.onChanged,
  });

  final String browseLabel;
  final String cartLabel;
  final int cartCount;
  final int activeTab;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final accent = FinancePalette.of(context).accent;
    final theme = shad.Theme.of(context);

    Widget buildTab({
      required int tab,
      required String label,
      required IconData icon,
      String? badge,
    }) {
      final selected = activeTab == tab;
      return Expanded(
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: () => onChanged(tab),
            borderRadius: BorderRadius.circular(16),
            child: Ink(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              decoration: BoxDecoration(
                color: selected
                    ? accent.withValues(alpha: 0.14)
                    : Colors.transparent,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    icon,
                    size: 16,
                    color: selected
                        ? accent
                        : theme.colorScheme.mutedForeground,
                  ),
                  const shad.Gap(8),
                  Flexible(
                    child: Text(
                      label,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.small.copyWith(
                        fontWeight: FontWeight.w700,
                        color: selected
                            ? accent
                            : theme.colorScheme.mutedForeground,
                      ),
                    ),
                  ),
                  if (badge != null) ...[
                    const shad.Gap(8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 7,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: selected
                            ? accent.withValues(alpha: 0.18)
                            : theme.colorScheme.muted.withValues(alpha: 0.5),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        badge,
                        style: theme.typography.xSmall.copyWith(
                          fontWeight: FontWeight.w800,
                          color: selected
                              ? accent
                              : theme.colorScheme.mutedForeground,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: theme.colorScheme.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.72),
        ),
      ),
      child: Row(
        children: [
          buildTab(
            tab: _InventoryCheckoutPageState._tabBrowse,
            label: browseLabel,
            icon: Icons.storefront_outlined,
          ),
          const shad.Gap(4),
          buildTab(
            tab: _InventoryCheckoutPageState._tabCart,
            label: cartLabel,
            icon: Icons.shopping_cart_checkout_rounded,
            badge: cartCount == 0 ? null : '$cartCount',
          ),
        ],
      ),
    );
  }
}

class _CategoryFilterChip extends StatelessWidget {
  const _CategoryFilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final accent = FinancePalette.of(context).accent;
    final theme = shad.Theme.of(context);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Ink(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: selected
                ? accent.withValues(alpha: 0.14)
                : theme.colorScheme.card,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: selected
                  ? accent.withValues(alpha: 0.4)
                  : theme.colorScheme.border.withValues(alpha: 0.72),
            ),
          ),
          child: Text(
            label,
            style: theme.typography.xSmall.copyWith(
              fontWeight: FontWeight.w700,
              color: selected ? accent : theme.colorScheme.mutedForeground,
            ),
          ),
        ),
      ),
    );
  }
}

class _CheckoutProductCard extends StatelessWidget {
  const _CheckoutProductCard({
    required this.row,
    required this.price,
    required this.seasonPricing,
    required this.currency,
    required this.quantity,
    required this.onDecrement,
    required this.onIncrement,
  });

  final _SellableRow row;
  final double? price;
  final bool seasonPricing;
  String _format(double value) => seasonPricing
      ? formatSeasonPrice(value, currency)
      : formatCurrency(value, currency);
  final String currency;
  final int quantity;
  final VoidCallback onDecrement;
  final VoidCallback onIncrement;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final accent = FinancePalette.of(context).accent;
    final amountLabel = row.inventory.amount == null
        ? null
        : [
            row.inventory.amount!.toStringAsFixed(0),
            row.inventory.unitName ?? '',
          ].join(' ').trim();

    return FinancePanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (row.product.avatarUrl?.isNotEmpty ?? false) ...[
                InventoryProductImage(product: row.product),
                const shad.Gap(12),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      row.product.name ?? 'Untitled product',
                      style: theme.typography.large.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const shad.Gap(6),
                    Text(
                      [
                        if (row.product.owner?.name.isNotEmpty ?? false)
                          row.product.owner!.name,
                        if (row.inventory.unitName?.isNotEmpty ?? false)
                          row.inventory.unitName!,
                        if (row.inventory.warehouseName?.isNotEmpty ?? false)
                          row.inventory.warehouseName!,
                      ].join(' • '),
                    ),
                  ],
                ),
              ),
              const shad.Gap(12),
              Text(
                price == null ? '—' : _format(price!),
                style: theme.typography.large.copyWith(
                  fontWeight: FontWeight.w800,
                  color: accent,
                ),
              ),
            ],
          ),
          const shad.Gap(12),
          Row(
            children: [
              if (amountLabel != null)
                FinanceStatChip(
                  label: context.l10n.inventoryProductAmount,
                  value: amountLabel,
                  icon: Icons.inventory_2_outlined,
                ),
              const Spacer(),
              _CheckoutStepper(
                quantity: quantity,
                onDecrement: quantity == 0 ? null : onDecrement,
                onIncrement: onIncrement,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CheckoutCartRowCard extends StatelessWidget {
  const _CheckoutCartRowCard({
    required this.row,
    required this.price,
    required this.seasonPricing,
    required this.currency,
    required this.quantity,
    required this.onRemove,
    required this.onDecrement,
    required this.onIncrement,
  });

  final _SellableRow row;
  final double? price;
  final bool seasonPricing;
  String _format(double value) => seasonPricing
      ? formatSeasonPrice(value, currency)
      : formatCurrency(value, currency);
  final String currency;
  final int quantity;
  final VoidCallback onRemove;
  final VoidCallback onDecrement;
  final VoidCallback onIncrement;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final subtotal = price == null ? null : quantity * price!;

    return FinancePanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (row.product.avatarUrl?.isNotEmpty ?? false) ...[
                InventoryProductImage(product: row.product),
                const shad.Gap(12),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      row.product.name ?? 'Untitled product',
                      style: theme.typography.large.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const shad.Gap(6),
                    Text(
                      [
                        if (row.product.owner?.name.isNotEmpty ?? false)
                          row.product.owner!.name,
                        if (row.inventory.unitName?.isNotEmpty ?? false)
                          row.inventory.unitName!,
                        if (row.inventory.warehouseName?.isNotEmpty ?? false)
                          row.inventory.warehouseName!,
                      ].join(' • '),
                    ),
                  ],
                ),
              ),
              shad.GhostButton(
                density: shad.ButtonDensity.compact,
                onPressed: onRemove,
                child: const Icon(Icons.close_rounded, size: 18),
              ),
            ],
          ),
          const shad.Gap(12),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      subtotal == null ? '—' : _format(subtotal),
                      style: theme.typography.large.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const shad.Gap(2),
                    Text(
                      '${price == null ? '—' : _format(price!)}'
                      ' '
                      '× $quantity',
                      style: theme.typography.textSmall.copyWith(
                        color: theme.colorScheme.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
              _CheckoutStepper(
                quantity: quantity,
                onDecrement: quantity == 0 ? null : onDecrement,
                onIncrement: onIncrement,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CheckoutStepper extends StatelessWidget {
  const _CheckoutStepper({
    required this.quantity,
    required this.onDecrement,
    required this.onIncrement,
  });

  final int quantity;
  final VoidCallback? onDecrement;
  final VoidCallback onIncrement;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: theme.colorScheme.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.72),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            onPressed: onDecrement,
            icon: const Icon(Icons.remove_circle_outline_rounded),
          ),
          SizedBox(
            width: 28,
            child: Text(
              '$quantity',
              textAlign: TextAlign.center,
              style: theme.typography.large.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          IconButton(
            onPressed: onIncrement,
            icon: const Icon(Icons.add_circle_outline_rounded),
          ),
        ],
      ),
    );
  }
}

class _CheckoutInfoRow extends StatelessWidget {
  const _CheckoutInfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: theme.colorScheme.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.72),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: theme.typography.xSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
              fontWeight: FontWeight.w700,
            ),
          ),
          const shad.Gap(6),
          Text(
            value.isEmpty ? '-' : value,
            style: theme.typography.small.copyWith(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _CheckoutFooterSummary extends StatelessWidget {
  const _CheckoutFooterSummary({
    required this.walletLabel,
    required this.walletValue,
    required this.itemsLabel,
    required this.itemsValue,
    required this.totalLabel,
    required this.totalValue,
  });

  final String walletLabel;
  final String walletValue;
  final String itemsLabel;
  final String itemsValue;
  final String totalLabel;
  final String totalValue;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final palette = FinancePalette.of(context);

    Widget buildItem({
      required String label,
      required String value,
      CrossAxisAlignment crossAxisAlignment = CrossAxisAlignment.start,
    }) {
      return Expanded(
        child: Column(
          crossAxisAlignment: crossAxisAlignment,
          children: [
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.typography.xSmall.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            ),
            const shad.Gap(4),
            Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.typography.small.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: palette.elevatedPanel,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.68),
        ),
      ),
      child: Row(
        children: [
          buildItem(label: walletLabel, value: walletValue),
          const shad.Gap(12),
          buildItem(label: itemsLabel, value: itemsValue),
          const shad.Gap(12),
          buildItem(
            label: totalLabel,
            value: totalValue,
            crossAxisAlignment: CrossAxisAlignment.end,
          ),
        ],
      ),
    );
  }
}
