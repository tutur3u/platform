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
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class InventorySalesPage extends StatefulWidget {
  const InventorySalesPage({super.key});

  @override
  State<InventorySalesPage> createState() => _InventorySalesPageState();
}

class _InventorySalesPageState extends State<InventorySalesPage> {
  late final InventoryRepository _repository;
  Future<({List<InventorySaleSummary> data, int count, bool realtimeEnabled})>?
  _future;

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
      _future = _repository.getSales(wsId);
    });
  }

  @override
  Widget build(BuildContext context) {
    return shad.Scaffold(
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (previous, current) =>
            previous.currentWorkspace?.id != current.currentWorkspace?.id,
        listener: (context, state) => _reload(),
        child:
            FutureBuilder<
              ({
                List<InventorySaleSummary> data,
                int count,
                bool realtimeEnabled,
              })
            >(
              future: _future,
              builder: (context, snapshot) {
                if (!snapshot.hasData &&
                    snapshot.connectionState != ConnectionState.done) {
                  return const Center(child: NovaLoadingIndicator());
                }

                if (snapshot.hasError || !snapshot.hasData) {
                  return _InventorySalesError(onRetry: _reload);
                }

                final result = snapshot.data!;
                final l10n = context.l10n;

                return ResponsiveWrapper(
                  maxWidth: ResponsivePadding.maxContentWidth(
                    context.deviceClass,
                  ),
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
                          title: l10n.inventorySalesLabel,
                          icon: Icons.point_of_sale_outlined,
                          metrics: [
                            InventoryMetricTile(
                              label: l10n.inventorySalesLabel,
                              value: '${result.count}',
                              icon: Icons.receipt_long_outlined,
                            ),
                            InventoryMetricTile(
                              label: l10n.inventoryOverviewSalesRevenue,
                              value: formatCurrency(
                                result.data.fold<double>(
                                  0,
                                  (sum, sale) => sum + sale.paidAmount,
                                ),
                                'VND',
                              ),
                              icon: Icons.payments_outlined,
                            ),
                          ],
                          actions: [
                            shad.PrimaryButton(
                              onPressed: () async {
                                final created = await context.push<bool>(
                                  Routes.inventoryCheckout,
                                );
                                if (created == true && mounted) {
                                  _reload();
                                }
                              },
                              child: Text(l10n.inventoryCheckoutTitle),
                            ),
                          ],
                        ),
                        const shad.Gap(16),
                        if (result.data.isEmpty)
                          FinanceEmptyState(
                            icon: Icons.receipt_long_outlined,
                            title: l10n.inventorySalesLabel,
                            body: l10n.inventorySalesEmpty,
                          )
                        else
                          FinanceSectionHeader(
                            title: l10n.inventorySalesRecentTitle,
                          ),
                        if (result.data.isNotEmpty) const shad.Gap(12),
                        if (result.data.isNotEmpty)
                          ...result.data.map(
                            (sale) {
                              final metadata = [
                                if (sale.walletName?.isNotEmpty ?? false)
                                  sale.walletName!,
                                if (sale.categoryName?.isNotEmpty ?? false)
                                  sale.categoryName!,
                                [
                                  sale.totalQuantity.toStringAsFixed(0),
                                  'items',
                                ].join(' '),
                              ].join(' • ');

                              return Padding(
                                padding: const EdgeInsets.only(bottom: 12),
                                child: FinancePanel(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Expanded(
                                            child: Text(
                                              sale.notice?.trim().isNotEmpty ??
                                                      false
                                                  ? sale.notice!
                                                  : sale.owners.join(', '),
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
                                      Text(metadata),
                                      const shad.Gap(6),
                                      Text(
                                        DateFormat.yMMMd().add_jm().format(
                                          sale.createdAt?.toLocal() ??
                                              DateTime.now(),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
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

class _InventorySalesError extends StatelessWidget {
  const _InventorySalesError({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: FinanceEmptyState(
        icon: Icons.error_outline,
        title: context.l10n.commonSomethingWentWrong,
        body: context.l10n.inventorySalesLabel,
        action: shad.SecondaryButton(
          onPressed: onRetry,
          child: Text(context.l10n.commonRetry),
        ),
      ),
    );
  }
}
