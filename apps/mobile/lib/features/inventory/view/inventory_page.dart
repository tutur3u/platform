import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_sync_refresh.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/models/inventory/inventory_stock_health.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/inventory/inventory_permissions.dart';
import 'package:mobile/features/inventory/view/inventory_product_editor_page.dart';
import 'package:mobile/features/inventory/widgets/inventory_low_stock_card.dart';
import 'package:mobile/features/inventory/widgets/inventory_read_warning.dart';
import 'package:mobile/features/inventory/widgets/inventory_receipt_activity.dart';
import 'package:mobile/features/inventory/widgets/inventory_stock_health_panel.dart';
import 'package:mobile/features/settings/view/offline_changes_sheet.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_refresh_indicator.dart';

class InventoryPage extends StatefulWidget {
  const InventoryPage({this.repository, this.permissionsRepository, super.key});

  final InventoryRepository? repository;
  final WorkspacePermissionsRepository? permissionsRepository;

  @override
  State<InventoryPage> createState() => _InventoryPageState();
}

class _InventoryPageState extends State<InventoryPage>
    with OfflineSyncRefresh<InventoryPage> {
  @override
  Future<void> refreshAfterOfflineSync() => _reload();
  late final InventoryRepository _repository;
  Future<InventoryOverview>? _future;
  Future<InventoryStockHealth>? _stockHealth;
  InventoryOverview? _snapshot;
  InventoryStockHealth? _healthSnapshot;
  (String?, String?)? _loadedScope;
  WorkspacePermissionsRepository? _permissionsRepository;
  bool _canAdjustStock = false;
  int _permissionsRequest = 0;

  String? get _actorId => context.read<AuthCubit>().state.user?.id;

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  @override
  void initState() {
    super.initState();
    _repository = widget.repository ?? InventoryRepository();
    unawaited(Future<void>.delayed(Duration.zero, _reload));
  }

  Future<void> _reload({bool forceRefresh = false}) async {
    if (!mounted) return;
    final wsId = _wsId;
    final permissionsRequest = ++_permissionsRequest;
    if (wsId == null || _actorId == null) {
      setState(() {
        _future = null;
        _stockHealth = null;
        _canAdjustStock = false;
      });
      return;
    }
    final scope = (_actorId, wsId);
    if (_loadedScope != scope) {
      _snapshot = _repository.peekOverview(wsId);
      _healthSnapshot = null;
      _canAdjustStock = false;
    }
    _loadedScope = scope;
    unawaited(_refreshStockPermissions(wsId, scope.$1, permissionsRequest));
    final future = CacheStore.readWithRevalidation(
      () => _repository.getOverview(wsId, forceRefresh: forceRefresh),
      onSnapshot: (value) {
        if (!mounted || (_actorId, _wsId) != scope) return;
        setState(() => _snapshot = value);
      },
    );
    final stockHealth = CacheStore.readWithRevalidation(
      () => _repository.getStockHealth(wsId),
      onSnapshot: (value) {
        if (mounted && (_actorId, _wsId) == scope) {
          setState(() => _healthSnapshot = value);
        }
      },
    );
    setState(() {
      _future = future;
      _stockHealth = stockHealth;
    });
    try {
      await Future.wait<Object>([future, stockHealth]);
    } on Object {
      // The FutureBuilder presents the retry state.
    }
  }

  Future<void> _refreshStockPermissions(
    String wsId,
    String? actorId,
    int request,
  ) async {
    var allowed = false;
    try {
      final repository = _permissionsRepository ??=
          widget.permissionsRepository ?? WorkspacePermissionsRepository();
      final permissions = await repository.getPermissions(wsId: wsId);
      allowed = canManageInventoryCatalog(permissions);
    } on Object {
      // The editor action requires a verified grant for this scope.
    }
    if (mounted &&
        request == _permissionsRequest &&
        (_actorId, _wsId) == (actorId, wsId)) {
      setState(() => _canAdjustStock = allowed);
    }
  }

  Future<void> _adjustStock(String productId) async {
    if (!_canAdjustStock || _loadedScope != (_actorId, _wsId)) return;
    final scope = (_actorId, _wsId);
    final saved = await showInventoryProductEditorPage<bool>(
      context,
      productId: productId,
      stockFirst: true,
    );
    if (saved == true && mounted && (_actorId, _wsId) == scope) {
      await _reload(forceRefresh: true);
    }
  }

  @override
  void dispose() {
    if (widget.repository == null) _repository.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MultiBlocListener(
      listeners: [
        BlocListener<WorkspaceCubit, WorkspaceState>(
          listenWhen: (previous, current) =>
              previous.currentWorkspace?.id != current.currentWorkspace?.id,
          listener: (context, state) => unawaited(_reload()),
        ),
        BlocListener<AuthCubit, AuthState>(
          listenWhen: (previous, current) =>
              previous.user?.id != current.user?.id,
          listener: (context, state) => unawaited(_reload(forceRefresh: true)),
        ),
      ],
      child: FutureBuilder<InventoryOverview>(
        key: ValueKey((_actorId, _wsId)),
        initialData: _wsId == null || _actorId == null
            ? null
            : _repository.peekOverview(_wsId!),
        future: _future,
        builder: (context, snapshot) {
          if (_wsId == null || _actorId == null) {
            return const SizedBox.shrink();
          }

          if (!snapshot.hasData &&
              snapshot.connectionState != ConnectionState.done) {
            return const AppPageListView(
              children: [
                AppGroupedCard(children: [AppSkeletonRows(count: 6)]),
              ],
            );
          }

          final retained =
              snapshot.data ??
              (_loadedScope == (_actorId, _wsId) ? _snapshot : null);
          final overview = retained;
          final l10n = context.l10n;

          return NovaRefreshIndicator(
            onRefresh: () => _reload(forceRefresh: true),
            child: AppPageListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                if (snapshot.hasError)
                  InventoryReadWarning(
                    onRetry: () => unawaited(_reload(forceRefresh: true)),
                  ),
                InventoryStockHealthPanel(
                  key: ValueKey(('stock-health', _actorId, _wsId)),
                  future: _stockHealth,
                  retained: _healthSnapshot,
                ),
                const AppGap(AppSpacing.lg),
                ValueListenableBuilder(
                  valueListenable: OfflineMutationQueue.instance.pending,
                  builder: (context, pending, _) {
                    final count = pending
                        .where(
                          (m) =>
                              m.userId == _actorId &&
                              m.workspaceId == _wsId &&
                              m.feature == 'inventory',
                        )
                        .length;
                    return count == 0
                        ? const SizedBox.shrink()
                        : AppGroupedCard(
                            children: [
                              AppGroupedRow(
                                leading: const AppIconTile(
                                  icon: LucideIcons.refreshCw,
                                ),
                                title: Text(
                                  l10n.inventoryRedesignPendingCount(count),
                                ),
                                showChevron: true,
                                onTap: () => showOfflineChangesSheet(context),
                              ),
                            ],
                          );
                  },
                ),
                if (overview != null) ...[
                  const AppGap(AppSpacing.lg),
                  AppSectionHeader(
                    title: l10n.inventoryOverviewLowStock,
                    onAction: () => context.go(Routes.inventoryProducts),
                    actionLabel: l10n.financeViewAll,
                  ),
                  AppGroupedCard(
                    children: [
                      if (overview.lowStockProducts.isEmpty)
                        AppStateMessage.inline(
                          icon: LucideIcons.packageCheck,
                          title: l10n.inventoryNoLowStockProducts,
                        )
                      else
                        for (final product in overview.lowStockProducts.take(5))
                          InventoryLowStockCard(
                            product: product,
                            onAdjustStock: switch (product.productId) {
                              final id? when _canAdjustStock => () => unawaited(
                                _adjustStock(id),
                              ),
                              _ => null,
                            },
                          ),
                    ],
                  ),
                  const AppGap(AppSpacing.lg),
                  InventoryReceiptActivity(sales: overview.recentSales),
                  const AppGap(AppSpacing.lg),
                  AppSectionHeader(
                    title: l10n.inventoryOverviewRecentSales,
                    actionLabel: l10n.financeViewAll,
                    onAction: () => context.go(Routes.inventorySales),
                  ),
                  AppGroupedCard(
                    children: [
                      if (overview.recentSales.isEmpty)
                        AppStateMessage.inline(
                          icon: LucideIcons.receipt,
                          title: l10n.inventorySalesEmpty,
                        )
                      else
                        for (final sale in overview.recentSales.take(5))
                          _RecentReceiptRow(sale: sale),
                    ],
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _RecentReceiptRow extends StatelessWidget {
  const _RecentReceiptRow({required this.sale});

  final InventoryRecentSale sale;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final created = sale.createdAt?.toLocal();
    final metadata = [
      if (created != null)
        DateFormat.MMMd(l10n.localeName).add_jm().format(created),
      if (sale.itemsCount > 0) l10n.inventorySalesItemsCount(sale.itemsCount),
    ].join(' · ');
    final customer = sale.customerName;
    return AppGroupedRow(
      leading: const AppIconTile(icon: LucideIcons.receipt, tone: AppTone.info),
      title: Text(
        customer != null && customer.isNotEmpty
            ? customer
            : sale.owners.isNotEmpty
            ? sale.owners.join(', ')
            : l10n.inventorySalesItemsCount(sale.itemsCount),
      ),
      subtitle: metadata.isEmpty ? null : Text(metadata),
    );
  }
}
