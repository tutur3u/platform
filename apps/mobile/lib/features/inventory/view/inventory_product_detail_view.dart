import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/models/inventory/inventory_stock_movement.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/inventory/inventory_permissions.dart';
import 'package:mobile/features/inventory/inventory_stock_summary.dart';
import 'package:mobile/features/inventory/view/inventory_product_detail_sections.dart';
import 'package:mobile/features/inventory/view/inventory_product_editor_page.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_refresh_indicator.dart';

/// Item detail: header with manager actions, stock per location, stock
/// history and the remaining details.
///
/// Opens from the row summary ([initial]) in the same frame and hydrates
/// the product, permissions and history afterwards.
class InventoryProductDetailView extends StatefulWidget {
  const InventoryProductDetailView({
    required this.productId,
    this.initial,
    this.inventoryRepository,
    this.permissionsRepository,
    this.openEditor,
    this.onChanged,
    this.onDeleted,
    this.titleLocation,
    super.key,
  });

  final String productId;
  final InventoryProduct? initial;
  final InventoryRepository? inventoryRepository;
  final WorkspacePermissionsRepository? permissionsRepository;

  /// Overrides the full-screen editor; resolves true when saved.
  final Future<bool?> Function(BuildContext context, String? productId)?
  openEditor;
  final VoidCallback? onChanged;
  final VoidCallback? onDeleted;

  /// Shell location whose navbar title shows the item name; null inside a
  /// split pane, where the list keeps the title.
  final String? titleLocation;

  @override
  State<InventoryProductDetailView> createState() =>
      _InventoryProductDetailViewState();
}

