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
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/widgets/finance_modal_scaffold.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

Future<T?> showInventoryCheckoutPage<T>(
  BuildContext context, {
  InventorySaleDetail? sale,
}) {
  return showFinanceFullscreenModal<T>(
    context: context,
    builder: (context) => InventoryCheckoutPage(sale: sale),
  );
}

class InventoryCheckoutPage extends StatefulWidget {
  const InventoryCheckoutPage({this.sale, super.key});

  final InventorySaleDetail? sale;

  @override
  State<InventoryCheckoutPage> createState() => _InventoryCheckoutPageState();
}

class _InventoryCheckoutPageState extends State<InventoryCheckoutPage> {
  static const int _tabBrowse = 0;
  static const int _tabCart = 1;

  late final InventoryRepository _inventoryRepository;
  late final FinanceRepository _financeRepository;
  late final SettingsRepository _settingsRepository;
  late final TextEditingController _searchController;
  late final TextEditingController _titleController;
  late final TextEditingController _noteController;
  bool _loading = true;
  bool _saving = false;
  int _activeTab = _tabBrowse;
  List<InventoryProduct> _products = const [];
  List<Wallet> _wallets = const [];
  List<TransactionCategory> _categories = const [];
  final Map<String, int> _quantities = <String, int>{};
  String? _walletId;
  String? _manualCategoryId;
  String? _selectedProductCategory;

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  @override
  void initState() {
    super.initState();
    _inventoryRepository = InventoryRepository();
    _financeRepository = FinanceRepository();
    _settingsRepository = SettingsRepository();
    _searchController = TextEditingController();
    _titleController = TextEditingController(text: widget.sale?.notice ?? '');
    _noteController = TextEditingController(text: widget.sale?.note ?? '');
    unawaited(_load());
  }

  @override
  void dispose() {
    _searchController.dispose();
    _titleController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final wsId = _wsId;
    if (wsId == null) return;
    setState(() => _loading = true);
    try {
      final lastCategoryId = await _settingsRepository.getLastIncomeCategory(
        wsId,
      );
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
        _walletId =
            widget.sale?.walletId ??
            _walletId ??
            (_wallets.isEmpty ? null : _wallets.first.id);
        final availableCategoryIds = _categories
            .map((category) => category.id)
            .whereType<String>()
            .where((id) => id.isNotEmpty)
            .toSet();
        _manualCategoryId =
            availableCategoryIds.contains(widget.sale?.categoryId)
            ? widget.sale?.categoryId
            : availableCategoryIds.contains(lastCategoryId)
            ? lastCategoryId
            : (_categories.isEmpty ? null : _categories.first.id);
        final sale = widget.sale;
        if (sale != null && _quantities.isEmpty) {
          for (final line in sale.lines) {
            if (line.productId.isEmpty) {
              continue;
            }
            final roundedQuantity = line.quantity.round();
            if (roundedQuantity <= 0) {
              continue;
            }
            final key = '${line.productId}|${line.unitId}|${line.warehouseId}';
            _quantities[key] = roundedQuantity;
          }
        }
      });
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  List<_SellableRow> get _allRows {
    final rows = <_SellableRow>[];
    for (final product in _products) {
      for (final inventory in product.inventory) {
        rows.add(_SellableRow(product: product, inventory: inventory));
      }
    }
    return rows;
  }

  List<_SellableRow> get _visibleRows {
    final query = _searchController.text.trim().toLowerCase();
    final rows = <_SellableRow>[];
    for (final row in _allRows) {
      final categoryName = row.product.category?.trim();
      if (_selectedProductCategory != null &&
          _selectedProductCategory!.isNotEmpty &&
          categoryName != _selectedProductCategory) {
        continue;
      }
      final haystack = [
        row.product.name,
        row.product.owner?.name,
        row.product.category,
        row.inventory.unitName,
        row.inventory.warehouseName,
      ].whereType<String>().join(' ').toLowerCase();
      if (query.isEmpty || haystack.contains(query)) {
        rows.add(row);
      }
    }
    return rows;
  }

