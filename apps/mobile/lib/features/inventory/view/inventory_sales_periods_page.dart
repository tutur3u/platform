import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_sync_refresh.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/inventory/inventory_permissions.dart';
import 'package:mobile/features/inventory/widgets/inventory_read_warning.dart';
import 'package:mobile/features/inventory/widgets/inventory_sales_periods.dart';
import 'package:mobile/features/inventory/widgets/inventory_search_chrome.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/fab/extended_fab.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

class InventorySalesPeriodsPage extends StatefulWidget {
  const InventorySalesPeriodsPage({super.key});

  @override
  State<InventorySalesPeriodsPage> createState() =>
      _InventorySalesPeriodsPageState();
}

class _InventorySalesPeriodsPageState extends State<InventorySalesPeriodsPage>
    with OfflineSyncRefresh<InventorySalesPeriodsPage> {
  final _repository = InventoryRepository();
  final _permissions = WorkspacePermissionsRepository();
  List<InventorySalesPeriod> _periods = const [];
  (String?, String?)? _loadedScope;
  bool _canManage = false;
  final TextEditingController _searchController = TextEditingController();
  bool _loading = true;
  bool _failed = false;
  int _generation = 0;

  (String?, String?) get _scope => (
    context.read<AuthCubit>().state.user?.id,
    context.read<WorkspaceCubit>().state.currentWorkspace?.id,
  );

  @override
  Future<void> refreshAfterOfflineSync() => _reload();

  @override
  void initState() {
    super.initState();
    unawaited(Future<void>.delayed(Duration.zero, _reload));
  }

  @override
  void dispose() {
    _searchController.dispose();
    _repository.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    final scope = _scope;
    final generation = ++_generation;
    if (scope != _loadedScope) {
      _searchController.clear();
      _periods = const [];
      _canManage = false;
    }
    _loadedScope = scope;
    if (scope.$1 == null || scope.$2 == null) {
      setState(() => _loading = false);
      return;
    }
    final wsId = scope.$2!;
    bool current() => mounted && generation == _generation && scope == _scope;
    setState(() {
      _loading = true;
      _failed = false;
    });
    unawaited(() async {
      final cached = await _permissions.readCachedPermissions(wsId);
      if (!current()) return;
      setState(
        () => _canManage =
            canCreateInventorySales(cached) || canUpdateInventorySales(cached),
      );
      final fresh = await _permissions.getPermissions(wsId: wsId);
      if (!current()) return;
      setState(
        () => _canManage =
            canCreateInventorySales(fresh) || canUpdateInventorySales(fresh),
      );
    }());
    try {
      final data = await CacheStore.readWithRevalidation(
        () => _repository.getSalesPeriods(wsId),
        onSnapshot: (data) {
          if (current()) setState(() => _periods = data);
        },
      );
      if (current()) setState(() => _periods = data);
    } on Object {
      if (current()) setState(() => _failed = true);
    } finally {
      if (current()) setState(() => _loading = false);
    }
  }

  Future<void> _edit([InventorySalesPeriod? period]) async {
    final scope = _scope;
    if (!_canManage || scope.$2 == null) return;
    final result = await showInventorySalesPeriodEditor(
      context: context,
      repository: _repository,
      wsId: scope.$2!,
      period: period,
    );
    if (result != null && mounted && scope == _scope) await _reload();
  }

  Future<void> _archive(InventorySalesPeriod period) async {
    final scope = _scope;
    if (!_canManage || scope.$2 == null) return;
    try {
      await _repository.updateSalesPeriod(
        wsId: scope.$2!,
        periodId: period.id,
        previous: period,
        status: period.isArchived ? 'active' : 'archived',
      );
      if (mounted && scope == _scope) await _reload();
    } on Object {
      if (mounted && scope == _scope) setState(() => _failed = true);
    }
  }

  @override
  Widget build(BuildContext context) => MultiBlocListener(
    listeners: [
      BlocListener<AuthCubit, AuthState>(
        listenWhen: (a, b) => a.user?.id != b.user?.id,
        listener: (_, _) => unawaited(_reload()),
      ),
      BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (a, b) => a.currentWorkspace?.id != b.currentWorkspace?.id,
        listener: (_, _) => unawaited(_reload()),
      ),
    ],
    child: Stack(
      children: [
        InventorySearchChrome(
          location: Routes.inventorySalesPeriods,
          controller: _searchController,
          onChanged: (_) => setState(() {}),
        ),
        RefreshIndicator(
          onRefresh: _reload,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 108),
            children: [
              if (_failed)
                InventoryReadWarning(onRetry: () => unawaited(_reload())),
              if (_loading && _periods.isEmpty)
                const Center(child: NovaLoadingIndicator()),
              if (!_loading && _periods.isEmpty)
                Text(context.l10n.inventoryManageEmpty),
              for (final period in _periods.where(
                (p) => p.name.toLowerCase().contains(
                  _searchController.text.trim().toLowerCase(),
                ),
              ))
                PendingSyncFrame(
                  workspaceId: _scope.$2 ?? '',
                  entityId: period.id,
                  feature: 'inventory',
                  child: Card(
                    child: ListTile(
                      minVerticalPadding: 12,
                      title: Text(period.name),
                      subtitle: Text(
                        period.isArchived
                            ? context.l10n.inventorySalesPeriodArchived
                            : context.l10n.commonActive,
                      ),
                      onTap: _canManage ? () => _edit(period) : null,
                      trailing: _canManage
                          ? IconButton(
                              tooltip: period.isArchived
                                  ? context.l10n.inventorySalesPeriodRestore
                                  : context.l10n.inventorySalesPeriodArchive,
                              icon: Icon(
                                period.isArchived
                                    ? Icons.unarchive_outlined
                                    : Icons.archive_outlined,
                              ),
                              onPressed: () => _archive(period),
                            )
                          : null,
                    ),
                  ),
                ),
            ],
          ),
        ),
        if (_canManage)
          ExtendedFab(
            icon: Icons.add,
            label: context.l10n.inventorySalesPeriodCreate,
            includeBottomSafeArea: false,
            onPressed: _edit,
          ),
      ],
    ),
  );
}
