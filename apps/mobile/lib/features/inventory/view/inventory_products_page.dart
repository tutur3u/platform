import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_sync_refresh.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/models/inventory/inventory_stock_movement.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/inventory/inventory_catalog_signal.dart';
import 'package:mobile/features/inventory/inventory_permissions.dart';
import 'package:mobile/features/inventory/inventory_scan.dart';
import 'package:mobile/features/inventory/inventory_stock_summary.dart';
import 'package:mobile/features/inventory/view/inventory_product_detail_view.dart';
import 'package:mobile/features/inventory/view/inventory_product_editor_page.dart';
import 'package:mobile/features/inventory/widgets/inventory_pending_deletions.dart';
import 'package:mobile/features/inventory/widgets/inventory_product_filters.dart';
import 'package:mobile/features/inventory/widgets/inventory_product_row.dart';
import 'package:mobile/features/inventory/widgets/inventory_read_warning.dart';
import 'package:mobile/features/inventory/widgets/inventory_scan_sheet.dart';
import 'package:mobile/features/inventory/widgets/inventory_search_chrome.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/fab/extended_fab.dart';
import 'package:mobile/widgets/nova_refresh_indicator.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

part 'inventory_products_actions.dart';
part 'inventory_products_list.dart';

/// Opens the camera and returns the scanned text, or null when cancelled.
typedef InventoryScanCode = Future<String?> Function(BuildContext context);

/// Opens the product editor; resolves true when the product was saved.
typedef InventoryOpenEditor =
    Future<bool?> Function(BuildContext context, String? productId);

/// Opens an item's detail on compact layouts.
typedef InventoryOpenDetail =
    Future<void> Function(BuildContext context, InventoryProduct product);

/// Items workspace: search, filters and the item list, with the selected
/// item's detail beside it on wide layouts.
class InventoryProductsPage extends StatefulWidget {
  const InventoryProductsPage({
    this.inventoryRepository,
    this.permissionsRepository,
    this.scanCode,
    this.openEditor,
    this.openDetail,
    this.initialProductId,
    this.location = Routes.inventoryProducts,
    super.key,
  });

  /// Overrides the compact detail route.
  final InventoryOpenDetail? openDetail;

  /// Selection shown in the detail pane when the layout splits.
  final String? initialProductId;

  /// Shell location the search and scan actions register for.
  final String location;

  final InventoryRepository? inventoryRepository;
  final WorkspacePermissionsRepository? permissionsRepository;

  /// Overrides the camera scanner; the scan action shows whenever it is set.
  final InventoryScanCode? scanCode;

  /// Overrides the full-screen editor route.
  final InventoryOpenEditor? openEditor;

  @override
  State<InventoryProductsPage> createState() => _InventoryProductsPageState();
}

