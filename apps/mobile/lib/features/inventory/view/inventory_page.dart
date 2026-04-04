import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/inventory/view/inventory_product_editor_page.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class InventoryPage extends StatefulWidget {
  const InventoryPage({super.key});

  @override
  State<InventoryPage> createState() => _InventoryPageState();
}

class _InventoryPageState extends State<InventoryPage> {
  late final InventoryRepository _repository;
  Future<InventoryOverview>? _future;

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  @override
  void initState() {
    super.initState();
    _repository = InventoryRepository();
    unawaited(Future<void>.delayed(Duration.zero, _reload));
  }

  void _reload() {
    final wsId = _wsId;
    if (wsId == null) return;
    setState(() {
      _future = _repository.getOverview(wsId);
    });
  }

  @override
  Widget build(BuildContext context) {
    return shad.Scaffold(
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (previous, current) =>
            previous.currentWorkspace?.id != current.currentWorkspace?.id,
        listener: (context, state) => _reload(),
        child: FutureBuilder<InventoryOverview>(
          future: _future,
          builder: (context, snapshot) {
            if (_wsId == null) {
              return const SizedBox.shrink();
            }

            if (!snapshot.hasData &&
                snapshot.connectionState != ConnectionState.done) {
              return const Center(child: NovaLoadingIndicator());
            }

            if (snapshot.hasError || !snapshot.hasData) {
              return _InventoryErrorView(
                onRetry: _reload,
                body: snapshot.error?.toString(),
              );
            }

            final overview = snapshot.data!;
            final l10n = context.l10n;

            return ResponsiveWrapper(
              maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
              child: RefreshIndicator(
                onRefresh: () async => _reload(),
                child: ListView(
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
                      metrics: [
                        InventoryMetricTile(
                          label: l10n.inventoryOverviewIncome,
                          value: formatCurrency(
                            overview.totals.totalIncome,
                            'VND',
                          ),
                          icon: Icons.south_west_rounded,
                          tint: FinancePalette.of(context).positive,
                        ),
                        InventoryMetricTile(
                          label: l10n.inventoryOverviewExpense,
                          value: formatCurrency(
                            overview.totals.totalExpense,
                            'VND',
                          ),
                          icon: Icons.north_east_rounded,
                          tint: FinancePalette.of(context).negative,
                        ),
                        InventoryMetricTile(
                          label: l10n.inventorySalesLabel,
                          value: formatCurrency(
                            overview.totals.inventorySalesRevenue,
                            'VND',
                          ),
                          icon: Icons.point_of_sale_outlined,
                        ),
                      ],
                      actions: [
                        shad.PrimaryButton(
                          onPressed: () async {
                            final result = await context.push<bool>(
                              Routes.inventoryCheckout,
                            );
                            if (result == true && mounted) {
                              _reload();
                            }
                          },
                          child: Text(l10n.inventoryCheckoutTitle),
                        ),
                        shad.SecondaryButton(
                          onPressed: () async {
                            final result =
                                await showInventoryProductEditorPage<bool>(
                                  context,
                                );
                            if (result == true && mounted) {
                              _reload();
                            }
                          },
                          child: Text(l10n.inventoryCreateProduct),
                        ),
                        shad.SecondaryButton(
                          onPressed: () => context.go(Routes.inventoryManage),
                          child: Text(l10n.inventoryManageLabel),
                        ),
                      ],
                    ),
                    const shad.Gap(24),
                    FinanceSectionHeader(
                      title: l10n.inventoryOverviewLowStock,
                    ),
                    const shad.Gap(12),
                    if (overview.lowStockProducts.isEmpty)
                      _InventoryEmptyPanel(
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
                                        product.amount?.toStringAsFixed(0) ??
                                            '0',
                                        product.minAmount?.toStringAsFixed(0) ??
                                            '0',
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
                      _InventoryEmptyPanel(body: l10n.inventorySalesEmpty)
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
                                        Text(
                                          formatCurrency(
                                            sale.paidAmount,
                                            'VND',
                                          ),
                                          style: shad.Theme.of(context)
                                              .typography
                                              .large
                                              .copyWith(
                                                fontWeight: FontWeight.w800,
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
                                        DateFormat.yMMMd().add_jm().format(
                                          sale.createdAt?.toLocal() ??
                                              DateTime.now(),
                                        ),
                                      ].join(' • '),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                    const shad.Gap(16),
                    FinanceSectionHeader(
                      title: l10n.inventoryOverviewOwners,
                    ),
                    const shad.Gap(12),
                    _BreakdownList(entries: overview.ownerBreakdown),
                    const shad.Gap(16),
                    FinanceSectionHeader(
                      title: l10n.inventoryOverviewCategories,
                    ),
                    const shad.Gap(12),
                    _BreakdownList(entries: overview.categoryBreakdown),
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

class _BreakdownList extends StatelessWidget {
  const _BreakdownList({required this.entries});

  final List<InventoryBreakdownEntry> entries;

  @override
  Widget build(BuildContext context) {
    if (entries.isEmpty) {
      return _InventoryEmptyPanel(body: context.l10n.inventoryNoBreakdownData);
    }

    return Column(
      children: entries
          .take(5)
          .map((entry) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: FinancePanel(
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        entry.label,
                        style: shad.Theme.of(context).typography.large.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    const shad.Gap(12),
                    Text(
                      formatCurrency(entry.revenue, 'VND'),
                      style: shad.Theme.of(
                        context,
                      ).typography.small.copyWith(fontWeight: FontWeight.w800),
                    ),
                  ],
                ),
              ),
            );
          })
          .toList(growable: false),
    );
  }
}

class _InventoryEmptyPanel extends StatelessWidget {
  const _InventoryEmptyPanel({required this.body});

  final String body;

  @override
  Widget build(BuildContext context) {
    return FinanceEmptyState(
      icon: Icons.inventory_2_outlined,
      title: context.l10n.inventoryTitle,
      body: body,
    );
  }
}

class _InventoryErrorView extends StatelessWidget {
  const _InventoryErrorView({
    required this.onRetry,
    this.body,
  });

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
