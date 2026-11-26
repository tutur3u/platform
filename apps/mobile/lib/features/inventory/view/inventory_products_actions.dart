part of 'inventory_products_page.dart';

extension _InventoryProductsActions on _InventoryProductsPageState {
  static const _maxFillPages = 4;
  static const _fillTarget = 12;

  String _peekCurrency(String wsId) {
    try {
      return FinanceRepository().peekWorkspaceDefaultCurrency(wsId) ?? 'VND';
    } on Object {
      return 'VND';
    }
  }

  bool get _clientFiltered =>
      _warehouseId != null || _stockFilter != InventoryStockFilter.any;

  /// Loaded rows that pass the warehouse and stock filters.
  List<InventoryProduct> get _visibleProducts {
    if (!_clientFiltered) return _products;
    return [
      for (final product in _products)
        if (inventoryProductInWarehouse(product, _warehouseId) &&
            InventoryStockSummary.of(
              product,
              stockVisible: _canViewStock,
            ).matches(_stockFilter))
          product,
    ];
  }

  /// The API cannot filter by warehouse or stock, so while too few loaded
  /// rows match, up to [_maxFillPages] more pages load one after another.
  /// Each reload or filter change resets the budget; once it runs out the
  /// list offers to search further instead of claiming nothing matches.
  Future<void> _fillClientFilter() async {
    // One loop per load request: a reload starts its own loop even while
    // the previous request's loop is still unwinding.
    if (_filling && _fillToken == _requestToken) return;
    _filling = true;
    final token = _fillToken = _requestToken;
    try {
      while (mounted &&
          token == _requestToken &&
          _error == null &&
          _clientFiltered &&
          _hasMore &&
          !_loadMoreFailed &&
          !_isLoadingInitial &&
          !_isLoadingMore &&
          _fillPages < _maxFillPages &&
          _visibleProducts.length < _fillTarget) {
        _fillPages++;
        final loaded = _products.length;
        _set(() {});
        await _loadMore();
        if (_products.length == loaded) break;
      }
    } finally {
      if (_fillToken == token) _filling = false;
      if (mounted) {
        _set(() {});
        // A request that settled while this loop held the flag still fills.
        // A reload that failed keeps its retry state instead of filling.
        if (token != _requestToken &&
            !_filling &&
            !_isLoadingInitial &&
            _error == null) {
          unawaited(_fillClientFilter());
        }
      }
    }
  }

  /// Whether the fill budget ran out with unloaded rows left.
  bool get _fillExhausted =>
      _clientFiltered &&
      _hasMore &&
      !_filling &&
      !_isLoadingInitial &&
      !_isLoadingMore &&
      _fillPages >= _maxFillPages;

  void _searchMore() {
    _set(() {
      _fillPages = 0;
      _loadMoreFailed = false;
    });
    unawaited(_fillClientFilter());
  }

  /// Keeps the open item in step with the freshly loaded row.
  void _syncSelection() {
    final id = _selectedId;
    if (id == null) return;
    _selected = _products.where((row) => row.id == id).firstOrNull ?? _selected;
  }

  void _selectStatus(String status) {
    if (status == _status) return;
    _set(() => _status = status);
    unawaited(_loadInitial());
  }

  void _setFilters({
    String? Function()? category,
    String? Function()? warehouse,
    InventoryStockFilter? stock,
    InventoryProductSort? sort,
  }) {
    final serverChanged =
        (category != null && category() != _categoryId) ||
        (sort != null && sort != _sort);
    _set(() {
      if (category != null) _categoryId = category();
      if (warehouse != null) _warehouseId = warehouse();
      if (stock != null) _stockFilter = stock;
      if (sort != null) _sort = sort;
      _fillPages = 0;
    });
    if (serverChanged) {
      unawaited(_loadInitial());
    } else {
      unawaited(_fillClientFilter());
    }
  }

  void _clearFilters() {
    _searchDebounce?.cancel();
    _searchController.clear();
    _set(() {
      _scanQuery = null;
      _categoryId = null;
      _warehouseId = null;
      _stockFilter = InventoryStockFilter.any;
    });
    unawaited(_loadInitial());
  }

  Future<List<InventoryLookupItem>?> _options({
    required bool warehouses,
  }) async {
    final wsId = _wsId;
    if (wsId == null) return null;
    final cached = warehouses ? _warehouses : _categories;
    if (cached != null) return cached;
    try {
      final rows = warehouses
          ? await _inventoryRepository.getProductWarehouses(wsId)
          : await _inventoryRepository.getProductCategories(wsId);
      if (!mounted || _wsId != wsId) return null;
      _set(() {
        if (warehouses) {
          _warehouses = rows;
        } else {
          _categories = rows;
        }
      });
      return rows;
    } on Object {
      if (mounted) {
        showAppToast(
          context,
          message: context.l10n.inventoryFilterOptionsFailed,
        );
      }
      return null;
    }
  }

  Future<void> _pickLookup({required bool warehouses}) async {
    final rows = await _options(warehouses: warehouses);
    if (!mounted || rows == null) return;
    final l10n = context.l10n;
    const none = '';
    final picked = await showAppChoiceSheet<String>(
      context: context,
      title: warehouses
          ? l10n.inventoryFilterWarehouse
          : l10n.inventoryFilterCategory,
      selected: (warehouses ? _warehouseId : _categoryId) ?? none,
      choices: [
        AppSheetChoice(
          value: none,
          label: warehouses
              ? l10n.inventoryFilterAllWarehouses
              : l10n.inventoryFilterAllCategories,
        ),
        for (final row in rows) AppSheetChoice(value: row.id, label: row.name),
      ],
    );
    if (!mounted || picked == null) return;
    final value = picked == none ? null : picked;
    if (warehouses) {
      _setFilters(warehouse: () => value);
    } else {
      _setFilters(category: () => value);
    }
  }

