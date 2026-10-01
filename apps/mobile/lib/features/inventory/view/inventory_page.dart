import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/models/inventory/inventory_stock_health.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/inventory/view/inventory_checkout_page.dart';
import 'package:mobile/features/inventory/view/inventory_product_editor_page.dart';
import 'package:mobile/features/inventory/widgets/inventory_stock_health_panel.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class InventoryPage extends StatefulWidget {
  const InventoryPage({this.repository, super.key});

  final InventoryRepository? repository;

  @override
  State<InventoryPage> createState() => _InventoryPageState();
}

class _InventoryPageState extends State<InventoryPage> {
  late final InventoryRepository _repository;
  Future<InventoryOverview>? _future;
  Future<InventoryStockHealth>? _stockHealth;

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
    final wsId = _wsId;
    if (!mounted) return;
    if (wsId == null || _actorId == null) {
      setState(() {
        _future = null;
        _stockHealth = null;
      });
      return;
    }
    final future = _repository.getOverview(wsId, forceRefresh: forceRefresh);
    final stockHealth = _repository.getStockHealth(wsId);
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

  @override
  void dispose() {
    if (widget.repository == null) _repository.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return shad.Scaffold(
      child: MultiBlocListener(
        listeners: [
          BlocListener<WorkspaceCubit, WorkspaceState>(
            listenWhen: (previous, current) =>
                previous.currentWorkspace?.id != current.currentWorkspace?.id,
            listener: (context, state) => unawaited(_reload()),
          ),
          BlocListener<AuthCubit, AuthState>(
            listenWhen: (previous, current) =>
                previous.user?.id != current.user?.id,
            listener: (context, state) =>
                unawaited(_reload(forceRefresh: true)),
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
              return const InventoryOverviewSkeleton();
            }

            if (snapshot.hasError || !snapshot.hasData) {
              return _InventoryErrorView(
                onRetry: () => unawaited(_reload(forceRefresh: true)),
                body: snapshot.error?.toString(),
              );
            }

            final overview = snapshot.data!;
            final l10n = context.l10n;

            return ResponsiveWrapper(
              maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
              child: NovaRefreshIndicator(
                onRefresh: () => _reload(forceRefresh: true),
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: EdgeInsets.fromLTRB(
                    16,
                    8,
                    16,
                    32 + MediaQuery.paddingOf(context).bottom,
                  ),
                  children: [
                    InventoryHeroCard(
                      title: l10n.inventoryTitle,
                      icon: Icons.inventory_2_outlined,
                      showHeader: false,
                      actions: [
                        InventoryActionTile(
                          icon: Icons.point_of_sale_rounded,
                          primary: true,
                          label: l10n.inventoryCheckoutTitle,
                          onPressed: () async {
                            final result =
                                await showInventoryCheckoutPage<bool>(context);
                            if (result == true && mounted) {
                              await _reload(forceRefresh: true);
                            }
                          },
                        ),
                        InventoryActionTile(
                          icon: Icons.add_box_outlined,
                          label: l10n.inventoryCreateProduct,
                          onPressed: () async {
                            final result =
                                await showInventoryProductEditorPage<bool>(
                                  context,
                                );
                            if (result == true && mounted) {
                              await _reload(forceRefresh: true);
                            }
                          },
                        ),
                      ],
                    ),
                    const shad.Gap(24),
                    InventoryStockHealthPanel(
                      key: ValueKey(('stock-health', _actorId, _wsId)),
                      future: _stockHealth,
                    ),
                    const shad.Gap(16),
                    FinanceSectionHeader(title: l10n.inventoryOverviewLowStock),
                    const shad.Gap(12),
                    if (overview.lowStockProducts.isEmpty)
                      InventoryEmptyPanel(
                        body: l10n.inventoryNoLowStockProducts,
                      )
                    else
                      ...overview.lowStockProducts
                          .take(5)
                          .map(
                            (product) => Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: FinancePanel(
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            product.productName ??
                                                'Untitled product',
                                            style: shad.Theme.of(context)
                                                .typography
                                                .large
                                                .copyWith(
                                                  fontWeight: FontWeight.w700,
                                                ),
                                          ),
                                          const shad.Gap(4),
                                          Text(
                                            [
                                                  product.ownerName,
                                                  product.categoryName,
                                                  product.warehouseName,
                                                ]
                                                .whereType<String>()
                                                .where((e) => e.isNotEmpty)
                                                .join(' • '),
                                          ),
                                        ],
                                      ),
                                    ),
                                    const shad.Gap(12),
                                    Text(
                                      [
                                        inventoryStockAmount(
                                          context,
                                          product.amount,
                                        ),
                                        inventoryStockAmount(
                                          context,
                                          product.minAmount ?? 0,
                                        ),
                                      ].join(' / '),
                                      style: shad.Theme.of(context)
                                          .typography
                                          .large
                                          .copyWith(
                                            fontWeight: FontWeight.w800,
                                          ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                    const shad.Gap(16),
                    FinanceSectionHeader(
                      title: l10n.inventoryOverviewRecentSales,
                      action: shad.GhostButton(
                        onPressed: () => context.go(Routes.inventorySales),
                        child: Text(l10n.financeViewAll),
                      ),
                    ),
                    const shad.Gap(12),
                    if (overview.recentSales.isEmpty)
                      InventoryEmptyPanel(body: l10n.inventorySalesEmpty)
                    else
                      ...overview.recentSales
                          .take(5)
                          .map(
                            (sale) => Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: FinancePanel(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            sale.owners.join(', '),
                                            style: shad.Theme.of(context)
                                                .typography
                                                .large
                                                .copyWith(
                                                  fontWeight: FontWeight.w700,
                                                ),
                                          ),
                                        ),
                                      ],
                                    ),
                                    const shad.Gap(6),
                                    Text(
                                      [
                                        if (sale.walletName?.isNotEmpty ??
                                            false)
                                          sale.walletName!,
                                        if (sale.categoryName?.isNotEmpty ??
                                            false)
                                          sale.categoryName!,
                                        if (sale.createdAt != null)
                                          DateFormat.yMMMd().add_jm().format(
                                            sale.createdAt!.toLocal(),
                                          ),
                                      ].join(' • '),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                    const shad.Gap(16),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _InventoryErrorView extends StatelessWidget {
  const _InventoryErrorView({required this.onRetry, this.body});

  final VoidCallback onRetry;
  final String? body;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: FinanceEmptyState(
          icon: Icons.error_outline,
          title: context.l10n.commonSomethingWentWrong,
          body: body ?? context.l10n.inventoryTitle,
          action: shad.SecondaryButton(
            onPressed: onRetry,
            child: Text(context.l10n.commonRetry),
          ),
        ),
      ),
    );
  }
}
