import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/inventory/view/inventory_checkout_page.dart';
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
  late final InventoryRepository _inventoryRepository;
  late final FinanceRepository _financeRepository;
  Future<
    ({
      List<InventorySaleSummary> data,
      int count,
      bool realtimeEnabled,
      String currency,
    })
  >?
  _future;

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  @override
  void initState() {
    super.initState();
    _inventoryRepository = InventoryRepository();
    _financeRepository = FinanceRepository();
    unawaited(Future<void>.delayed(Duration.zero, _reload));
  }

  void _reload() {
    final wsId = _wsId;
    if (wsId == null) {
      return;
    }
    setState(() {
      _future = _loadSales(wsId);
    });
  }

  Future<
    ({
      List<InventorySaleSummary> data,
      int count,
      bool realtimeEnabled,
      String currency,
    })
  >
  _loadSales(String wsId) async {
    final results = await Future.wait<dynamic>([
      _inventoryRepository.getSales(wsId),
      _financeRepository.getWorkspaceDefaultCurrency(wsId),
    ]);

    final sales =
        results[0]
            as ({
              List<InventorySaleSummary> data,
              int count,
              bool realtimeEnabled,
            });
    final currency = results[1] as String;

    return (
      data: sales.data,
      count: sales.count,
      realtimeEnabled: sales.realtimeEnabled,
      currency: currency,
    );
  }

  Future<void> _openCheckout() async {
    final created = await showInventoryCheckoutPage<bool>(context);
    if (created == true && mounted) {
      _reload();
    }
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
                String currency,
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
                final revenue = result.data.fold<double>(
                  0,
                  (sum, sale) => sum + sale.paidAmount,
                );

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
                        FinancePanel(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: [
                                  FinanceStatChip(
                                    label: l10n.inventorySalesLabel,
                                    value: '${result.count}',
                                    icon: Icons.receipt_long_outlined,
                                  ),
                                  FinanceStatChip(
                                    label: l10n.inventoryOverviewSalesRevenue,
                                    value: formatCurrency(
                                      revenue,
                                      result.currency,
                                    ),
                                    icon: Icons.payments_outlined,
                                  ),
                                ],
                              ),
                              const shad.Gap(14),
                              shad.PrimaryButton(
                                onPressed: _openCheckout,
                                child: Text(l10n.inventoryCheckoutTitle),
                              ),
                            ],
                          ),
                        ),
                        const shad.Gap(18),
                        if (result.data.isEmpty)
                          FinanceEmptyState(
                            icon: Icons.receipt_long_outlined,
                            title: l10n.inventorySalesLabel,
                            body: l10n.inventorySalesEmpty,
                            action: shad.SecondaryButton(
                              onPressed: _openCheckout,
                              child: Text(l10n.inventoryCheckoutTitle),
                            ),
                          )
                        else ...[
                          FinanceSectionHeader(
                            title: l10n.inventorySalesRecentTitle,
                          ),
                          const shad.Gap(12),
                          ...result.data.map(
                            (sale) => Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: _InventorySaleCard(
                                sale: sale,
                                currency: result.currency,
                              ),
                            ),
                          ),
                        ],
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

class _InventorySaleCard extends StatelessWidget {
  const _InventorySaleCard({
    required this.sale,
    required this.currency,
  });

  final InventorySaleSummary sale;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final title = sale.notice?.trim().isNotEmpty == true
        ? sale.notice!.trim()
        : context.l10n.inventorySalesFallbackTitle;
    final metadata = [
      if (sale.walletName?.isNotEmpty ?? false) sale.walletName!,
      if (sale.categoryName?.isNotEmpty ?? false) sale.categoryName!,
      context.l10n.inventorySalesItemsCount(sale.itemsCount),
    ].join(' • ');
    final creator = sale.creatorName?.trim();
    final customer = sale.customerName?.trim();

    return FinancePanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  title,
                  style: theme.typography.large.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const shad.Gap(12),
              Text(
                formatCurrency(sale.paidAmount, currency),
                style: theme.typography.large.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const shad.Gap(8),
          if (metadata.isNotEmpty)
            Text(
              metadata,
              style: theme.typography.textSmall.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            ),
          const shad.Gap(10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (creator != null && creator.isNotEmpty)
                _SaleBadge(
                  label: context.l10n.inventorySalesCreatorBadge(creator),
                  color: FinancePalette.of(context).accent,
                ),
              ...sale.owners
                  .where((owner) => owner.trim().isNotEmpty)
                  .map(
                    (owner) => _SaleBadge(
                      label: owner.trim(),
                      color: FinancePalette.of(context).positive,
                    ),
                  ),
              if (customer != null && customer.isNotEmpty)
                _SaleBadge(
                  label: customer,
                  color: theme.colorScheme.mutedForeground,
                ),
            ],
          ),
          const shad.Gap(10),
          Text(
            DateFormat.yMMMd().add_jm().format(
              sale.createdAt?.toLocal() ?? DateTime.now(),
            ),
            style: theme.typography.xSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
        ],
      ),
    );
  }
}

class _SaleBadge extends StatelessWidget {
  const _SaleBadge({
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