  List<String> get _productCategories {
    return _products
        .map((product) => product.category?.trim() ?? '')
        .where((value) => value.isNotEmpty)
        .toSet()
        .toList(growable: false)
      ..sort();
  }

  String _rowKey(_SellableRow row) =>
      '${row.product.id}|${row.inventory.unitId}|${row.inventory.warehouseId}';

  int _quantityFor(_SellableRow row) => _quantities[_rowKey(row)] ?? 0;

  List<_SellableRow> get _selectedRows =>
      _allRows.where((row) => _quantityFor(row) > 0).toList(growable: false);

  Set<String> get _linkedCategoryIds => _selectedRows
      .map((row) => row.product.financeCategoryId)
      .whereType<String>()
      .where((value) => value.isNotEmpty)
      .toSet();

  bool get _requiresManualCategory => _linkedCategoryIds.length != 1;

  String? get _resolvedCategoryId =>
      _requiresManualCategory ? _manualCategoryId : _linkedCategoryIds.first;

  int get _selectedItemsCount =>
      _quantities.values.fold<int>(0, (sum, qty) => sum + qty);

  double get _cartTotal => _selectedRows.fold<double>(
    0,
    (sum, row) => sum + (_quantityFor(row) * row.inventory.price),
  );

  Wallet? get _selectedWallet {
    final walletId = _walletId;
    if (walletId == null || walletId.isEmpty) {
      return null;
    }

    for (final wallet in _wallets) {
      if (wallet.id == walletId) {
        return wallet;
      }
    }

    return null;
  }

  String get _selectedWalletName =>
      _selectedWallet?.name?.trim().isNotEmpty == true
      ? _selectedWallet!.name!.trim()
      : context.l10n.inventoryCheckoutNoWalletSelected;

  String get _selectedCurrency =>
      _selectedWallet?.currency?.trim().isNotEmpty == true
      ? _selectedWallet!.currency!.trim()
      : 'VND';

  void _switchTab(int tab) {
    setState(() {
      _activeTab = tab;
    });
  }

