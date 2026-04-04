import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class InventoryAuditLogsPage extends StatefulWidget {
  const InventoryAuditLogsPage({super.key});

  @override
  State<InventoryAuditLogsPage> createState() => _InventoryAuditLogsPageState();
}

class _InventoryAuditLogsPageState extends State<InventoryAuditLogsPage> {
  late final InventoryRepository _repository;
  Future<({List<InventoryAuditLogEntry> data, int count})>? _future;

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
      _future = _repository.getAuditLogs(wsId);
    });
  }

  @override
  Widget build(BuildContext context) {
    return shad.Scaffold(
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (previous, current) =>
            previous.currentWorkspace?.id != current.currentWorkspace?.id,
        listener: (context, state) => _reload(),
        child: FutureBuilder<({List<InventoryAuditLogEntry> data, int count})>(
          future: _future,
          builder: (context, snapshot) {
            if (!snapshot.hasData &&
                snapshot.connectionState != ConnectionState.done) {
              return const Center(child: NovaLoadingIndicator());
            }

            if (snapshot.hasError || !snapshot.hasData) {
              return Padding(
                padding: const EdgeInsets.all(16),
                child: Center(
                  child: FinanceEmptyState(
                    icon: Icons.error_outline,
                    title: context.l10n.commonSomethingWentWrong,
                    body:
                        snapshot.error?.toString() ??
                        context.l10n.inventoryAuditLabel,
                    action: shad.SecondaryButton(
                      onPressed: _reload,
                      child: Text(context.l10n.commonRetry),
                    ),
                  ),
                ),
              );
            }

            final result = snapshot.data!;

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
                      title: context.l10n.inventoryAuditLabel,
                      icon: Icons.history_rounded,
                      metrics: [
                        InventoryMetricTile(
                          label: context.l10n.inventoryAuditLabel,
                          value: '${result.count}',
                          icon: Icons.fact_check_outlined,
                        ),
                      ],
                    ),
                    const shad.Gap(16),
                    if (result.data.isEmpty)
                      FinanceEmptyState(
                        icon: Icons.history_toggle_off_outlined,
                        title: context.l10n.inventoryAuditLabel,
                        body: context.l10n.inventoryAuditEmpty,
                      )
                    else
                      FinanceSectionHeader(
                        title: context.l10n.inventoryAuditRecentTitle,
                      ),
                    if (result.data.isNotEmpty) const shad.Gap(12),
                    if (result.data.isNotEmpty)
                      ...result.data.map(
                        (entry) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: FinancePanel(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  entry.summary,
                                  style: shad.Theme.of(context).typography.large
                                      .copyWith(fontWeight: FontWeight.w700),
                                ),
                                const shad.Gap(8),
                                Text(
                                  [
                                    _labelForEntityKind(
                                      context,
                                      entry.entityKind,
                                    ),
                                    _labelForEventKind(
                                      context,
                                      entry.eventKind,
                                    ),
                                    DateFormat.yMMMd().add_jm().format(
                                      entry.occurredAt.toLocal(),
                                    ),
                                  ].join(' • '),
                                ),
                                if (entry.changedFields.isNotEmpty) ...[
                                  const shad.Gap(8),
                                  Wrap(
                                    spacing: 8,
                                    runSpacing: 8,
                                    children: entry.changedFields
                                        .map(
                                          (field) => Chip(label: Text(field)),
                                        )
                                        .toList(growable: false),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ),
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

  String _labelForEntityKind(BuildContext context, String value) {
    return switch (value) {
      'owner' => context.l10n.inventoryManageOwners,
      'product' => context.l10n.inventoryProductsLabel,
      'stock' => context.l10n.inventoryProductInventory,
      'category' => context.l10n.inventoryManageCategories,
      'unit' => context.l10n.inventoryManageUnits,
      'warehouse' => context.l10n.inventoryManageWarehouses,
      'sale' => context.l10n.inventorySalesLabel,
      _ => value,
    };
  }

  String _labelForEventKind(BuildContext context, String value) {
    return switch (value) {
      'created' => context.l10n.inventoryAuditEventCreated,
      'updated' => context.l10n.inventoryAuditEventUpdated,
      'archived' => context.l10n.inventoryAuditEventArchived,
      'reactivated' => context.l10n.inventoryAuditEventReactivated,
      'deleted' => context.l10n.inventoryAuditEventDeleted,
      'sale_created' => context.l10n.inventoryAuditEventSaleCreated,
      _ => value,
    };
  }
}
