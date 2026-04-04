import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/finance/wallet.dart';
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

class InventoryCheckoutPage extends StatefulWidget {
  const InventoryCheckoutPage({super.key});

  @override
  State<InventoryCheckoutPage> createState() => _InventoryCheckoutPageState();
}

class _InventoryCheckoutPageState extends State<InventoryCheckoutPage> {
  late final InventoryRepository _inventoryRepository;
  late final FinanceRepository _financeRepository;
  late final TextEditingController _searchController;
  bool _loading = true;
  bool _saving = false;
  List<InventoryProduct> _products = const [];
  List<Wallet> _wallets = const [];
  List<TransactionCategory> _categories = const [];
  final Map<String, int> _quantities = <String, int>{};
  String? _walletId;
  String? _manualCategoryId;

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  @override
  void initState() {
    super.initState();
    _inventoryRepository = InventoryRepository();
    _financeRepository = FinanceRepository();
    _searchController = TextEditingController();
    unawaited(_load());
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final wsId = _wsId;
    if (wsId == null) return;
    setState(() => _loading = true);
    try {
      final results = await Future.wait<dynamic>([
        _inventoryRepository.getProductOptions(wsId),
        _financeRepository.getWallets(wsId),
        _financeRepository.getCategories(wsId),
      ]);
      setState(() {
        _products = results[0] as List<InventoryProduct>;
        _wallets = results[1] as List<Wallet>;
        _categories = (results[2] as List<TransactionCategory>)
            .where((item) => !(item.isExpense ?? false))
            .toList(growable: false);
        _walletId = _walletId ?? (_wallets.isEmpty ? null : _wallets.first.id);
      });
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  List<_SellableRow> get _rows {
    final query = _searchController.text.trim().toLowerCase();
    final rows = <_SellableRow>[];
    for (final product in _products) {
      for (final inventory in product.inventory) {
        final row = _SellableRow(product: product, inventory: inventory);
        final haystack = [
          product.name,
          product.owner?.name,
          product.category,
          inventory.unitName,
          inventory.warehouseName,
        ].whereType<String>().join(' ').toLowerCase();
        if (query.isEmpty || haystack.contains(query)) {
          rows.add(row);
        }
      }
    }
    return rows;
  }

  String _rowKey(_SellableRow row) =>
      '${row.product.id}|${row.inventory.unitId}|${row.inventory.warehouseId}';

  int _quantityFor(_SellableRow row) => _quantities[_rowKey(row)] ?? 0;

  List<_SellableRow> get _selectedRows =>
      _rows.where((row) => _quantityFor(row) > 0).toList(growable: false);

  Set<String> get _linkedCategoryIds => _selectedRows
      .map((row) => row.product.financeCategoryId)
      .whereType<String>()
      .where((value) => value.isNotEmpty)
      .toSet();

  bool get _requiresManualCategory => _linkedCategoryIds.length != 1;

  String? get _resolvedCategoryId =>
      _requiresManualCategory ? _manualCategoryId : _linkedCategoryIds.first;

  double get _cartTotal => _selectedRows.fold<double>(
    0,
    (sum, row) => sum + (_quantityFor(row) * row.inventory.price),
  );

  void _changeQuantity(_SellableRow row, int next) {
    setState(() {
      if (next <= 0) {
        _quantities.remove(_rowKey(row));
      } else {
        _quantities[_rowKey(row)] = next;
      }
    });
  }

  Future<void> _submit() async {
    final wsId = _wsId;
    if (wsId == null || _saving) return;
    if (_selectedRows.isEmpty ||
        _walletId == null ||
        _resolvedCategoryId == null) {
      showInventoryToast(
        context,
        context.l10n.inventoryCheckoutValidationError,
        destructive: true,
      );
      return;
    }

    setState(() => _saving = true);
    try {
      await _inventoryRepository.createSale(
        wsId: wsId,
        walletId: _walletId!,
        categoryId: _resolvedCategoryId,
        products: _selectedRows
            .map(
              (row) => {
                'product_id': row.product.id,
                'unit_id': row.inventory.unitId,
                'warehouse_id': row.inventory.warehouseId,
                'quantity': _quantityFor(row),
                'price': row.inventory.price,
                'category_id': row.product.categoryId,
              },
            )
            .toList(growable: false),
      );

      if (!mounted) return;
      showInventoryToast(
        context,
        context.l10n.inventorySaleCreated,
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
            title: l10n.inventoryCheckoutTitle,
            icon: Icons.shopping_basket_outlined,
            metrics: [
              InventoryMetricTile(
                label: l10n.inventoryCheckoutCartTotal,
                value: formatCurrency(_cartTotal, 'VND'),
                icon: Icons.payments_outlined,
              ),
              InventoryMetricTile(
                label: l10n.inventoryCheckoutSelectedItems,
                value: _selectedRows.length.toString(),
                icon: Icons.shopping_cart_checkout_rounded,
              ),
            ],
          ),
          const shad.Gap(16),
          FinancePanel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                FinanceSectionHeader(
                  title: l10n.inventoryCheckoutCheckoutDetailsTitle,
                ),
                const shad.Gap(12),
                DropdownButtonFormField<String>(
                  initialValue: _walletId,
                  items: _wallets
                      .map(
                        (wallet) => DropdownMenuItem<String>(
                          value: wallet.id,
                          child: Text(wallet.name ?? ''),
                        ),
                      )
                      .toList(growable: false),
                  onChanged: (value) => setState(() => _walletId = value),
                  decoration: InputDecoration(
                    labelText: l10n.inventoryCheckoutWallet,
                  ),
                ),
                const shad.Gap(12),
                if (_requiresManualCategory)
                  DropdownButtonFormField<String>(
                    initialValue: _manualCategoryId,
                    items: _categories
                        .map(
                          (category) => DropdownMenuItem<String>(
                            value: category.id,
                            child: Text(category.name ?? ''),
                          ),
                        )
                        .toList(growable: false),
                    onChanged: (value) =>
                        setState(() => _manualCategoryId = value),
                    decoration: InputDecoration(
                      labelText: l10n.inventoryCheckoutCategoryOverride,
                      helperText: l10n.inventoryCheckoutManualCategoryRequired,
                    ),
                  )
                else
                  Text(
                    '${l10n.inventoryCheckoutAutoCategory}: '
                    '${_categories.firstWhere(
                          (item) => item.id == _resolvedCategoryId,
                          orElse: () => const TransactionCategory(
                            id: '',
                            name: '',
                          ),
                        ).name ?? ''}',
                  ),
              ],
            ),
          ),
          const shad.Gap(16),
          FinancePanel(
            child: TextField(
              controller: _searchController,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                hintText: l10n.inventorySearchProducts,
                prefixIcon: const Icon(Icons.search_rounded),
              ),
            ),
          ),
          const shad.Gap(16),
          if (_rows.isEmpty)
            FinanceEmptyState(
              icon: Icons.shopping_basket_outlined,
              title: l10n.inventoryCheckoutTitle,
              body: l10n.inventoryCheckoutEmpty,
            )
          else
            FinanceSectionHeader(
              title: l10n.inventoryCheckoutAvailableProductsTitle,
            ),
          if (_rows.isNotEmpty) const shad.Gap(12),
          if (_rows.isNotEmpty)
            ..._rows.map(
              (row) {
                final quantity = _quantityFor(row);
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: FinancePanel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          row.product.name ?? 'Untitled product',
                          style: shad.Theme.of(context).typography.large
                              .copyWith(fontWeight: FontWeight.w700),
                        ),
                        const shad.Gap(6),
                        Text(
                          [
                            if (row.product.owner?.name.isNotEmpty ?? false)
                              row.product.owner!.name,
                            if (row.inventory.unitName?.isNotEmpty ?? false)
                              row.inventory.unitName!,
                            if (row.inventory.warehouseName?.isNotEmpty ??
                                false)
                              row.inventory.warehouseName!,
                          ].join(' • '),
                        ),
                        const shad.Gap(10),
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                formatCurrency(row.inventory.price, 'VND'),
                                style: shad.Theme.of(context).typography.large
                                    .copyWith(fontWeight: FontWeight.w800),
                              ),
                            ),
                            IconButton(
                              onPressed: quantity == 0
                                  ? null
                                  : () => _changeQuantity(row, quantity - 1),
                              icon: const Icon(
                                Icons.remove_circle_outline_rounded,
                              ),
                            ),
                            Text(
                              '$quantity',
                              style: shad.Theme.of(context).typography.large
                                  .copyWith(fontWeight: FontWeight.w700),
                            ),
                            IconButton(
                              onPressed: () =>
                                  _changeQuantity(row, quantity + 1),
                              icon: const Icon(
                                Icons.add_circle_outline_rounded,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          const shad.Gap(16),
          FinancePanel(
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        l10n.inventoryCheckoutCartTotal,
                        style: shad.Theme.of(context).typography.small,
                      ),
                      const shad.Gap(4),
                      Text(
                        formatCurrency(_cartTotal, 'VND'),
                        style: shad.Theme.of(
                          context,
                        ).typography.h3.copyWith(fontWeight: FontWeight.w800),
                      ),
                    ],
                  ),
                ),
                shad.PrimaryButton(
                  onPressed: _saving ? null : _submit,
                  child: Text(l10n.inventoryCheckoutSubmit),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SellableRow {
  const _SellableRow({
    required this.product,
    required this.inventory,
  });

  final InventoryProduct product;
  final InventoryStockEntry inventory;
}