  Future<void> _pickStock() async {
    final picked = await showAppChoiceSheet<InventoryStockFilter>(
      context: context,
      title: context.l10n.inventoryFilterStock,
      selected: _stockFilter,
      choices: [
        for (final filter in InventoryStockFilter.values)
          AppSheetChoice(
            value: filter,
            label: inventoryStockFilterLabel(context, filter),
          ),
      ],
    );
    if (mounted && picked != null) _setFilters(stock: picked);
  }

  Future<void> _pickSort() async {
    final picked = await showAppChoiceSheet<InventoryProductSort>(
      context: context,
      title: context.l10n.inventorySortTitle,
      selected: _sort,
      choices: [
        for (final sort in InventoryProductSort.values)
          AppSheetChoice(value: sort, label: inventorySortLabel(context, sort)),
      ],
    );
    if (mounted && picked != null) _setFilters(sort: picked);
  }

  void _applyQuery(String? query, {String? status}) {
    _searchDebounce?.cancel();
    _searchController.text = query ?? '';
    _set(() {
      _scanQuery = query;
      if (status != null) _status = status;
    });
    unawaited(_loadInitial());
  }

  /// Wide layouts show the item beside the list; compact ones open its page.
  Future<void> _openProduct(InventoryProduct product) async {
    if (_split) {
      _set(() {
        _selectedId = product.id;
        _selected = product;
      });
      return;
    }
    final revision = inventoryCatalogRevision.value;
    final open = widget.openDetail;
    if (open != null) {
      await open(context, product);
    } else {
      await context.push(Routes.inventoryProductDetailPath(product.id));
    }
    // Keep loaded pages and scroll unless the detail changed something.
    if (mounted && inventoryCatalogRevision.value != revision) {
      unawaited(_loadInitial(forceRefresh: true));
    }
  }

  void _closeSelection() => _set(() {
    _selectedId = null;
    _selected = null;
  });

  Future<void> _openEditor({String? productId}) async {
    final open = widget.openEditor;
    final saved = open != null
        ? await open(context, productId)
        : await showInventoryProductEditorPage<bool>(
            context,
            productId: productId,
            canAdjustStock: _canAdjustStock,
          );
    if (saved == true && mounted) {
      await _loadInitial(forceRefresh: true);
    }
  }

  Future<void> _deleteProduct(InventoryProduct product) async {
    final wsId = _wsId;
    if (wsId == null) return;
    final scope = _scope;
    final l10n = context.l10n;
    final deleted = await showAppAsyncConfirmDialog(
      context: context,
      title: l10n.commonDelete,
      message: l10n.inventoryProductDeleteConfirm,
      cancelLabel: l10n.commonCancel,
      confirmLabel: l10n.commonDelete,
      describeError: (_) => l10n.commonSomethingWentWrong,
      onConfirm: () async {
        if (!mounted || _scope != scope || !_canManageCatalog) {
          throw StateError('scope changed');
        }
        _deletedNames[product.id] = product.name ?? product.id;
        await _inventoryRepository.deleteProduct(
          wsId: wsId,
          productId: product.id,
        );
      },
    );
    if (!deleted || !mounted || _wsId != wsId) return;
    if (_selectedId == product.id) _closeSelection();
    await _loadInitial();
  }

  Future<void> _showItemActions(InventoryProduct product) async {
    final l10n = context.l10n;
    final name = product.name?.trim() ?? '';
    await showAppActionSheet<void>(
      context: context,
      title: name.isEmpty ? l10n.inventoryProductUntitled : name,
      actions: [
        AppSheetAction(
          label: l10n.commonEdit,
          icon: LucideIcons.pencil,
          onPressed: () => _openEditor(productId: product.id),
        ),
        AppSheetAction(
          label: l10n.commonDelete,
          icon: LucideIcons.trash2,
          destructive: true,
          onPressed: () => _deleteProduct(product),
        ),
      ],
    );
  }

  Future<void> _scan() async {
    final scanCode = widget.scanCode ?? showInventoryScanSheet;
    final code = await scanCode(context);
    if (!mounted || code == null) return;
    if (code == inventoryScanSearchInsteadCode) {
      _searchKey.currentState?.open();
      return;
    }
    switch (resolveInventoryScan(code)) {
      case null:
        return;
      case InventoryScanSearch(:final query):
        _applyQuery(query);
      case InventoryScanUnsupported():
        showAppToast(context, message: context.l10n.inventoryScanNotProduct);
      case InventoryScanProduct(:final productId):
        await _openScannedProduct(productId);
    }
  }

  Future<void> _openScannedProduct(String productId) async {
    final wsId = _wsId;
    if (wsId == null) return;
    final scope = _scope;
    InventoryProduct? product;
    try {
      product = await _inventoryRepository.getProduct(wsId, productId);
    } on Exception {
      product = null;
    }
    if (!mounted || _scope != scope) return;
    if (product == null) {
      showAppToast(context, message: context.l10n.inventoryScanNotFound);
    } else {
      await _openProduct(product);
    }
  }
}
