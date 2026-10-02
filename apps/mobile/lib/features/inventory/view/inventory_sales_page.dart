import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_sync_refresh.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/core/widgets/shadcn_flutter_compat.dart' as shad;
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/inventory/inventory_permissions.dart';
import 'package:mobile/features/inventory/view/inventory_checkout_page.dart';
import 'package:mobile/features/inventory/widgets/inventory_sales_periods.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';
import 'package:mobile/widgets/fab/extended_fab.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

part 'inventory_sales_card.dart';
part 'inventory_sale_detail_dialog.dart';

class InventorySalesPage extends StatefulWidget {
  const InventorySalesPage({super.key});

  @override
  State<InventorySalesPage> createState() => _InventorySalesPageState();
}

class _InventorySalesPageState extends State<InventorySalesPage>
    with OfflineSyncRefresh<InventorySalesPage> {
  @override
  Future<void> refreshAfterOfflineSync() => _loadInitial();
  static const int _pageSize = 24;

  late final InventoryRepository _inventoryRepository;
  late final FinanceRepository _financeRepository;
  late final WorkspacePermissionsRepository _permissionsRepository;
  final ScrollController _scrollController = ScrollController();

  List<InventorySaleSummary> _sales = const [];
  List<InventorySalesPeriod> _salesPeriods = const [];
  String? _selectedPeriodId;
  int _count = 0;
  String _currency = 'USD';
  bool _canCreateSales = false;
  bool _canUpdateSales = false;
  bool _canDeleteSales = false;
  bool _isLoadingInitial = false;
  bool _isLoadingMore = false;
  bool _hasMore = true;
  String? _error;
  int _requestToken = 0;

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  @override
  void initState() {
    super.initState();
    _inventoryRepository = InventoryRepository();
    _financeRepository = FinanceRepository();
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
    _permissionsRepository = WorkspacePermissionsRepository();
    _scrollController.addListener(_onScroll);
    unawaited(Future<void>.delayed(Duration.zero, _loadInitial));
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    super.dispose();
  }

  Future<void> _loadInitial({bool forceRefresh = false}) async {
    final wsId = _wsId;
    if (wsId == null) {
      return;
    }
    final requestToken = ++_requestToken;

    final cached = _inventoryRepository.peekSales(
      wsId,
      limit: _pageSize,
      periodId: _selectedPeriodId,
    );
    final cachedPeriods = _inventoryRepository.peekSalesPeriods(wsId);

    setState(() {
      _sales = cached?.data ?? const [];
      _count = cached?.count ?? 0;
      _salesPeriods = cachedPeriods ?? _salesPeriods;
      _currency =
          _financeRepository.peekWorkspaceDefaultCurrency(wsId) ?? 'USD';
      _hasMore = _sales.length < _count;
      _isLoadingInitial = true;
      _isLoadingMore = false;
      _error = null;
    });

    Future<T> loadOptional<T>(
      Future<T> future,
      T fallback,
      String label,
    ) async {
      try {
        return await future;
      } on Object catch (error, stackTrace) {
        debugPrint('Inventory sales $label load failed: $error\n$stackTrace');
        return fallback;
      }
    }

    try {
      final results = await Future.wait<dynamic>([
        CacheStore.awaitRevalidation(
          () => _inventoryRepository.getSales(
            wsId,
            limit: _pageSize,
            periodId: _selectedPeriodId,
            forceRefresh: forceRefresh,
          ),
        ),
        loadOptional(
          CacheStore.awaitRevalidation(
            () => _inventoryRepository.getSalesPeriods(
              wsId,
              forceRefresh: forceRefresh,
            ),
          ),
          _salesPeriods,
          'periods',
        ),
        loadOptional(
          _financeRepository.getWorkspaceDefaultCurrency(wsId),
          'VND',
          'currency',
        ),
        _permissionsRepository.getPermissions(wsId: wsId),
      ]);

      if (!mounted || requestToken != _requestToken) {
        return;
      }

      final sales =
          results[0]
              as ({
                List<InventorySaleSummary> data,
                int count,
                bool realtimeEnabled,
              });
      final periods = results[1] as List<InventorySalesPeriod>;
      final currency = results[2] as String;
      final permissions = results[3] as WorkspacePermissions;

      setState(() {
        _sales = sales.data;
        _salesPeriods = periods;
        _count = sales.count;
        _currency = currency;
        _canCreateSales = canCreateInventorySales(permissions);
        _canUpdateSales = canUpdateInventorySales(permissions);
        _canDeleteSales = canDeleteInventorySales(permissions);
        _hasMore = _sales.length < _count;
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
      final result = await _inventoryRepository.getSales(
        wsId,
        limit: _pageSize,
        offset: _sales.length,
        periodId: _selectedPeriodId,
      );

      if (!mounted || requestToken != _requestToken) {
        return;
      }

      setState(() {
        _sales = [..._sales, ...result.data];
        _count = result.count;
        _hasMore = _sales.length < _count;
      });
    } on Exception {
      if (!mounted || requestToken != _requestToken) {
        return;
      }
      setState(() {
        _hasMore = _sales.length < _count;
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

  Future<void> _selectPeriod(String? periodId) async {
    if (_selectedPeriodId == periodId) return;
    setState(() {
      _selectedPeriodId = periodId;
      _sales = const [];
      _count = 0;
      _hasMore = true;
    });
    await _loadInitial();
  }

  Future<void> _createSalesPeriod() async {
    final wsId = _wsId;
    if (wsId == null) return;
    final period = await showCreateInventorySalesPeriod(
      context: context,
      repository: _inventoryRepository,
      wsId: wsId,
    );
    if (period == null || !mounted) return;
    setState(() {
      _selectedPeriodId = period.id;
      _salesPeriods = [
        period,
        ..._salesPeriods.where((item) => item.id != period.id),
      ];
      _sales = const [];
    });
    await _loadInitial(forceRefresh: true);
  }

  Future<void> _togglePeriodArchive(InventorySalesPeriod period) async {
    final wsId = _wsId;
    if (wsId == null) return;
    try {
      final updated = await _inventoryRepository.updateSalesPeriod(
        wsId: wsId,
        periodId: period.id,
        previous: period,
        status: period.isArchived ? 'active' : 'archived',
      );
      if (!mounted) return;
      setState(() {
        _salesPeriods = _salesPeriods
            .map((item) => item.id == updated.id ? updated : item)
            .toList(growable: false);
      });
      showInventoryToast(
        context,
        period.isArchived
            ? context.l10n.inventorySalesPeriodRestored
            : context.l10n.inventorySalesPeriodArchived,
      );
      await _loadInitial(forceRefresh: true);
    } on Exception catch (error) {
      if (mounted) {
        showInventoryToast(context, error.toString(), destructive: true);
      }
    }
  }

  Future<void> _editSalesPeriod(InventorySalesPeriod period) async {
    final wsId = _wsId;
    if (wsId == null) return;
    final updated = await showInventorySalesPeriodEditor(
      context: context,
      repository: _inventoryRepository,
      wsId: wsId,
      period: period,
    );
    if (updated == null || !mounted) return;
    showInventoryToast(context, context.l10n.inventorySalesPeriodUpdated);
    setState(() {
      _salesPeriods = _salesPeriods
          .map((item) => item.id == updated.id ? updated : item)
          .toList(growable: false);
    });
    await _loadInitial(forceRefresh: true);
  }

  Future<void> _openCheckout() async {
    final created = await showInventoryCheckoutPage<bool>(
      context,
      initialSalesPeriods: _salesPeriods,
    );
    if (created == true && mounted) {
      await _loadInitial(forceRefresh: true);
    }
  }

  Future<void> _openSaleDetail({
    required String saleId,
    required String currency,
    required bool canUpdateSales,
    required bool canDeleteSales,
  }) async {
    final changed = await showAdaptiveSheet<bool>(
      context: context,
      maxDialogWidth: 720,
      builder: (_) => _InventorySaleDetailDialog(
        wsId: _wsId!,
        saleId: saleId,
        currency: currency,
        inventoryRepository: _inventoryRepository,
        financeRepository: _financeRepository,
        canUpdateSales: canUpdateSales,
        canDeleteSales: canDeleteSales,
      ),
    );

    if (changed == true && mounted) {
      await _loadInitial(forceRefresh: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return shad.Scaffold(
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (previous, current) =>
            previous.currentWorkspace?.id != current.currentWorkspace?.id,
        listener: (context, state) {
          setState(() {
            _selectedPeriodId = null;
            _sales = const [];
            _salesPeriods = const [];
          });
          unawaited(_loadInitial());
        },
        child: Builder(
          builder: (context) {
            if (_isLoadingInitial && _sales.isEmpty) {
              return const Center(child: NovaLoadingIndicator());
            }

            if (_error != null && _sales.isEmpty) {
              return _InventorySalesError(
                onRetry: () => unawaited(_loadInitial(forceRefresh: true)),
              );
            }

            final l10n = context.l10n;
            final revenue = _sales.fold<double>(
              0,
              (sum, sale) => sum + sale.paidAmount,
            );

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
                        InventorySalesPeriodBar(
                          workspaceId: _wsId ?? '',
                          periods: _salesPeriods,
                          selectedPeriodId: _selectedPeriodId,
                          canManage: _canCreateSales || _canUpdateSales,
                          onChanged: (periodId) =>
                              unawaited(_selectPeriod(periodId)),
                          onCreate: () => unawaited(_createSalesPeriod()),
                          onEdit: (period) =>
                              unawaited(_editSalesPeriod(period)),
                          onToggleArchive: (period) =>
                              unawaited(_togglePeriodArchive(period)),
                        ),
                        const shad.Gap(12),
                        FinancePanel(
                          child: Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              FinanceStatChip(
                                label: l10n.inventorySalesLabel,
                                value: '$_count',
                                icon: Icons.receipt_long_outlined,
                              ),
                              FinanceStatChip(
                                label: l10n.inventoryOverviewSalesRevenue,
                                value: formatCurrency(revenue, _currency),
                                icon: Icons.payments_outlined,
                              ),
                            ],
                          ),
                        ),
                        const shad.Gap(18),
                        if (_sales.isEmpty)
                          InventoryEmptyPanel(
                            icon: Icons.receipt_long_outlined,
                            body: l10n.inventorySalesEmpty,
                          )
                        else ...[
                          FinanceSectionHeader(
                            title: l10n.inventorySalesRecentTitle,
                          ),
                          const shad.Gap(12),
                          ..._sales.map(
                            (sale) => Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: PendingSyncFrame(
                                workspaceId: _wsId ?? '',
                                entityId: sale.id,
                                feature: 'inventory',
                                child: ValueListenableBuilder(
                                  valueListenable:
                                      OfflineMutationQueue.instance.pending,
                                  builder: (context, edits, _) {
                                    final pendingCreate = edits.any(
                                      (edit) =>
                                          edit.feature == 'inventory' &&
                                          edit.workspaceId == _wsId &&
                                          edit.entityId == sale.id &&
                                          edit.method == 'POST',
                                    );
                                    return _InventorySaleCard(
                                      sale: sale,
                                      currency: sale.currency ?? _currency,
                                      pendingCreate: pendingCreate,
                                      onTap: () => _openSaleDetail(
                                        saleId: sale.id,
                                        currency: sale.currency ?? _currency,
                                        canUpdateSales: _canUpdateSales,
                                        canDeleteSales: _canDeleteSales,
                                      ),
                                    );
                                  },
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
                  if (_canCreateSales)
                    ExtendedFab(
                      icon: Icons.point_of_sale_rounded,
                      label: l10n.inventoryCheckoutTitle,
                      includeBottomSafeArea: false,
                      onPressed: _openCheckout,
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

class _SaleBadge extends StatelessWidget {
  const _SaleBadge({required this.label, required this.color});

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