  String _validationMessage() {
    final l10n = context.l10n;
    if (_selectedRows.isEmpty) {
      return l10n.inventoryCheckoutProductsRequired;
    }
    if (_walletId == null || _walletId!.isEmpty) {
      return l10n.inventoryCheckoutWalletRequired;
    }
    if (_resolvedCategoryId == null || _resolvedCategoryId!.isEmpty) {
      return l10n.inventoryCheckoutCategoryRequired;
    }
    return l10n.inventoryCheckoutValidationError;
  }

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
        _validationMessage(),
        destructive: true,
      );
      return;
    }

    final walletId = _walletId;
    final resolvedCategoryId = _resolvedCategoryId;
    if (walletId == null || resolvedCategoryId == null) {
      return;
    }

    setState(() => _saving = true);
    try {
      final sale = widget.sale;
      if (sale != null) {
        final updated = await _inventoryRepository.updateSale(
          wsId: wsId,
          saleId: sale.id,
          notice: _titleController.text.trim().isEmpty
              ? null
              : _titleController.text.trim(),
          note: _noteController.text.trim().isEmpty
              ? null
              : _noteController.text.trim(),
          walletId: walletId,
          categoryId: resolvedCategoryId,
          products: _selectedRows
              .map(
                (row) => {
                  'product_id': row.product.id,
                  'unit_id': row.inventory.unitId,
                  'warehouse_id': row.inventory.warehouseId,
                  'quantity': _quantityFor(row),
                  'price': row.inventory.price,
                },
              )
              .toList(growable: false),
        );
        await _settingsRepository.setLastIncomeCategory(
          wsId,
          resolvedCategoryId,
        );

        if (!mounted) return;
        showInventoryToast(context, context.l10n.inventorySaleUpdated);
        context.pop(updated);
        return;
      }

      await _inventoryRepository.createSale(
        wsId: wsId,
        walletId: walletId,
        categoryId: resolvedCategoryId,
        content: _titleController.text.trim().isEmpty
            ? null
            : _titleController.text.trim(),
        notes: _noteController.text.trim().isEmpty
            ? null
            : _noteController.text.trim(),
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
      await _settingsRepository.setLastIncomeCategory(
        wsId,
        resolvedCategoryId,
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
    final pageTitle = widget.sale == null
        ? l10n.inventoryCheckoutTitle
        : l10n.inventorySalesEdit;
    final primaryActionLabel = widget.sale == null
        ? l10n.inventoryCheckoutSubmit
        : l10n.inventorySalesSave;

    if (_loading) {
      return FinanceFullscreenFormScaffold(
        title: pageTitle,
        primaryActionLabel: primaryActionLabel,
        onPrimaryPressed: null,
        child: const Center(child: NovaLoadingIndicator()),
      );
    }

    return FinanceFullscreenFormScaffold(
      title: pageTitle,
      primaryActionLabel: primaryActionLabel,
      onPrimaryPressed: _saving ? null : _submit,
      isSaving: _saving,
      footerTop: _CheckoutFooterSummary(
        walletLabel: l10n.inventoryCheckoutWallet,
        walletValue: _selectedWalletName,
        itemsLabel: l10n.inventoryCheckoutTotalItems,
        itemsValue: '$_selectedItemsCount',
        totalLabel: l10n.inventoryCheckoutCartTotal,
        totalValue: formatCurrency(_cartTotal, _selectedCurrency),
      ),
      child: ListView(
        padding: const EdgeInsets.only(bottom: 12),
        children: [
          InventoryHeroCard(
            title: pageTitle,
            icon: Icons.shopping_basket_outlined,
            metrics: [
              InventoryMetricTile(
                label: l10n.inventoryCheckoutCartTotal,
                value: formatCurrency(_cartTotal, 'VND'),
                icon: Icons.payments_outlined,
              ),
              InventoryMetricTile(
                label: l10n.inventoryCheckoutSelectedItems,
                value: '$_selectedItemsCount',
                icon: Icons.shopping_cart_checkout_rounded,
              ),
            ],
          ),
          const shad.Gap(16),
          _CheckoutTabSelector(
            browseLabel: l10n.inventoryCheckoutBrowseTab,
            cartLabel: l10n.inventoryCheckoutCartTab,
            cartCount: _selectedRows.length,
            activeTab: _activeTab,
            onChanged: _switchTab,
          ),
          const shad.Gap(16),
          if (_activeTab == _tabBrowse) ...[
            FinancePanel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (_productCategories.isNotEmpty) ...[
                    SizedBox(
                      height: 36,
                      child: ListView(
                        scrollDirection: Axis.horizontal,
                        children: [
                          _CategoryFilterChip(
                            label: l10n.inventoryCheckoutAllCategories,
                            selected: _selectedProductCategory == null,
                            onTap: () => setState(
                              () => _selectedProductCategory = null,
                            ),
                          ),
                          for (final category in _productCategories) ...[
                            const shad.Gap(8),
                            _CategoryFilterChip(
                              label: category,
                              selected: _selectedProductCategory == category,
                              onTap: () => setState(
                                () => _selectedProductCategory =
                                    _selectedProductCategory == category
                                    ? null
                                    : category,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const shad.Gap(12),
                  ],
                  TextField(
                    controller: _searchController,
                    onChanged: (_) => setState(() {}),
                    decoration: InputDecoration(
                      hintText: l10n.inventorySearchProducts,
                      prefixIcon: const Icon(Icons.search_rounded),
                      suffixIcon: _searchController.text.isEmpty
                          ? null
                          : IconButton(
                              onPressed: () {
                                _searchController.clear();
                                setState(() {});
                              },
                              icon: const Icon(Icons.close_rounded),
                            ),
                    ),
                  ),
                ],
              ),
            ),
            const shad.Gap(16),
            if (_visibleRows.isEmpty)
              FinanceEmptyState(
                icon: Icons.shopping_basket_outlined,
                title: l10n.inventoryCheckoutTitle,
                body: _allRows.isEmpty
                    ? l10n.inventoryCheckoutEmpty
                    : l10n.inventoryCheckoutNoSearchResults,
              )
            else
              FinanceSectionHeader(
                title: l10n.inventoryCheckoutAvailableProductsTitle,
              ),
            if (_visibleRows.isNotEmpty) const shad.Gap(12),
            if (_visibleRows.isNotEmpty)
              ..._visibleRows.map(
                (row) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _CheckoutProductCard(
                    row: row,
                    quantity: _quantityFor(row),
                    onDecrement: () =>
                        _changeQuantity(row, _quantityFor(row) - 1),
                    onIncrement: () =>
                        _changeQuantity(row, _quantityFor(row) + 1),
                  ),
                ),
              ),
          ] else ...[
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
                  TextField(
                    controller: _titleController,
                    decoration: InputDecoration(
                      labelText: l10n.inventorySalesTitle,
                    ),
                  ),
                  const shad.Gap(12),
                  TextField(
                    controller: _noteController,
                    minLines: 2,
                    maxLines: 4,
                    decoration: InputDecoration(
                      labelText: l10n.inventorySalesNote,
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
                        helperText:
                            l10n.inventoryCheckoutManualCategoryRequired,
                      ),
                    )
                  else
                    _CheckoutInfoRow(
                      label: l10n.inventoryCheckoutAutoCategory,
                      value:
                          _categories
                              .firstWhere(
                                (item) => item.id == _resolvedCategoryId,
                                orElse: () => const TransactionCategory(
                                  id: '',
                                  name: '',
                                ),
                              )
                              .name ??
                          '',
                    ),
                ],
              ),
            ),
            const shad.Gap(16),
            if (_selectedRows.isEmpty)
              FinanceEmptyState(
                icon: Icons.shopping_cart_outlined,
                title: l10n.inventoryCheckoutCartTab,
                body: l10n.inventoryCheckoutCartEmpty,
              )
            else ...[
              FinanceSectionHeader(
                title: l10n.inventoryCheckoutSelectedItems,
              ),
              const shad.Gap(12),
              ..._selectedRows.map(
                (row) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _CheckoutCartRowCard(
                    row: row,
                    quantity: _quantityFor(row),
                    onRemove: () => _changeQuantity(row, 0),
                    onDecrement: () =>
                        _changeQuantity(row, _quantityFor(row) - 1),
                    onIncrement: () =>
                        _changeQuantity(row, _quantityFor(row) + 1),
                  ),
                ),
              ),
            ],
          ],
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
    required this.quantity,
    required this.onDecrement,
    required this.onIncrement,
  });

  final _SellableRow row;
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
                formatCurrency(row.inventory.price, 'VND'),
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
    required this.quantity,
    required this.onRemove,
    required this.onDecrement,
    required this.onIncrement,
  });

  final _SellableRow row;
  final int quantity;
  final VoidCallback onRemove;
  final VoidCallback onDecrement;
  final VoidCallback onIncrement;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final subtotal = quantity * row.inventory.price;

    return FinancePanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
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
                      formatCurrency(subtotal, 'VND'),
                      style: theme.typography.large.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const shad.Gap(2),
                    Text(
                      '${formatCurrency(row.inventory.price, 'VND')} '
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
  const _CheckoutInfoRow({
    required this.label,
    required this.value,
  });

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
            style: theme.typography.small.copyWith(
              fontWeight: FontWeight.w700,
            ),
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
