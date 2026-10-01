part of 'inventory_product_editor_page.dart';

class _InventoryStockRowCard extends StatelessWidget {
  const _InventoryStockRowCard({
    required this.index,
    required this.row,
    required this.units,
    required this.warehouses,
    required this.onPickUnit,
    required this.onPickWarehouse,
    required this.onChanged,
    this.onDelete,
  });

  final int index;
  final _InventoryRowDraft row;
  final List<InventoryLookupItem> units;
  final List<InventoryLookupItem> warehouses;
  final VoidCallback onPickUnit;
  final VoidCallback onPickWarehouse;
  final VoidCallback onChanged;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final selectedUnit = units
        .where((item) => item.id == row.unitId)
        .firstOrNull;
    final selectedWarehouse = warehouses
        .where((item) => item.id == row.warehouseId)
        .firstOrNull;
    final price = double.tryParse(row.priceController.text.trim());
    final amount = row.amountController.text.trim();
    final previewBits = <String>[
      if (amount.isEmpty) context.l10n.inventoryStockUnlimited else amount,
      if (selectedUnit?.name.trim().isNotEmpty ?? false) selectedUnit!.name,
      if (selectedWarehouse?.name.trim().isNotEmpty ?? false)
        selectedWarehouse!.name,
    ];

    return FinancePanel(
      padding: const EdgeInsets.all(14),
      radius: 20,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${context.l10n.inventoryProductInventory} ${index + 1}',
                  style: shad.Theme.of(
                    context,
                  ).typography.small.copyWith(fontWeight: FontWeight.w800),
                ),
              ),
              if (price != null)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: Text(
                    formatCurrency(price, 'VND'),
                    style: shad.Theme.of(context).typography.small.copyWith(
                      fontWeight: FontWeight.w800,
                      color: FinancePalette.of(context).accent,
                    ),
                  ),
                ),
              if (onDelete != null)
                shad.GhostButton(
                  density: shad.ButtonDensity.compact,
                  onPressed: onDelete,
                  child: const Icon(Icons.delete_outline_rounded, size: 18),
                ),
            ],
          ),
          if (previewBits.isNotEmpty) ...[
            const shad.Gap(6),
            Text(
              previewBits.join(' • '),
              style: shad.Theme.of(context).typography.xSmall.copyWith(
                color: shad.Theme.of(context).colorScheme.mutedForeground,
              ),
            ),
          ],
          const shad.Gap(12),
          _InventorySelectorCard(
            label: context.l10n.inventoryProductUnit,
            title: selectedUnit?.name,
            placeholder: context.l10n.inventoryProductUnit,
            icon: Icons.straighten_rounded,
            errorText: row.unitError,
            onTap: onPickUnit,
          ),
          const shad.Gap(12),
          _InventorySelectorCard(
            label: context.l10n.inventoryProductWarehouse,
            title: selectedWarehouse?.name,
            placeholder: context.l10n.inventoryProductWarehouse,
            icon: Icons.warehouse_outlined,
            errorText: row.warehouseError,
            onTap: onPickWarehouse,
          ),
          const shad.Gap(12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _InventoryTextInputCard(
                  label: context.l10n.inventoryProductAmount,
                  fieldKey: ValueKey('inventory-stock-amount-$index'),
                  controller: row.amountController,
                  placeholder: context.l10n.inventoryStockUnlimited,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  errorText: row.amountError,
                  onChanged: (_) {
                    row.amountError = null;
                    onChanged();
                  },
                ),
              ),
              const shad.Gap(12),
              Expanded(
                child: _InventoryTextInputCard(
                  label: context.l10n.inventoryProductMinAmount,
                  controller: row.minAmountController,
                  placeholder: context.l10n.inventoryProductMinAmount,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  errorText: row.minAmountError,
                  onChanged: (_) {
                    row.minAmountError = null;
                    onChanged();
                  },
                ),
              ),
            ],
          ),
          const shad.Gap(6),
          Text(
            context.l10n.inventoryStockUnlimitedHint,
            style: shad.Theme.of(context).typography.xSmall,
          ),
          const shad.Gap(12),
          _InventoryTextInputCard(
            label: context.l10n.inventoryProductPrice,
            fieldKey: ValueKey('inventory-stock-price-$index'),
            controller: row.priceController,
            placeholder: context.l10n.inventoryProductPrice,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            errorText: row.priceError,
            onChanged: (_) {
              row.priceError = null;
              onChanged();
            },
          ),
        ],
      ),
    );
  }
}

class _InventoryRowDraft {
  _InventoryRowDraft({
    required this.unitId,
    required this.warehouseId,
    required String amount,
    required String minAmount,
    required String price,
  }) : amountController = TextEditingController(text: amount),
       minAmountController = TextEditingController(text: minAmount),
       priceController = TextEditingController(text: price);

  factory _InventoryRowDraft.empty({
    required List<InventoryLookupItem> units,
    required List<InventoryLookupItem> warehouses,
  }) => _InventoryRowDraft(
    unitId: units.isEmpty ? null : units.first.id,
    warehouseId: warehouses.isEmpty ? null : warehouses.first.id,
    amount: '0',
    minAmount: '0',
    price: '',
  );

  String? unitId;
  String? warehouseId;
  String? unitError;
  String? warehouseError;
  String? amountError;
  String? minAmountError;
  String? priceError;

  final TextEditingController amountController;
  final TextEditingController minAmountController;
  final TextEditingController priceController;

  void clearErrors() {
    unitError = null;
    warehouseError = null;
    amountError = null;
    minAmountError = null;
    priceError = null;
  }

  void dispose() {
    amountController.dispose();
    minAmountController.dispose();
    priceController.dispose();
  }
}
