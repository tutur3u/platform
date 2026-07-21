import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/models/storefront/storefront_models.dart';
import 'package:mobile/features/storefront/storefront_labels.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';

Future<Map<String, dynamic>?> showStorefrontListingEditorSheet(
  BuildContext context, {
  required List<InventoryProduct> products,
  StorefrontListing? listing,
}) => showAdaptiveSheet<Map<String, dynamic>>(
  context: context,
  enableDrag: false,
  barrierDismissible: false,
  builder: (_) => _ListingEditor(products: products, listing: listing),
);

class _ListingEditor extends StatefulWidget {
  const _ListingEditor({required this.products, this.listing});

  final List<InventoryProduct> products;
  final StorefrontListing? listing;

  @override
  State<_ListingEditor> createState() => _ListingEditorState();
}

class _ListingEditorState extends State<_ListingEditor> {
  late final TextEditingController _title;
  late final TextEditingController _description;
  late final TextEditingController _price;
  late final TextEditingController _compareAtPrice;
  late final TextEditingController _maxPerOrder;
  late String _status;
  InventoryProduct? _product;
  InventoryStockEntry? _stock;
  String? _error;

  @override
  void initState() {
    super.initState();
    final listing = widget.listing;
    _title = TextEditingController(text: listing?.title);
    _description = TextEditingController(text: listing?.description);
    _price = TextEditingController(text: listing?.price.toStringAsFixed(0));
    _compareAtPrice = TextEditingController(
      text: listing?.compareAtPrice?.toStringAsFixed(0),
    );
    _maxPerOrder = TextEditingController(
      text: (listing?.maxPerOrder ?? 1).toString(),
    );
    _status = listing?.status ?? 'draft';
    _product = widget.products
        .where((item) => item.id == listing?.productId)
        .firstOrNull;
    _stock = _product?.inventory
        .where(
          (item) =>
              item.unitId == listing?.unitId &&
              item.warehouseId == listing?.warehouseId,
        )
        .firstOrNull;
  }

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    _price.dispose();
    _compareAtPrice.dispose();
    _maxPerOrder.dispose();
    super.dispose();
  }

  void _selectProduct(InventoryProduct? product) {
    setState(() {
      _product = product;
      _stock = product?.inventory.firstOrNull;
      if (_title.text.trim().isEmpty) _title.text = product?.name ?? '';
      if (_price.text.trim().isEmpty && _stock != null) {
        _price.text = _stock!.price.toStringAsFixed(0);
      }
    });
  }

  void _submit() {
    final product = _product;
    final stock = _stock;
    final title = _title.text.trim();
    final price = double.tryParse(_price.text.trim());
    final compareAtPrice = double.tryParse(_compareAtPrice.text.trim());
    final maxPerOrder = int.tryParse(_maxPerOrder.text.trim());
    if (product == null ||
        stock == null ||
        title.isEmpty ||
        price == null ||
        price < 0 ||
        maxPerOrder == null ||
        maxPerOrder < 1) {
      setState(() => _error = context.l10n.storefrontListingValidationError);
      return;
    }

    Navigator.of(context).pop(<String, dynamic>{
      'listingType': 'product',
      'productId': product.id,
      'unitId': stock.unitId,
      'warehouseId': stock.warehouseId,
      'title': title,
      'description': _description.text.trim().isEmpty
          ? null
          : _description.text.trim(),
      'price': price.round(),
      'compareAtPrice': compareAtPrice?.round(),
      'status': _status,
      'maxPerOrder': maxPerOrder,
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppDialogScaffold(
      title: widget.listing == null
          ? l10n.storefrontListingCreate
          : l10n.storefrontListingEdit,
      description: l10n.storefrontListingEditorSubtitle,
      icon: Icons.sell_outlined,
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(l10n.commonCancel),
        ),
        FilledButton(onPressed: _submit, child: Text(l10n.commonSave)),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          DropdownButtonFormField<InventoryProduct>(
            initialValue: _product,
            isExpanded: true,
            decoration: InputDecoration(labelText: l10n.storefrontProduct),
            items: widget.products
                .map(
                  (product) => DropdownMenuItem(
                    value: product,
                    child: Text(product.name ?? l10n.inventoryProductUntitled),
                  ),
                )
                .toList(growable: false),
            onChanged: _selectProduct,
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<InventoryStockEntry>(
            initialValue: _stock,
            isExpanded: true,
            decoration: InputDecoration(labelText: l10n.storefrontStockRow),
            items: (_product?.inventory ?? const <InventoryStockEntry>[])
                .map(
                  (stock) => DropdownMenuItem(
                    value: stock,
                    child: Text(
                      [
                        stock.warehouseName,
                        stock.unitName,
                        stock.amount?.toStringAsFixed(0),
                      ].whereType<String>().join(' · '),
                    ),
                  ),
                )
                .toList(growable: false),
            onChanged: (value) => setState(() => _stock = value),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _title,
            textInputAction: TextInputAction.next,
            decoration: InputDecoration(labelText: l10n.storefrontListingTitle),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _description,
            maxLines: 3,
            decoration: InputDecoration(labelText: l10n.storefrontDescription),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _price,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: InputDecoration(labelText: l10n.storefrontPrice),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: _compareAtPrice,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: InputDecoration(
                    labelText: l10n.storefrontCompareAtPrice,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: _status,
                  decoration: InputDecoration(labelText: l10n.storefrontStatus),
                  items: const ['draft', 'published', 'paused', 'archived']
                      .map(
                        (status) => DropdownMenuItem(
                          value: status,
                          child: Text(storefrontStatusLabel(l10n, status)),
                        ),
                      )
                      .toList(growable: false),
                  onChanged: (value) {
                    if (value != null) setState(() => _status = value);
                  },
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: _maxPerOrder,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: l10n.storefrontMaxPerOrder,
                  ),
                ),
              ),
            ],
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
        ],
      ),
    );
  }
}
