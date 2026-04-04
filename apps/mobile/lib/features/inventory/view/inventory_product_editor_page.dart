import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class InventoryProductEditorPage extends StatefulWidget {
  const InventoryProductEditorPage({
    super.key,
    this.productId,
  });

  final String? productId;

  @override
  State<InventoryProductEditorPage> createState() =>
      _InventoryProductEditorPageState();
}

class _InventoryProductEditorPageState
    extends State<InventoryProductEditorPage> {
  late final InventoryRepository _inventoryRepository;
  late final FinanceRepository _financeRepository;
  late final TextEditingController _nameController;
  late final TextEditingController _manufacturerController;
  late final TextEditingController _descriptionController;
  late final TextEditingController _usageController;
  bool _loading = true;
  bool _saving = false;
  String? _categoryId;
  String? _ownerId;
  String? _financeCategoryId;
  List<InventoryLookupItem> _categories = const [];
  List<InventoryOwner> _owners = const [];
  List<InventoryLookupItem> _units = const [];
  List<InventoryLookupItem> _warehouses = const [];
  List<TransactionCategory> _financeCategories = const [];
  List<_InventoryRowDraft> _rows = [];

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  @override
  void initState() {
    super.initState();
    _inventoryRepository = InventoryRepository();
    _financeRepository = FinanceRepository();
    _nameController = TextEditingController();
    _manufacturerController = TextEditingController();
    _descriptionController = TextEditingController();
    _usageController = TextEditingController();
    unawaited(_load());
  }

  @override
  void dispose() {
    _nameController.dispose();
    _manufacturerController.dispose();
    _descriptionController.dispose();
    _usageController.dispose();
    for (final row in _rows) {
      row.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    final wsId = _wsId;
    if (wsId == null) return;

    setState(() => _loading = true);
    try {
      final results = await Future.wait<dynamic>([
        _inventoryRepository.getProductCategories(wsId),
        _inventoryRepository.getOwners(wsId),
        _inventoryRepository.getProductUnits(wsId),
        _inventoryRepository.getProductWarehouses(wsId),
        _financeRepository.getCategories(wsId),
        if (widget.productId != null)
          _inventoryRepository.getProduct(wsId, widget.productId!)
        else
          Future<InventoryProduct?>.value(),
      ]);

      final categories = results[0] as List<InventoryLookupItem>;
      final owners = results[1] as List<InventoryOwner>;
      final units = results[2] as List<InventoryLookupItem>;
      final warehouses = results[3] as List<InventoryLookupItem>;
      final financeCategories = results[4] as List<TransactionCategory>;
      final product = results[5] as InventoryProduct?;

      if (product != null) {
        _nameController.text = product.name ?? '';
        _manufacturerController.text = product.manufacturer ?? '';
        _descriptionController.text = product.description ?? '';
        _usageController.text = product.usage ?? '';
        _categoryId = product.categoryId;
        _ownerId = product.ownerId;
        _financeCategoryId = product.financeCategoryId;
        _rows = product.inventory
            .map(
              (row) => _InventoryRowDraft(
                unitId: row.unitId,
                warehouseId: row.warehouseId,
                amount: row.amount?.toString() ?? '',
                minAmount: row.minAmount.toString(),
                price: row.price.toString(),
              ),
            )
            .toList();
      }

      if (_rows.isEmpty) {
        _rows = [
          _InventoryRowDraft.empty(units: units, warehouses: warehouses),
        ];
      }

      setState(() {
        _categories = categories;
        _owners = owners;
        _units = units;
        _warehouses = warehouses;
        _financeCategories = financeCategories;
      });
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  void _addRow() {
    setState(() {
      _rows.add(
        _InventoryRowDraft.empty(units: _units, warehouses: _warehouses),
      );
    });
  }

  Future<void> _save() async {
    final wsId = _wsId;
    if (wsId == null || _saving) return;

    final name = _nameController.text.trim();
    if (name.isEmpty ||
        _categoryId == null ||
        _ownerId == null ||
        _rows.isEmpty) {
      showInventoryToast(
        context,
        context.l10n.inventoryProductValidationError,
        destructive: true,
      );
      return;
    }

    final entries = <InventoryStockEntry>[];
    for (final row in _rows) {
      final unitId = row.unitId;
      final warehouseId = row.warehouseId;
      final minAmount = double.tryParse(row.minAmountController.text.trim());
      final price = double.tryParse(row.priceController.text.trim());
      final amountText = row.amountController.text.trim();
      final amount = amountText.isEmpty ? null : double.tryParse(amountText);
      if (unitId == null ||
          warehouseId == null ||
          minAmount == null ||
          price == null ||
          (amountText.isNotEmpty && amount == null)) {
        showInventoryToast(
          context,
          context.l10n.inventoryProductValidationError,
          destructive: true,
        );
        return;
      }
      entries.add(
        InventoryStockEntry(
          unitId: unitId,
          warehouseId: warehouseId,
          amount: amount,
          minAmount: minAmount,
          price: price,
        ),
      );
    }

    setState(() => _saving = true);
    try {
      if (widget.productId == null) {
        await _inventoryRepository.createProduct(
          wsId: wsId,
          name: name,
          categoryId: _categoryId!,
          ownerId: _ownerId!,
          inventory: entries,
          manufacturer: _manufacturerController.text.trim().isEmpty
              ? null
              : _manufacturerController.text.trim(),
          description: _descriptionController.text.trim().isEmpty
              ? null
              : _descriptionController.text.trim(),
          usage: _usageController.text.trim().isEmpty
              ? null
              : _usageController.text.trim(),
          financeCategoryId: _financeCategoryId,
        );
      } else {
        await _inventoryRepository.updateProduct(
          wsId: wsId,
          productId: widget.productId!,
          name: name,
          categoryId: _categoryId!,
          ownerId: _ownerId!,
          inventory: entries,
          manufacturer: _manufacturerController.text.trim().isEmpty
              ? null
              : _manufacturerController.text.trim(),
          description: _descriptionController.text.trim().isEmpty
              ? null
              : _descriptionController.text.trim(),
          usage: _usageController.text.trim().isEmpty
              ? null
              : _usageController.text.trim(),
          financeCategoryId: _financeCategoryId,
        );
      }

      if (!mounted) return;
      showInventoryToast(
        context,
        context.l10n.inventoryProductSaved,
      );
      context.pop(true);
    } on ApiException catch (error) {
      if (!mounted) return;
      showInventoryToast(
        context,
        error.message,
        destructive: true,
      );
    } on Exception catch (error) {
      if (!mounted) return;
      showInventoryToast(
        context,
        error.toString(),
        destructive: true,
      );
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    if (_loading) {
      return const shad.Scaffold(
        child: Center(child: NovaLoadingIndicator()),
      );
    }

    return shad.Scaffold(
      child: ListView(
        padding: EdgeInsets.fromLTRB(
          16,
          12,
          16,
          32 + MediaQuery.paddingOf(context).bottom,
        ),
        children: [
          InventoryHeroCard(
            title: widget.productId == null
                ? l10n.inventoryCreateProduct
                : l10n.inventoryEditProduct,
            icon: Icons.inventory_2_outlined,
            metrics: [
              InventoryMetricTile(
                label: l10n.inventoryManageOwners,
                value: _owners.length.toString(),
                icon: Icons.people_outline_rounded,
              ),
              InventoryMetricTile(
                label: l10n.inventoryManageCategories,
                value: _categories.length.toString(),
                icon: Icons.category_outlined,
              ),
            ],
          ),
          const shad.Gap(16),
          FinancePanel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                FinanceSectionHeader(
                  title: l10n.inventoryProductDetailsTitle,
                ),
                const shad.Gap(16),
                TextField(
                  controller: _nameController,
                  decoration: InputDecoration(
                    labelText: l10n.inventoryProductName,
                  ),
                ),
                const shad.Gap(12),
                TextField(
                  controller: _manufacturerController,
                  decoration: InputDecoration(
                    labelText: l10n.inventoryProductManufacturer,
                  ),
                ),
                const shad.Gap(12),
                TextField(
                  controller: _descriptionController,
                  decoration: InputDecoration(
                    labelText: l10n.inventoryProductDescription,
                  ),
                  maxLines: 2,
                ),
                const shad.Gap(12),
                TextField(
                  controller: _usageController,
                  decoration: InputDecoration(
                    labelText: l10n.inventoryProductUsage,
                  ),
                  maxLines: 2,
                ),
                const shad.Gap(12),
                DropdownButtonFormField<String>(
                  initialValue: _categoryId,
                  items: _categories
                      .map(
                        (item) => DropdownMenuItem<String>(
                          value: item.id,
                          child: Text(item.name),
                        ),
                      )
                      .toList(growable: false),
                  onChanged: (value) => setState(() => _categoryId = value),
                  decoration: InputDecoration(
                    labelText: l10n.inventoryProductCategory,
                  ),
                ),
                const shad.Gap(12),
                DropdownButtonFormField<String>(
                  initialValue: _ownerId,
                  items: _owners
                      .map(
                        (item) => DropdownMenuItem<String>(
                          value: item.id,
                          child: Text(item.name),
                        ),
                      )
                      .toList(growable: false),
                  onChanged: (value) => setState(() => _ownerId = value),
                  decoration: InputDecoration(
                    labelText: l10n.inventoryProductOwner,
                  ),
                ),
                const shad.Gap(12),
                DropdownButtonFormField<String?>(
                  initialValue: _financeCategoryId,
                  items: [
                    DropdownMenuItem<String?>(
                      child: Text(l10n.inventoryNoLinkedFinanceCategory),
                    ),
                    ..._financeCategories.map(
                      (item) => DropdownMenuItem<String?>(
                        value: item.id,
                        child: Text(item.name ?? ''),
                      ),
                    ),
                  ],
                  onChanged: (value) =>
                      setState(() => _financeCategoryId = value),
                  decoration: InputDecoration(
                    labelText: l10n.inventoryProductFinanceCategory,
                  ),
                ),
              ],
            ),
          ),
          const shad.Gap(16),
          FinanceSectionHeader(
            title: l10n.inventoryProductInventory,
          ),
          const shad.Gap(12),
          ..._rows.asMap().entries.map((entry) {
            final index = entry.key;
            final row = entry.value;
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: FinancePanel(
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            '${l10n.inventoryProductInventory} ${index + 1}',
                            style: shad.Theme.of(context).typography.large
                                .copyWith(fontWeight: FontWeight.w700),
                          ),
                        ),
                        IconButton(
                          onPressed: _rows.length == 1
                              ? null
                              : () {
                                  setState(() {
                                    _rows.removeAt(index).dispose();
                                  });
                                },
                          icon: const Icon(Icons.delete_outline_rounded),
                        ),
                      ],
                    ),
                    const shad.Gap(8),
                    DropdownButtonFormField<String>(
                      initialValue: row.unitId,
                      items: _units
                          .map(
                            (item) => DropdownMenuItem<String>(
                              value: item.id,
                              child: Text(item.name),
                            ),
                          )
                          .toList(growable: false),
                      onChanged: (value) => setState(() => row.unitId = value),
                      decoration: InputDecoration(
                        labelText: l10n.inventoryProductUnit,
                      ),
                    ),
                    const shad.Gap(12),
                    DropdownButtonFormField<String>(
                      initialValue: row.warehouseId,
                      items: _warehouses
                          .map(
                            (item) => DropdownMenuItem<String>(
                              value: item.id,
                              child: Text(item.name),
                            ),
                          )
                          .toList(growable: false),
                      onChanged: (value) =>
                          setState(() => row.warehouseId = value),
                      decoration: InputDecoration(
                        labelText: l10n.inventoryProductWarehouse,
                      ),
                    ),
                    const shad.Gap(12),
                    TextField(
                      controller: row.amountController,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: InputDecoration(
                        labelText: l10n.inventoryProductAmount,
                      ),
                    ),
                    const shad.Gap(12),
                    TextField(
                      controller: row.minAmountController,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: InputDecoration(
                        labelText: l10n.inventoryProductMinAmount,
                      ),
                    ),
                    const shad.Gap(12),
                    TextField(
                      controller: row.priceController,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: InputDecoration(
                        labelText: l10n.inventoryProductPrice,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              shad.SecondaryButton(
                onPressed: _addRow,
                child: Text(l10n.inventoryProductAddInventoryRow),
              ),
              shad.PrimaryButton(
                onPressed: _saving ? null : _save,
                child: Text(
                  widget.productId == null
                      ? l10n.inventoryCreateProduct
                      : l10n.inventorySaveProduct,
                ),
              ),
            ],
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
    price: '0',
  );

  String? unitId;
  String? warehouseId;
  final TextEditingController amountController;
  final TextEditingController minAmountController;
  final TextEditingController priceController;

  void dispose() {
    amountController.dispose();
    minAmountController.dispose();
    priceController.dispose();
  }
}
