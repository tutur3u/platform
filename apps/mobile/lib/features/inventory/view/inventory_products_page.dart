import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_sync_refresh.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/inventory/inventory_permissions.dart';
import 'package:mobile/features/inventory/view/inventory_product_editor_page.dart';
import 'package:mobile/features/inventory/widgets/inventory_pending_deletions.dart';
import 'package:mobile/features/inventory/widgets/inventory_product_card.dart';
import 'package:mobile/features/inventory/widgets/inventory_read_warning.dart';
import 'package:mobile/features/inventory/widgets/inventory_search_chrome.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';
import 'package:mobile/widgets/fab/extended_fab.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class InventoryProductsPage extends StatefulWidget {
  const InventoryProductsPage({
    this.inventoryRepository,
    this.financeRepository,
    this.permissionsRepository,
    super.key,
  });

  final InventoryRepository? inventoryRepository;
  final FinanceRepository? financeRepository;
  final WorkspacePermissionsRepository? permissionsRepository;

  @override
  State<InventoryProductsPage> createState() => _InventoryProductsPageState();
}

class _InventoryProductsPageState extends State<InventoryProductsPage>
    with OfflineSyncRefresh<InventoryProductsPage> {
  @override
  Future<void> refreshAfterOfflineSync() => _loadInitial();
  static const int _pageSize = 24;

  late final InventoryRepository _inventoryRepository;
  late final FinanceRepository _financeRepository;
  late final WorkspacePermissionsRepository _permissionsRepository;
  late final TextEditingController _searchController;
  final ScrollController _scrollController = ScrollController();
  Timer? _searchDebounce;

  List<InventoryProduct> _products = const [];
  final Map<String, String> _deletedNames = {};
  int _count = 0;
  String _currency = 'USD';
  bool _canManageCatalog = false;
  bool _isLoadingInitial = false;
  bool _isLoadingMore = false;
  bool _hasMore = true;
  String? _error;
  int _page = 1;
  String _loadedQuery = '';
  int _requestToken = 0;
  (String?, String?)? _loadedScope;

  (String?, String?) get _scope =>
      (context.read<AuthCubit>().state.user?.id, _wsId);

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  @override
  void initState() {
    super.initState();
    _inventoryRepository = widget.inventoryRepository ?? InventoryRepository();
    _financeRepository = widget.financeRepository ?? FinanceRepository();
    final workspaceId = context
        .read<WorkspaceCubit>()
        .state
        .currentWorkspace
        ?.id;
    if (workspaceId != null) {
      _currency =
          _financeRepository.peekWorkspaceDefaultCurrency(workspaceId) ??
          _currency;
    }
    _permissionsRepository =
        widget.permissionsRepository ?? WorkspacePermissionsRepository();
    _searchController = TextEditingController();
    final cachedPermissions = workspaceId == null
        ? null
        : _permissionsRepository.peekPermissions(workspaceId);
    if (cachedPermissions != null) _applyPermissions(cachedPermissions);
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

  Future<void> _loadInitial({bool forceRefresh = false}) async {
    final wsId = _wsId;
    if (wsId == null || _scope.$1 == null) {
      ++_requestToken;
      setState(() {
        _products = const [];
        _count = 0;
        _canManageCatalog = false;
        _deletedNames.clear();
      });
      return;
    }
    final requestToken = ++_requestToken;
    final scope = _scope;
    final sameScope = _loadedScope == scope;
    _loadedScope = scope;
    if (!sameScope) {
      _deletedNames.clear();
      _applyPermissions(
        const WorkspacePermissions(permissions: {}, isCreator: false),
      );
    }
    unawaited(_refreshPermissions(scope, requestToken));

    final cached = _inventoryRepository.peekProducts(
      wsId,
      query: _searchController.text,
      pageSize: _pageSize,
    );
    setState(() {
      _products =
          cached?.data ??
          (sameScope && _loadedQuery == _searchController.text
              ? _products
              : const []);
      _loadedQuery = _searchController.text;
      _count = cached?.count ?? (sameScope ? _count : 0);
      _currency =
          _financeRepository.peekWorkspaceDefaultCurrency(wsId) ?? 'USD';
      _isLoadingInitial = true;
      _isLoadingMore = false;
      _error = null;
      _page = 1;
    });

    try {
      final results = await Future.wait<dynamic>([
        CacheStore.awaitRevalidation(
          () => _inventoryRepository.getProducts(
            wsId,
            query: _searchController.text,
            pageSize: _pageSize,
            forceRefresh: forceRefresh,
          ),
        ),
        _financeRepository.getWorkspaceDefaultCurrency(wsId),
      ]);

      if (!mounted || requestToken != _requestToken || _loadedScope != _scope) {
        return;
      }

      final products = results[0] as ({List<InventoryProduct> data, int count});
      final currency = results[1] as String;

      setState(() {
        _products = products.data;
        _count = products.count;
        _currency = currency;
        _hasMore = _products.length < _count;
        _error = null;
      });
    } on ApiException catch (error) {
      if (!mounted || requestToken != _requestToken || _loadedScope != _scope) {
        return;
      }
      setState(() {
        if (error.statusCode == 401 || error.statusCode == 403) {
          _products = [];
          _count = 0;
          _canManageCatalog = false;
        }
        _error = error.message.isNotEmpty
            ? error.message
            : context.l10n.commonSomethingWentWrong;
      });
    } on Exception {
      if (!mounted || requestToken != _requestToken || _loadedScope != _scope) {
        return;
      }
      setState(() {
        _error = context.l10n.commonSomethingWentWrong;
      });
    } finally {
      if (mounted && requestToken == _requestToken) {
        setState(() {
          _isLoadingInitial = false;
        });
      }
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
    });

    try {
      final nextPage = _page + 1;
      final result = await _inventoryRepository.getProducts(
        wsId,
        query: _searchController.text,
        page: nextPage,
        pageSize: _pageSize,
      );

      if (!mounted || requestToken != _requestToken || _loadedScope != _scope) {
        return;
      }

      setState(() {
        _products = [..._products, ...result.data];
        _count = result.count;
        _page = nextPage;
        _hasMore = _products.length < _count;
      });
    } on Exception {
      if (!mounted || requestToken != _requestToken || _loadedScope != _scope) {
        return;
      }
      setState(() {
        _hasMore = _products.length < _count;
      });
    } finally {
      if (mounted && requestToken == _requestToken) {
        setState(() {
          _isLoadingMore = false;
        });
      }
    }
  }

  void _onScroll() {
    if (!_scrollController.hasClients) {
      return;
    }
    final position = _scrollController.position;
    if (position.maxScrollExtent - position.pixels <= 200) {
      unawaited(_loadMore());
    }
  }

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    setState(() {});
    _searchDebounce = Timer(const Duration(milliseconds: 300), _loadInitial);
  }

  Future<void> _openEditor({String? productId}) async {
    final saved = await showInventoryProductEditorPage<bool>(
      context,
      productId: productId,
    );
    if (saved == true && mounted) {
      await _loadInitial(forceRefresh: true);
    }
  }

  Future<void> _deleteProduct(InventoryProduct product) async {
    final wsId = _wsId;
    if (wsId == null) return;
    final scope = _scope;
    final confirmed = await showAdaptiveSheet<bool>(
      context: context,
      maxDialogWidth: 420,
      builder: (_) => AsyncDeleteConfirmationDialog(
        toastContext: context,
        title: context.l10n.commonDelete,
        message: context.l10n.inventoryProductDeleteConfirm,
        cancelLabel: context.l10n.commonCancel,
        confirmLabel: context.l10n.commonDelete,
        onConfirm: () async {
          if (!mounted || _scope != scope || !_canManageCatalog) {
            throw StateError(context.l10n.commonSomethingWentWrong);
          }
          _deletedNames[product.id] = product.name ?? product.id;
          await _inventoryRepository.deleteProduct(
            wsId: wsId,
            productId: product.id,
          );
        },
      ),
    );
    if (confirmed == true && mounted && _wsId == wsId) await _loadInitial();
  }

  @override
  Widget build(BuildContext context) {
    return shad.Scaffold(
      child: BlocListener<AuthCubit, AuthState>(
        listenWhen: (a, b) => a.user?.id != b.user?.id,
        listener: (_, _) => unawaited(_loadInitial()),
        child: BlocListener<WorkspaceCubit, WorkspaceState>(
          listenWhen: (previous, current) =>
              previous.currentWorkspace?.id != current.currentWorkspace?.id,
          listener: (context, state) => unawaited(_loadInitial()),
          child: Builder(
            builder: (context) {
              final l10n = context.l10n;
              final lowStockCount = _products
                  .where(inventoryProductHasLowStock)
                  .length;

              return ResponsiveWrapper(
                maxWidth: ResponsivePadding.maxContentWidth(
                  context.deviceClass,
                ),
                child: Stack(
                  children: [
                    InventorySearchChrome(
                      location: Routes.inventoryProducts,
                      controller: _searchController,
                      onChanged: _onSearchChanged,
                      hint: l10n.inventorySearchProducts,
                    ),
                    NovaRefreshIndicator(
                      onRefresh: () => _loadInitial(forceRefresh: true),
                      child: ListView(
                        controller: _scrollController,
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: EdgeInsets.fromLTRB(
                          16,
                          8,
                          16,
                          108 + MediaQuery.paddingOf(context).bottom,
                        ),
                        children: [
                          if (_error != null)
                            InventoryReadWarning(
                              onRetry: () =>
                                  unawaited(_loadInitial(forceRefresh: true)),
                            ),
                          FinancePanel(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Wrap(
                                  spacing: 12,
                                  runSpacing: 8,
                                  children: [
                                    FinanceStatChip(
                                      label: l10n.inventoryProductsLabel,
                                      value: '$_count',
                                      icon: Icons.inventory_2_outlined,
                                    ),
                                    FinanceStatChip(
                                      label: l10n.inventoryLoadedLowStock,
                                      value: '$lowStockCount',
                                      icon: Icons.warning_amber_outlined,
                                    ),
                                  ],
                                ),
                                const shad.Gap(14),
                              ],
                            ),
                          ),
                          const shad.Gap(18),
                          InventoryPendingDeletions(
                            userId: _scope.$1,
                            workspaceId: _wsId,
                            names: _deletedNames,
                          ),
                          if (_isLoadingInitial && _products.isEmpty)
                            const FinanceSkeletonBlock(height: 160, radius: 20)
                          else if (_products.isEmpty)
                            InventoryEmptyPanel(
                              body: l10n.inventoryProductsEmpty,
                            )
                          else ...[
                            ..._products.map(
                              (product) => Padding(
                                padding: const EdgeInsets.only(bottom: 12),
                                child: PendingSyncFrame(
                                  workspaceId: _wsId ?? product.wsId,
                                  entityId: product.id,
                                  feature: 'inventory',
                                  child: InventoryProductCard(
                                    product: product,
                                    currency: _currency,
                                    onDelete: _canManageCatalog
                                        ? () => _deleteProduct(product)
                                        : null,
                                    onTap: _canManageCatalog
                                        ? () =>
                                              _openEditor(productId: product.id)
                                        : null,
                                  ),
                                ),
                              ),
                            ),
                            if (_isLoadingMore)
                              const Padding(
                                padding: EdgeInsets.symmetric(vertical: 16),
                                child: Center(
                                  child: NovaLoadingIndicator(size: 20),
                                ),
                              ),
                          ],
                        ],
                      ),
                    ),
                    if (_canManageCatalog)
                      ExtendedFab(
                        icon: Icons.add_rounded,
                        label: l10n.inventoryCreateProduct,
                        includeBottomSafeArea: false,
                        onPressed: _openEditor,
                      ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}
