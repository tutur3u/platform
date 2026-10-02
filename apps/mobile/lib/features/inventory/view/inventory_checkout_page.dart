import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/models/inventory/inventory_checkout_defaults.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/finance/widgets/finance_modal_scaffold.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/inventory/controllers/inventory_season_pricing_controller.dart';
import 'package:mobile/features/inventory/widgets/inventory_product_image.dart';
import 'package:mobile/features/inventory/widgets/inventory_season_price_status.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'inventory_checkout_operations.dart';
part 'inventory_checkout_cart.dart';
part 'inventory_checkout_pricing.dart';
part 'inventory_checkout_recovery.dart';
part 'inventory_checkout_widgets.dart';

Future<T?> showInventoryCheckoutPage<T>(
  BuildContext context, {
  InventorySaleDetail? sale,
  List<InventorySalesPeriod> initialSalesPeriods = const [],
}) {
  return showFinanceFullscreenModal<T>(
    context: context,
    builder: (context) => InventoryCheckoutPage(
      sale: sale,
      initialSalesPeriods: initialSalesPeriods,
    ),
  );
}

class InventoryCheckoutPage extends StatefulWidget {
  const InventoryCheckoutPage({
    this.sale,
    this.initialSalesPeriods = const [],
    this.inventoryRepository,
    this.financeRepository,
    this.settingsRepository,
    this.seasonController,
    this.actorId,
    this.actorChanges,
    super.key,
  });

