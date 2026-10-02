import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/inventory/inventory_permissions.dart';
import 'package:mobile/features/inventory/view/inventory_product_editor_page.dart';
import 'package:mobile/features/inventory/widgets/inventory_product_card.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
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

class _InventoryProductsPageState extends State<InventoryProductsPage> {
  static const int _pageSize = 24;

  late final InventoryRepository _inventoryRepository;
  late final FinanceRepository _financeRepository;
  late final WorkspacePermissionsRepository _permissionsRepository;
  late final TextEditingController _searchController;
  final ScrollController _scrollController = ScrollController();
  Timer? _searchDebounce;

  List<InventoryProduct> _products = const [];
  int _count = 0;
  String _currency = 'USD';
  bool _canManageCatalog = false;
  bool _isLoadingInitial = false;
  bool _isLoadingMore = false;
  bool _hasMore = true;
  String? _error;
  int _page = 1;
  int _requestToken = 0;

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

  Future<void> _loadInitial({bool forceRefresh = false}) async {
    final wsId = _wsId;
    if (wsId == null) {
      return;
    }
    final requestToken = ++_requestToken;

    final cached = _inventoryRepository.peekProducts(
      wsId,
      query: _searchController.text,
      pageSize: _pageSize,
    );
    setState(() {
      _products = cached?.data ?? [];
      _count = cached?.count ?? 0;
      _currency =
          _financeRepository.peekWorkspaceDefaultCurrency(wsId) ?? 'USD';
      _canManageCatalog = false;
      _isLoadingInitial = true;
      _isLoadingMore = false;
      _error = null;
      _page = 1;
    });

    try {
      final results = await Future.wait<dynamic>([
        _inventoryRepository.getProducts(
          wsId,
          query: _searchController.text,
          pageSize: _pageSize,
          forceRefresh: forceRefresh,
        ),
        _financeRepository.getWorkspaceDefaultCurrency(wsId),
        _permissionsRepository.getPermissions(wsId: wsId),
      ]);

      if (!mounted || requestToken != _requestToken) {
        return;
      }

      final products = results[0] as ({List<InventoryProduct> data, int count});
      final currency = results[1] as String;
      final permissions = results[2] as WorkspacePermissions;

      setState(() {
        _products = products.data;
        _count = products.count;
        _currency = currency;
        _canManageCatalog = canManageInventoryCatalog(permissions);
        _hasMore = _products.length < _count;
        _error = null;
      });
    } on ApiException catch (error) {
      if (!mounted || requestToken != _requestToken) {
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
      if (!mounted || requestToken != _requestToken) {
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

      if (!mounted || requestToken != _requestToken) {
        return;
      }

      setState(() {
        _products = [..._products, ...result.data];
        _count = result.count;
        _page = nextPage;
        _hasMore = _products.length < _count;
      });
    } on Exception {
      if (!mounted || requestToken != _requestToken) {
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

  @override
  Widget build(BuildContext context) {
    return shad.Scaffold(
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (previous, current) =>
            previous.currentWorkspace?.id != current.currentWorkspace?.id,
        listener: (context, state) => unawaited(_loadInitial()),
        child: Builder(
          builder: (context) {
            if (_isLoadingInitial && _products.isEmpty) {
              return const Center(child: NovaLoadingIndicator());
            }

            if (_error != null && _products.isEmpty) {
              return _InventoryProductsError(
                onRetry: () => unawaited(_loadInitial(forceRefresh: true)),
              );
            }

            final l10n = context.l10n;
            final lowStockCount = _products
                .where(inventoryProductHasLowStock)
                .length;

            return ResponsiveWrapper(
              maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
              child: Stack(
                children: [
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
                        FinancePanel(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  InventoryMetricTile(
                                    label: l10n.inventoryProductsLabel,
                                    value: '$_count',
                                    icon: Icons.inventory_2_outlined,
                                  ),
                                  InventoryMetricTile(
                                    label: l10n.inventoryLoadedLowStock,
                                    value: '$lowStockCount',
                                    icon: Icons.warning_amber_rounded,
                                    tint: lowStockCount > 0
                                        ? FinancePalette.of(context).negative
                                        : FinancePalette.of(context).accent,
                                  ),
                                ],
                              ),
                              const shad.Gap(14),
                              TextField(
                                controller: _searchController,
                                onSubmitted: (_) => _loadInitial(),
                                onChanged: _onSearchChanged,
                                decoration: InputDecoration(
                                  hintText: l10n.inventorySearchProducts,
                                  prefixIcon: const Icon(Icons.search_rounded),
                                  suffixIcon: _searchController.text.isEmpty
                                      ? null
                                      : IconButton(
                                          onPressed: () {
                                            _searchController.clear();
                                            _onSearchChanged('');
                                          },
                                          tooltip: l10n.commonClear,
                                          icon: const Icon(Icons.close_rounded),
                                        ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const shad.Gap(18),
                        if (_products.isEmpty)
                          InventoryEmptyPanel(body: l10n.inventoryProductsEmpty)
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
                                  onTap: _canManageCatalog
                                      ? () => _openEditor(productId: product.id)
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
    );
  }
}

class _InventoryProductsError extends StatelessWidget {
  const _InventoryProductsError({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: FinanceEmptyState(
        icon: Icons.error_outline,
        title: context.l10n.commonSomethingWentWrong,
        body: context.l10n.inventoryProductsLabel,
        action: shad.SecondaryButton(
          onPressed: onRetry,
          child: Text(context.l10n.commonRetry),
        ),
      ),
    );
  }
}
