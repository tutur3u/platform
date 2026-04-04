import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/inventory/inventory_permissions.dart';
import 'package:mobile/features/inventory/view/inventory_product_editor_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/fab/extended_fab.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class InventoryProductsPage extends StatefulWidget {
  const InventoryProductsPage({super.key});

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
    _inventoryRepository = InventoryRepository();
    _financeRepository = FinanceRepository();
    _permissionsRepository = WorkspacePermissionsRepository();
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

  Future<void> _loadInitial() async {
    final wsId = _wsId;
    if (wsId == null) {
      return;
    }
    final requestToken = ++_requestToken;

    setState(() {
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
      await _loadInitial();
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
                onRetry: () => unawaited(_loadInitial()),
              );
            }

            final l10n = context.l10n;
            final lowStockCount = _products
                .where(
                  (product) => _productStatus(product) != _ProductStockState.ok,
                )
                .length;

            return ResponsiveWrapper(
              maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
              child: Stack(
                children: [
                  RefreshIndicator(
                    onRefresh: _loadInitial,
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
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: [
                                  FinanceStatChip(
                                    label: l10n.inventoryProductsLabel,
                                    value: '$_count',
                                    icon: Icons.inventory_2_outlined,
                                  ),
                                  FinanceStatChip(
                                    label: l10n.inventoryOverviewLowStock,
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
                                          icon: const Icon(Icons.close_rounded),
                                        ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const shad.Gap(18),
                        if (_products.isEmpty)
                          FinanceEmptyState(
                            icon: Icons.inventory_2_outlined,
                            title: l10n.inventoryProductsLabel,
                            body: l10n.inventoryProductsEmpty,
                            action: _canManageCatalog
                                ? shad.SecondaryButton(
                                    onPressed: _openEditor,
                                    child: Text(l10n.inventoryCreateProduct),
                                  )
                                : null,
                          )
                        else ...[
                          FinanceSectionHeader(
                            title: l10n.inventoryProductsListTitle,
                          ),
                          const shad.Gap(12),
                          ..._products.map(
                            (product) => Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: _InventoryProductCard(
                                product: product,
                                currency: _currency,
                                onTap: _canManageCatalog
                                    ? () => _openEditor(productId: product.id)
                                    : null,
                              ),
                            ),
                          ),
                          if (_isLoadingMore)
                            const Padding(
                              padding: EdgeInsets.symmetric(vertical: 16),
                              child: Center(
                                child: shad.CircularProgressIndicator(),
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

enum _ProductStockState { ok, low, negative }

_ProductStockState _productStatus(InventoryProduct product) {
  var status = _ProductStockState.ok;
  for (final row in product.inventory) {
    final amount = row.amount ?? 0;
    final minAmount = row.minAmount;
    if (amount < 0) {
      return _ProductStockState.negative;
    }
    if (amount <= minAmount) {
      status = _ProductStockState.low;
    }
  }
  return status;
}

class _InventoryProductCard extends StatelessWidget {
  const _InventoryProductCard({
    required this.product,
    required this.currency,
    this.onTap,
  });

  final InventoryProduct product;
  final String currency;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final palette = FinancePalette.of(context);
    final status = _productStatus(product);
    final firstPrice = product.inventory.isEmpty
        ? 0.0
        : product.inventory.first.price;
    final totalAmount = product.inventory.fold<double>(
      0,
      (sum, row) => sum + (row.amount ?? 0),
    );

    return FinancePanel(
      onTap: onTap,
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
                      product.name?.trim().isNotEmpty == true
                          ? product.name!.trim()
                          : context.l10n.inventoryProductUntitled,
                      style: theme.typography.large.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (product.manufacturer?.trim().isNotEmpty ?? false) ...[
                      const shad.Gap(4),
                      Text(
                        product.manufacturer!,
                        style: theme.typography.textSmall.copyWith(
                          color: theme.colorScheme.mutedForeground,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const shad.Gap(12),
              if (product.archived)
                _InventoryBadge(
                  label: context.l10n.inventoryAuditEventArchived,
                  color: theme.colorScheme.mutedForeground,
                )
              else if (status == _ProductStockState.negative)
                _InventoryBadge(
                  label: context.l10n.inventoryOverviewLowStock,
                  color: palette.negative,
                )
              else if (status == _ProductStockState.low)
                _InventoryBadge(
                  label: context.l10n.inventoryOverviewLowStock,
                  color: const Color(0xFFE0A100),
                ),
            ],
          ),
          const shad.Gap(12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (product.owner?.name.isNotEmpty ?? false)
                _InventoryBadge(
                  label: product.owner!.name,
                  color: palette.accent,
                ),
              if (product.category?.isNotEmpty ?? false)
                _InventoryBadge(
                  label: product.category!,
                  color: theme.colorScheme.mutedForeground,
                ),
              if (product.financeCategory?.name.isNotEmpty ?? false)
                _InventoryBadge(
                  label: product.financeCategory!.name,
                  color: palette.positive,
                ),
            ],
          ),
          const shad.Gap(14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FinanceStatChip(
                label: context.l10n.inventoryProductPrice,
                value: formatCurrency(firstPrice, currency),
                icon: Icons.sell_outlined,
              ),
              FinanceStatChip(
                label: context.l10n.inventoryProductInventory,
                value: totalAmount.toStringAsFixed(
                  totalAmount % 1 == 0 ? 0 : 1,
                ),
                icon: Icons.layers_outlined,
                tint: status == _ProductStockState.ok
                    ? palette.accent
                    : palette.negative,
              ),
              FinanceStatChip(
                label: context.l10n.inventoryProductInventoryRows,
                value: '${product.inventory.length}',
                icon: Icons.warehouse_outlined,
              ),
            ],
          ),
          if (product.inventory.isNotEmpty) ...[
            const shad.Gap(12),
            ...product.inventory
                .take(3)
                .map(
                  (row) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _InventoryStockRow(
                      row: row,
                      currency: currency,
                    ),
                  ),
                ),
          ],
        ],
      ),
    );
  }
}

class _InventoryStockRow extends StatelessWidget {
  const _InventoryStockRow({
    required this.row,
    required this.currency,
  });

  final InventoryStockEntry row;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final palette = FinancePalette.of(context);
    final amount = row.amount ?? 0;
    final isLow = amount <= row.minAmount;

    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                [
                      row.warehouseName,
                      row.unitName,
                    ]
                    .whereType<String>()
                    .where((value) => value.isNotEmpty)
                    .join(' • '),
                style: theme.typography.textSmall.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const shad.Gap(2),
              Text(
                context.l10n.inventoryProductAvailableSummary(
                  amount.toStringAsFixed(amount % 1 == 0 ? 0 : 1),
                  formatCurrency(row.price, currency),
                ),
                style: theme.typography.xSmall.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
              ),
            ],
          ),
        ),
        if (isLow)
          Icon(
            Icons.warning_amber_rounded,
            size: 16,
            color: palette.negative,
          ),
      ],
    );
  }
}

class _InventoryBadge extends StatelessWidget {
  const _InventoryBadge({
    required this.label,
    required this.color,
  });

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.22)),
      ),
      child: Text(
        label,
        style: theme.typography.xSmall.copyWith(
          color: color,
          fontWeight: FontWeight.w700,
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