  final InventorySaleDetail? sale;
  final List<InventorySalesPeriod> initialSalesPeriods;
  final InventoryRepository? inventoryRepository;
  final FinanceRepository? financeRepository;
  final SettingsRepository? settingsRepository;
  final InventorySeasonPricingController? seasonController;
  final String? Function()? actorId;
  final Stream<dynamic>? actorChanges;

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
  late final InventorySeasonPricingController _season;
  Timer? _quoteTimer;
  StreamSubscription<dynamic>? _authSubscription;
  int _loadGeneration = 0;
  String? _loadedActor;
  String? _loadedWorkspace;
  String? _scopeActor;
  String? _scopeWorkspace;
  int _scopeRevision = 0;
  bool _reloadAfterSave = false;
  bool _periodsAvailable = false;
  bool _scopeChanged = false;
  String? get _actorId => widget.actorId?.call() ?? currentCacheUserId();
  bool _loading = true;
  bool _saving = false;
  bool _saleCompleted = false;
  bool _hasUnavailableOptions = false;
  int _activeTab = _tabBrowse;
  List<InventoryProduct> _products = const [];
  List<Wallet> _wallets = const [];
  List<TransactionCategory> _categories = const [];
  List<InventorySalesPeriod> _salesPeriods = const [];
  final Map<String, int> _quantities = <String, int>{};
  String? _walletId;
  String? _manualCategoryId;
  String? _selectedProductCategory;
  String? _periodId;
  bool _periodSelectionExplicit = false;
  bool _walletSelectionExplicit = false;
  bool _categorySelectionExplicit = false;
  bool _categoryOverride = false;
  bool _reviewingCart = false;

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  @override
  void initState() {
    super.initState();
    _inventoryRepository = widget.inventoryRepository ?? InventoryRepository();
    _financeRepository = widget.financeRepository ?? FinanceRepository();
    _settingsRepository = widget.settingsRepository ?? SettingsRepository();
    _searchController = TextEditingController();
    _titleController = TextEditingController(text: widget.sale?.notice ?? '');
    _noteController = TextEditingController(text: widget.sale?.note ?? '');
    _salesPeriods = widget.initialSalesPeriods;
    _periodId = widget.sale?.period?.id;
    _season =
        widget.seasonController ??
        InventorySeasonPricingController(
          fetch: _inventoryRepository.getSeasonQuote,
          send: _inventoryRepository.sendScheduledSale,
          enqueueOffline: _inventoryRepository.queueScheduledSale,
          lookupReceipt: _inventoryRepository.getSaleReceipt,
          currentActor: () => _actorId,
          isOnline: () async => (await Connectivity().checkConnectivity()).any(
            (item) => item != ConnectivityResult.none,
          ),
        );
    _season.addListener(_quoteChanged);
    _authSubscription =
        (widget.actorChanges ?? maybeSupabase?.auth.onAuthStateChange)?.listen(
          (_) => _scopeReset(),
        );
    _quoteTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      _season.tick();
      if (_season.scheduled &&
          !_season.loading &&
          !_season.hasPending &&
          !_season.fresh) {
        unawaited(_season.refresh(automatic: true));
      }
    });
    _scopeActor = _actorId;
    _scopeWorkspace = _wsId;
    _syncSeason();
    unawaited(_load());
  }

  @override
  void dispose() {
    _quoteTimer?.cancel();
    unawaited(_authSubscription?.cancel());
    _season.removeListener(_quoteChanged);
    if (widget.seasonController == null) _season.dispose();
    _searchController.dispose();
    _titleController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _load() => _loadData();
  void _update(VoidCallback change) => setState(change);

  void _quoteChanged() {
    if (mounted) setState(() {});
  }

  void _scopeReset() {
    if (!mounted || (_scopeActor == _actorId && _scopeWorkspace == _wsId)) {
      return;
    }
    _loadGeneration++;
    _scopeRevision++;
    setState(() {
      _scopeActor = _actorId;
      _scopeWorkspace = _wsId;
      _loadedActor = null;
      _loadedWorkspace = null;
      _loading = widget.sale == null;
      _scopeChanged = widget.sale != null;
      _saleCompleted = false;
      _products = [];
      _wallets = [];
      _categories = [];
      _salesPeriods = [];
      _quantities.clear();
      _reviewingCart = false;
      _periodId = null;
      _periodSelectionExplicit = false;
      _walletSelectionExplicit = false;
      _categorySelectionExplicit = false;
      _categoryOverride = false;
      _walletId = null;
      _manualCategoryId = null;
      _periodsAvailable = false;
      _titleController.clear();
      _noteController.clear();
    });
    _syncSeason();
    if (!_scopeChanged) unawaited(_load());
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
      if (!_periodAllowsProduct(row.product.id)) continue;
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

  bool get _requiresManualCategory =>
      _categoryOverride || _linkedCategoryIds.length != 1;

  String? get _resolvedCategoryId =>
      _requiresManualCategory ? _manualCategoryId : _linkedCategoryIds.first;

  int get _selectedItemsCount =>
      _quantities.values.fold<int>(0, (sum, qty) => sum + qty);

  double get _cartTotal => _selectedRows.fold<double>(
    0,
    (sum, row) => sum + (_quantityFor(row) * (_priceFor(row) ?? 0)),
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
    if (_season.hasPending ||
        _saving ||
        _reviewingCart ||
        (next > _quantityFor(row) && !_periodAllowsProduct(row.product.id))) {
      return;
    }
    setState(() {
      if (next <= 0) {
        _quantities.remove(_rowKey(row));
      } else {
        _quantities[_rowKey(row)] = next;
      }
    });
  }

  Future<void> _submit() => _submitSale();

  @override
  Widget build(BuildContext context) =>
      BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (a, b) => a.currentWorkspace?.id != b.currentWorkspace?.id,
        listener: (_, _) => _scopeReset(),
        child: PopScope(canPop: !_saving, child: _buildCheckout(context)),
      );

  Widget _buildCheckout(BuildContext context) {
    final l10n = context.l10n;
    final pageTitle = widget.sale == null
        ? l10n.inventoryCheckoutTitle
        : l10n.inventorySalesEdit;
    final primaryActionLabel = widget.sale == null
        ? l10n.inventoryCheckoutSubmit
        : l10n.inventorySalesSave;

    if (_season.hasPending ||
        _season.completedInvoiceId != null ||
        _season.journalFailed) {
      return _buildRecovery(context);
    }

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
      onPrimaryPressed:
          _saving ||
              _reviewingCart ||
              _saleCompleted ||
              !_season.journalReady ||
              _scopeChanged ||
              _blockedHistory ||
              !_periodResolved ||
              (!_season.hasPending && !_completeQuote)
          ? null
          : _submit,
      isSaving: _saving,
      onClose: () {
        if (_season.hasPending) {
          showInventoryToast(
            context,
            l10n.inventorySeasonRetryPending,
            destructive: true,
          );
        } else if (!_saving) {
          context.pop();
        }
      },
      footerTop: _CheckoutFooterSummary(
        walletLabel: l10n.inventoryCheckoutWallet,
        walletValue: _selectedWalletName,
        itemsLabel: l10n.inventoryCheckoutTotalItems,
        itemsValue: '$_selectedItemsCount',
        totalLabel: l10n.inventoryCheckoutCartTotal,
        totalValue: _totalLabel,
      ),
      child: ListView(
        padding: const EdgeInsets.only(bottom: 12),
        children: [
          if (_scheduled && widget.sale == null)
            InventorySeasonPriceStatus(controller: _season),
          if (_scopeChanged)
            Text(l10n.inventoryCheckoutScopeChanged)
          else if (_blockedHistory)
            Text(l10n.inventorySeasonHistoricalReadOnly),
          InventoryHeroCard(
            title: pageTitle,
            icon: Icons.shopping_basket_outlined,
            metrics: [
              InventoryMetricTile(
                label: l10n.inventoryCheckoutCartTotal,
                value: _totalLabel,
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
          if (_hasUnavailableOptions) ...[
            _CheckoutOptionsAlert(onRetry: _load),
            const shad.Gap(16),
          ],
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
                            onTap: () =>
                                setState(() => _selectedProductCategory = null),
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
                    price: _priceFor(row),
                    seasonPricing: _scheduled,
                    currency: _scheduled ? _selectedCurrency : 'VND',
                    quantity: _quantityFor(row),
                    onDecrement: () =>
                        _changeQuantity(row, _quantityFor(row) - 1),
                    onIncrement: () =>
                        _changeQuantity(row, _quantityFor(row) + 1),
                  ),
                ),
              ),
          ] else ...[
            ..._cartContent(context),
          ],
        ],
      ),
    );
  }
}