class _InventoryProductsPageState extends State<InventoryProductsPage>
    with OfflineSyncRefresh<InventoryProductsPage> {
  @override
  Future<void> refreshAfterOfflineSync() => _loadInitial();
  static const int _pageSize = 30;

  late final InventoryRepository _inventoryRepository;
  late final WorkspacePermissionsRepository _permissionsRepository;
  final TextEditingController _searchController = TextEditingController();
  final GlobalKey<InventorySearchChromeState> _searchKey = GlobalKey();
  final ScrollController _scrollController = ScrollController();
  Timer? _searchDebounce;

  List<InventoryProduct> _products = const [];
  String? _categoryId;
  String? _warehouseId;
  InventoryStockFilter _stockFilter = InventoryStockFilter.any;
  InventoryProductSort _sort = InventoryProductSort.newest;
  List<InventoryLookupItem>? _categories;
  List<InventoryLookupItem>? _warehouses;
  String? _selectedId;
  InventoryProduct? _selected;
  bool _split = false;
  String _currency = 'VND';

  /// Extra pages fetched to fill a client-side filter; bounded per load.
  int _fillPages = 0;
  bool _filling = false;

  /// The load request the running fill loop belongs to.
  int _fillToken = 0;
  bool _canAdjustStock = false;
  final Map<String, String> _deletedNames = {};
  int _count = 0;
  bool _canManageCatalog = false;

  /// Null until permissions load, so an empty stock list is not mislabelled.
  bool? _canViewStock;
  bool _isLoadingInitial = false;
  bool _isLoadingMore = false;
  bool _hasMore = true;
  bool _loadMoreFailed = false;
  String? _error;
  int _page = 1;
  String _status = 'active';

  /// The server filter and query the visible rows belong to. Rows are reused
  /// only for the same key, so a slow or failed load never shows another
  /// filter.
  (String, String, String?, InventoryProductSort)? _loadedKey;

  /// The query a scan filled in, shown in the body because the navbar search
  /// field stays closed.
  String? _scanQuery;
  int _requestToken = 0;
  (String?, String?)? _loadedScope;

  (String?, String?) get _scope =>
      (context.read<AuthCubit>().state.user?.id, _wsId);

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  String get _query => _searchController.text;

  @override
  void initState() {
    super.initState();
    _inventoryRepository = widget.inventoryRepository ?? InventoryRepository();
    _permissionsRepository =
        widget.permissionsRepository ?? WorkspacePermissionsRepository();
    final workspaceId = _wsId;
    final cachedPermissions = workspaceId == null
        ? null
        : _permissionsRepository.peekPermissions(workspaceId);
    if (cachedPermissions != null) _applyPermissions(cachedPermissions);
    if (workspaceId != null) _currency = _peekCurrency(workspaceId);
    _selectedId = widget.initialProductId;
    _loadedScope = _scope;
    _scrollController.addListener(_onScroll);
    unawaited(Future<void>.delayed(Duration.zero, _loadInitial));
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _applyPermissions(WorkspacePermissions permissions) {
    _canManageCatalog = canManageInventoryCatalog(permissions);
    _canViewStock = canViewInventoryStock(permissions);
    _canAdjustStock = canAdjustInventoryStock(permissions);
  }

  Future<void> _refreshPermissions((String?, String?) scope, int token) async {
    bool current() => mounted && _scope == scope && token == _requestToken;
    if (scope.$1 == null || scope.$2 == null) return;
    final cached = await _permissionsRepository.readCachedPermissions(
      scope.$2!,
    );
    if (!current()) return;
    setState(() => _applyPermissions(cached));
    final fresh = await _permissionsRepository.getPermissions(wsId: scope.$2!);
    if (!current()) return;
    setState(() => _applyPermissions(fresh));
  }

  void _set(VoidCallback change) => setState(change);

  bool _isStale(int token) =>
      !mounted || token != _requestToken || _loadedScope != _scope;

  Future<void> _loadInitial({bool forceRefresh = false}) async {
    final wsId = _wsId;
    if (wsId == null || _scope.$1 == null) {
      ++_requestToken;
      setState(() {
        _products = const [];
        _count = 0;
        _canManageCatalog = false;
        _canViewStock = null;
        _deletedNames.clear();
        _selectedId = null;
        _selected = null;
      });
      return;
    }
    final requestToken = ++_requestToken;
    final scope = _scope;
    final sameScope = _loadedScope == scope;
    _loadedScope = scope;
    if (!sameScope) {
      _deletedNames.clear();
      _canManageCatalog = false;
      _canViewStock = null;
      _categories = null;
      _warehouses = null;
      _categoryId = null;
      _warehouseId = null;
      _selectedId = null;
      _selected = null;
      _currency = _peekCurrency(wsId);
    }
    unawaited(_refreshPermissions(scope, requestToken));

    final key = (_status, _query, _categoryId, _sort);
    final sameKey = sameScope && _loadedKey == key;
    final plain = _categoryId == null && _sort == InventoryProductSort.newest;
    final cached = plain
        ? _inventoryRepository.peekProducts(
            wsId,
            query: _query,
            status: _status,
            pageSize: _pageSize,
          )
        : null;
    setState(() {
      _products = cached?.data ?? (sameKey ? _products : const []);
      _count = cached?.count ?? (sameKey ? _count : 0);
      _loadedKey = key;
      _isLoadingInitial = true;
      _isLoadingMore = false;
      _loadMoreFailed = false;
      _error = null;
      _page = 1;
      _fillPages = 0;
    });

    try {
      final products = await CacheStore.awaitRevalidation(
        () => _inventoryRepository.getProducts(
          wsId,
          query: _query,
          status: _status,
          pageSize: _pageSize,
          forceRefresh: forceRefresh,
          categoryId: _categoryId,
          sort: _sort,
        ),
      );
      if (_isStale(requestToken)) return;
      setState(() {
        _products = products.data;
        _count = products.count;
        _hasMore = _products.length < _count;
        _error = null;
        _syncSelection();
      });
    } on ApiException catch (error) {
      if (_isStale(requestToken)) return;
      setState(() {
        if (error.statusCode == 401 || error.statusCode == 403) {
          _products = const [];
          _count = 0;
          _canManageCatalog = false;
        }
        _error = error.message.isNotEmpty
            ? error.message
            : context.l10n.commonSomethingWentWrong;
      });
    } on Exception {
      if (_isStale(requestToken)) return;
      setState(() => _error = context.l10n.commonSomethingWentWrong);
    } finally {
      if (mounted && requestToken == _requestToken) {
        setState(() => _isLoadingInitial = false);
      }
    }
    // Runs after the loading flags clear so its page loads are admitted.
    if (!_isStale(requestToken) && _error == null) {
      unawaited(_fillClientFilter());
    }
  }

  Future<void> _loadMore() async {
    final wsId = _wsId;
    final requestToken = _requestToken;
    if (wsId == null || _isLoadingInitial || _isLoadingMore || !_hasMore) {
      return;
    }
    setState(() {
      _isLoadingMore = true;
      _loadMoreFailed = false;
    });
    try {
      final nextPage = _page + 1;
      final result = await _inventoryRepository.getProducts(
        wsId,
        query: _query,
        status: _status,
        page: nextPage,
        pageSize: _pageSize,
        categoryId: _categoryId,
        sort: _sort,
      );
      if (_isStale(requestToken)) return;
      setState(() {
        _products = [..._products, ...result.data];
        _count = result.count;
        _page = nextPage;
        _hasMore = _products.length < _count;
      });
    } on Exception {
      if (_isStale(requestToken)) return;
      setState(() => _loadMoreFailed = true);
    } finally {
      if (mounted && requestToken == _requestToken) {
        setState(() => _isLoadingMore = false);
      }
    }
    // A page loaded by scrolling continues an unfinished filter fill.
    if (!_filling && !_isStale(requestToken)) {
      unawaited(_fillClientFilter());
    }
  }

  void _onScroll() {
    // A failed page waits for its explicit retry instead of looping.
    if (!_scrollController.hasClients || _loadMoreFailed) return;
    final position = _scrollController.position;
    if (position.maxScrollExtent - position.pixels <= 200) {
      unawaited(_loadMore());
    }
  }

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    setState(() {
      if (value != _scanQuery) _scanQuery = null;
    });
    _searchDebounce = Timer(const Duration(milliseconds: 300), _loadInitial);
  }

  @override
  Widget build(BuildContext context) => BlocListener<AuthCubit, AuthState>(
    listenWhen: (a, b) => a.user?.id != b.user?.id,
    listener: (_, _) => unawaited(_loadInitial()),
    child: BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (previous, current) =>
          previous.currentWorkspace?.id != current.currentWorkspace?.id,
      listener: (context, state) => unawaited(_loadInitial()),
      child: _buildBody(context),
    ),
  );
}
