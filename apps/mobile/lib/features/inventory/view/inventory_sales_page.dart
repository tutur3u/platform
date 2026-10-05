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
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/core/widgets/shadcn_flutter_compat.dart' as shad;
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/inventory/inventory_permissions.dart';
import 'package:mobile/features/inventory/view/inventory_checkout_page.dart';
import 'package:mobile/features/inventory/widgets/inventory_read_warning.dart';
import 'package:mobile/features/inventory/widgets/inventory_sales_periods.dart';
import 'package:mobile/features/inventory/widgets/inventory_sales_totals.dart';
import 'package:mobile/features/inventory/widgets/inventory_search_chrome.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';
import 'package:mobile/widgets/fab/extended_fab.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

part 'inventory_sale_detail_dialog.dart';
part 'inventory_sales_card.dart';
part 'inventory_sales_period_actions.dart';

class InventorySalesPage extends StatefulWidget {
  const InventorySalesPage({
    super.key,
    this.inventoryRepository,
    this.financeRepository,
    this.permissionsRepository,
  });

  final InventoryRepository? inventoryRepository;
  final FinanceRepository? financeRepository;
  final WorkspacePermissionsRepository? permissionsRepository;

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
  final TextEditingController _searchController = TextEditingController();
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
  bool _limitedData = false;
  int _requestToken = 0;
  int? _deniedReadRequest;
  (String?, String?)? _loadedScope;