class _InventoryProductDetailViewState
    extends State<InventoryProductDetailView> {
  late final InventoryRepository _repository =
      widget.inventoryRepository ?? InventoryRepository();
  late final WorkspacePermissionsRepository _permissionsRepository =
      widget.permissionsRepository ?? WorkspacePermissionsRepository();

  InventoryProduct? _product;
  bool _loading = true;
  bool _failed = false;
  bool _missing = false;
  bool _canManage = false;
  bool? _canViewStock;
  String _currency = 'VND';
  final List<InventoryStockMovement> _history = [];
  bool _historyLoading = false;
  bool _historyFailed = false;
  bool _historyHasMore = false;
  int _generation = 0;

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;
  (String?, String?) get _scope =>
      (context.read<AuthCubit>().state.user?.id, _wsId);

  @override
  void initState() {
    super.initState();
    _product = widget.initial;
    final wsId = _wsId;
    if (wsId != null) {
      final cached = _permissionsRepository.peekPermissions(wsId);
      if (cached != null) _applyPermissions(cached);
      try {
        _currency =
            FinanceRepository().peekWorkspaceDefaultCurrency(wsId) ?? 'VND';
      } on Object {
        _currency = 'VND';
      }
    }
    unawaited(Future<void>.delayed(Duration.zero, _load));
  }

  @override
  void dispose() {
    if (widget.inventoryRepository == null) _repository.dispose();
    super.dispose();
  }

  void _applyPermissions(WorkspacePermissions permissions) {
    _canManage = canManageInventoryCatalog(permissions);
    _canViewStock =
        canViewInventoryStock(permissions) ||
        canCreateInventorySales(permissions);
  }

  Future<void> _load({bool forceRefresh = false}) async {
    final wsId = _wsId;
    if (!mounted || wsId == null) return;
    final generation = ++_generation;
    final scope = _scope;
    bool current() => mounted && generation == _generation && _scope == scope;
    setState(() {
      _loading = true;
      _failed = false;
    });
    unawaited(
      _permissionsRepository
          .getPermissions(wsId: wsId)
          .then((permissions) {
            if (!current()) return;
            final hadStock = _canViewStock ?? false;
            setState(() => _applyPermissions(permissions));
            if (!hadStock && (_canViewStock ?? false)) {
              unawaited(_loadHistory(reset: true));
            }
          })
          .catchError((Object _) {}),
    );
    try {
      final product = await _repository.getProduct(
        wsId,
        widget.productId,
        forceRefresh: forceRefresh,
      );
      if (!current()) return;
      setState(() {
        _product = product ?? _product;
        _missing = product == null;
      });
    } on ApiException catch (error) {
      if (!current()) return;
      setState(() {
        _missing = error.statusCode == 404;
        _failed = !_missing;
      });
    } on Object {
      if (current()) setState(() => _failed = true);
    } finally {
      if (current()) setState(() => _loading = false);
    }
    if (current() && (_canViewStock ?? false)) {
      await _loadHistory(reset: true);
    }
  }

  Future<void> _loadHistory({bool reset = false}) async {
    final wsId = _wsId;
    if (wsId == null || (_historyLoading && !reset)) return;
    final generation = _generation;
    setState(() {
      _historyLoading = true;
      _historyFailed = false;
    });
    try {
      final page = await _repository.getProductStockHistory(
        wsId,
        widget.productId,
        offset: reset ? 0 : _history.length,
      );
      if (!mounted || generation != _generation) return;
      setState(() {
        if (reset) _history.clear();
        _history.addAll(page.movements);
        _historyHasMore = page.hasMore;
      });
    } on Object {
      if (mounted && generation == _generation) {
        setState(() => _historyFailed = true);
      }
    } finally {
      if (mounted && generation == _generation) {
        setState(() => _historyLoading = false);
      }
    }
  }

  Future<void> _edit({bool stockFirst = false}) async {
    final open = widget.openEditor;
    final saved = open != null && !stockFirst
        ? await open(context, widget.productId)
        : await showInventoryProductEditorPage<bool>(
            context,
            productId: widget.productId,
            stockFirst: stockFirst,
          );
    if (saved != true || !mounted) return;
    widget.onChanged?.call();
    await _load(forceRefresh: true);
  }

  Future<void> _delete() async {
    final wsId = _wsId;
    if (wsId == null) return;
    final l10n = context.l10n;
    final deleted = await showAppAsyncConfirmDialog(
      context: context,
      title: l10n.commonDelete,
      message: l10n.inventoryProductDeleteConfirm,
      cancelLabel: l10n.commonCancel,
      confirmLabel: l10n.commonDelete,
      describeError: (_) => l10n.commonSomethingWentWrong,
      onConfirm: () =>
          _repository.deleteProduct(wsId: wsId, productId: widget.productId),
    );
    if (deleted && mounted) widget.onDeleted?.call();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final product = _product;
    final titleLocation = widget.titleLocation;
    final title = titleLocation == null
        ? null
        : ShellTitleOverride(
            ownerId: 'inventory-product-detail',
            locations: {titleLocation},
            title: product?.name?.trim().isNotEmpty ?? false
                ? product!.name!.trim()
                : l10n.inventoryProductsLabel,
          );
    if (product == null) {
      return AppPageListView(
        children: [
          ?title,
          AppGroupedCard(
            children: [
              if (_loading)
                const AppSkeletonRows(count: 4)
              else
                AppStateMessage.inline(
                  icon: _missing ? LucideIcons.packageX : LucideIcons.cloudOff,
                  tone: _missing ? AppTone.neutral : AppTone.destructive,
                  title: _missing
                      ? l10n.inventoryDetailNotFound
                      : l10n.inventoryDetailLoadFailed,
                  actionLabel: _missing ? null : l10n.commonRetry,
                  onAction: _missing
                      ? null
                      : () => unawaited(_load(forceRefresh: true)),
                ),
            ],
          ),
        ],
      );
    }
    final summary = InventoryStockSummary.of(
      product,
      stockVisible: _canViewStock,
    );
    final manage = _canManage && !_missing;
    return BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (a, b) => a.currentWorkspace?.id != b.currentWorkspace?.id,
      listener: (_, _) => unawaited(_load(forceRefresh: true)),
      child: NovaRefreshIndicator(
        onRefresh: () => _load(forceRefresh: true),
        child: AppPageListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            ?title,
            if (_failed || _missing)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: AppAlert(
                  variant: _missing
                      ? AppAlertVariant.destructive
                      : AppAlertVariant.neutral,
                  leading: const Icon(LucideIcons.cloudOff),
                  title: Text(
                    _missing
                        ? l10n.inventoryDetailNotFound
                        : l10n.inventoryDetailLoadFailed,
                  ),
                ),
              ),
            InventoryDetailHeader(
              product: product,
              summary: summary,
              onEdit: manage ? () => unawaited(_edit()) : null,
              onAdjustStock: manage && (_canViewStock ?? false)
                  ? () => unawaited(_edit(stockFirst: true))
                  : null,
              onDelete: manage ? () => unawaited(_delete()) : null,
            ),
            const SizedBox(height: AppSpacing.lg),
            if (_canViewStock ?? false) ...[
              InventoryDetailFacts(summary: summary, currency: _currency),
              const SizedBox(height: AppSpacing.xl),
              InventoryDetailStock(
                rows: product.inventory,
                currency: _currency,
              ),
              const SizedBox(height: AppSpacing.xl),
              InventoryDetailHistory(
                movements: _history,
                loading: _historyLoading,
                failed: _historyFailed,
                hasMore: _historyHasMore,
                onRetry: () => unawaited(_loadHistory(reset: _history.isEmpty)),
                onLoadMore: () => unawaited(_loadHistory()),
              ),
              const SizedBox(height: AppSpacing.xl),
            ],
            InventoryDetailInfo(product: product),
          ],
        ),
      ),
    );
  }
}

/// Route body for `/inventory/products/:id`: the detail alone on compact
/// layouts, the list with this item open on split ones.
class InventoryProductDetailPage extends StatelessWidget {
  const InventoryProductDetailPage({
    required this.productId,
    required this.splitBuilder,
    super.key,
  });

  final String productId;

  /// Builds the list with [productId] selected; supplied by the router so
  /// this file does not import the list page.
  final WidgetBuilder splitBuilder;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final location = Routes.inventoryProductDetailPath(productId);
      if (AppMasterDetailLayout.isSplit(constraints.maxWidth)) {
        return Stack(
          fit: StackFit.expand,
          children: [
            ShellTitleOverride(
              ownerId: 'inventory-product-detail-split',
              locations: {location},
              title: context.l10n.inventoryProductsLabel,
            ),
            splitBuilder(context),
          ],
        );
      }
      return InventoryProductDetailView(
        key: ValueKey(('inventory-detail-route', productId)),
        productId: productId,
        titleLocation: location,
        onDeleted: () {
          if (context.canPop()) {
            context.pop();
          } else {
            context.go(Routes.inventoryProducts);
          }
        },
      );
    },
  );
}