  (String?, String?) get _scope => (
    context.read<AuthCubit>().state.status == AuthStatus.authenticated
        ? context.read<AuthCubit>().state.user?.id
        : null,
    _wsId,
  );

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
    final cachedPermissions = workspaceId == null
        ? null
        : _permissionsRepository.peekPermissions(workspaceId);
    if (cachedPermissions != null) _applyPermissions(cachedPermissions);
    _loadedScope = _scope;
    _scrollController.addListener(_onScroll);
    unawaited(Future<void>.delayed(Duration.zero, _loadInitial));
  }

  @override
  void dispose() {
    _searchController.dispose();
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    super.dispose();
  }

  void _applyPermissions(WorkspacePermissions permissions) {
    _canCreateSales = canCreateInventorySales(permissions);
    _canUpdateSales = canUpdateInventorySales(permissions);
    _canDeleteSales = canDeleteInventorySales(permissions);
  }

  Future<void> _refreshPermissions((String?, String?) scope, int token) async {
    bool current() =>
        mounted &&
        _scope == scope &&
        token == _requestToken &&
        token != _deniedReadRequest;
    if (scope.$1 == null || scope.$2 == null) return;
    final cached = await _permissionsRepository.readCachedPermissions(
      scope.$2!,
    );
    if (!current()) return;
    setState(() => _applyPermissions(cached));
    final fresh = await _permissionsRepository.getPermissions(wsId: scope.$2!);
    if (!current()) return;
    setState(() => _applyPermissions(fresh));
  }

  Future<void> _loadInitial({bool forceRefresh = false}) async {
    final wsId = _wsId;
    if (wsId == null || _scope.$1 == null) {
      ++_requestToken;
      setState(() {
        _sales = const [];
        _salesPeriods = const [];
        _count = 0;
        _canCreateSales = _canUpdateSales = _canDeleteSales = false;
      });
      return;
    }
    final requestToken = ++_requestToken;
    final scope = _scope;
    final sameScope = _loadedScope == scope;
    _loadedScope = scope;
    if (!sameScope) {
      _applyPermissions(
        const WorkspacePermissions(permissions: {}, isCreator: false),
      );
      _sales = const [];
      _salesPeriods = const [];
      _selectedPeriodId = null;
    }
    unawaited(_refreshPermissions(scope, requestToken));

    final cached = _inventoryRepository.peekSales(
      wsId,
      limit: _pageSize,
      periodId: _selectedPeriodId,
    );
    final cachedPeriods = _inventoryRepository.peekSalesPeriods(wsId);

    setState(() {
      _sales = cached?.data ?? (sameScope ? _sales : const []);
      _count = cached?.count ?? (sameScope ? _count : 0);
      _salesPeriods = cachedPeriods ?? _salesPeriods;
      _currency =
          _financeRepository.peekWorkspaceDefaultCurrency(wsId) ?? 'USD';
      _hasMore = _sales.length < _count;
      _isLoadingInitial = true;
      _isLoadingMore = false;
      _error = null;
      _limitedData = false;
    });

    Future<T> loadOptional<T>(
      Future<T> future,
      T fallback,
      String label,
    ) async {
      try {
        return await future;
      } on Object catch (error, stackTrace) {
        if (error is ApiException && _definitiveDenial(error)) {
          rethrow;
        }
        _limitedData = true;
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
      ]);

      if (!mounted || requestToken != _requestToken || _loadedScope != _scope) {
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

      setState(() {
        _sales = sales.data;
        _salesPeriods = periods;
        _count = sales.count;
        _currency = currency;
        _hasMore = _sales.length < _count;
        _error = null;
      });
    } on ApiException catch (error) {
      if (!mounted || requestToken != _requestToken || _loadedScope != _scope) {
        return;
      }
      setState(() {
        if (_definitiveDenial(error)) {
          _clearDeniedRead(requestToken);
        }
        _error = error.message.isNotEmpty
            ? error.message
            : context.l10n.commonSomethingWentWrong;
      });
    } on Exception {
      if (!mounted || requestToken != _requestToken || _loadedScope != _scope) {
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

  bool _definitiveDenial(ApiException error) =>
      error.statusCode == 401 ||
      error.statusCode == 403 && !error.isVerificationRequired;

  void _clearDeniedRead(int requestToken) {
    _deniedReadRequest = requestToken;
    _sales = const [];
    _salesPeriods = const [];
    _selectedPeriodId = null;
    _count = 0;
    _hasMore = false;
    _canCreateSales = _canUpdateSales = _canDeleteSales = false;
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

      if (!mounted || requestToken != _requestToken || _loadedScope != _scope) {
        return;
      }

      setState(() {
        _sales = [..._sales, ...result.data];
        _count = result.count;
        _hasMore = _sales.length < _count;
      });
    } on ApiException catch (error) {
      if (!mounted || requestToken != _requestToken || _loadedScope != _scope) {
        return;
      }
      setState(() {
        if (_definitiveDenial(error)) _clearDeniedRead(requestToken);
        _error = error.message;
      });
    } on Exception {
      if (!mounted || requestToken != _requestToken || _loadedScope != _scope) {
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
      builder: (_) => InventorySaleDetailDialog(
        wsId: _wsId!,
        saleId: saleId,
        currency: currency,
        inventoryRepository: _inventoryRepository,
        canUpdateSales: canUpdateSales,
        canDeleteSales: canDeleteSales,
      ),
    );

    if (changed == true && mounted) {
      await _loadInitial(forceRefresh: true);
    }
  }

  void _update(VoidCallback change) => setState(change);

  @override
  Widget build(BuildContext context) {
    return shad.Scaffold(
      child: BlocListener<AuthCubit, AuthState>(
        listenWhen: (a, b) => a.user?.id != b.user?.id,
        listener: (_, _) => unawaited(_loadInitial()),
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
              final l10n = context.l10n;
              return ResponsiveWrapper(
                maxWidth: ResponsivePadding.maxContentWidth(
                  context.deviceClass,
                ),
                child: Stack(
                  children: [
                    InventorySearchChrome(
                      location: Routes.inventorySales,
                      controller: _searchController,
                      onChanged: (_) => setState(() {}),
                    ),
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
                          if (_error != null || _limitedData)
                            InventoryReadWarning(
                              onRetry: () =>
                                  unawaited(_loadInitial(forceRefresh: true)),
                            ),
                          InventorySalesPeriodBar(
                            workspaceId: _wsId ?? '',
                            periods: _salesPeriods,
                            selectedPeriodId: _selectedPeriodId,
                            canManage: false,
                            onChanged: (periodId) =>
                                unawaited(_selectPeriod(periodId)),
                            onCreate: () => unawaited(_createSalesPeriod()),
                            onEdit: (period) =>
                                unawaited(_editSalesPeriod(period)),
                            onToggleArchive: (period) =>
                                unawaited(_togglePeriodArchive(period)),
                          ),
                          const shad.Gap(12),
                          InventorySalesTotals(
                            sales: _sales,
                            isPending: (id) =>
                                OfflineMutationQueue.instance.pending.value.any(
                                  (m) =>
                                      m.userId == _scope.$1 &&
                                      m.workspaceId == _wsId &&
                                      m.entityId == id,
                                ),
                          ),
                          const shad.Gap(18),
                          if (_isLoadingInitial && _sales.isEmpty)
                            const FinanceSkeletonBlock(height: 160, radius: 20)
                          else if (_sales.isEmpty)
                            InventoryEmptyPanel(
                              icon: Icons.receipt_long_outlined,
                              body: l10n.inventorySalesEmpty,
                            )
                          else ...[
                            FinanceSectionHeader(
                              title: l10n.inventorySalesRecentTitle,
                            ),
                            const shad.Gap(12),
                            ..._sales
                                .where(
                                  (sale) =>
                                      [
                                            sale.notice,
                                            sale.customerName,
                                            sale.creatorName,
                                            sale.walletName,
                                            ...sale.owners,
                                          ]
                                          .whereType<String>()
                                          .join(' ')
                                          .toLowerCase()
                                          .contains(
                                            _searchController.text
                                                .trim()
                                                .toLowerCase(),
                                          ),
                                )
                                .map(
                                  (sale) => Padding(
                                    padding: const EdgeInsets.only(bottom: 12),
                                    child: PendingSyncFrame(
                                      workspaceId: _wsId ?? '',
                                      entityId: sale.id,
                                      feature: 'inventory',
                                      child: ValueListenableBuilder(
                                        valueListenable: OfflineMutationQueue
                                            .instance
                                            .pending,
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
                                            currency:
                                                sale.currency ?? _currency,
                                            pendingCreate: pendingCreate,
                                            onTap: () => _openSaleDetail(
                                              saleId: sale.id,
                                              currency:
                                                  sale.currency ?? _currency,
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
