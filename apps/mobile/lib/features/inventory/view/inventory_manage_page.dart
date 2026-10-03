import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_sync_refresh.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/inventory/inventory_permissions.dart';
import 'package:mobile/features/inventory/view/inventory_catalog_hub.dart';
import 'package:mobile/features/inventory/widgets/inventory_read_warning.dart';
import 'package:mobile/features/inventory/widgets/inventory_search_chrome.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:mobile/widgets/fab/extended_fab.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'inventory_manage_item_actions.dart';
part 'inventory_manage_item_widgets.dart';

class InventoryManagePage extends StatefulWidget {
  const InventoryManagePage({
    super.key,
    this.section,
    this.inventoryRepository,
    this.financeRepository,
    this.permissionsRepository,
  });

  final InventoryCatalogSection? section;
  final InventoryRepository? inventoryRepository;
  final FinanceRepository? financeRepository;
  final WorkspacePermissionsRepository? permissionsRepository;

  @override
  State<InventoryManagePage> createState() => _InventoryManagePageState();
}

class _InventoryManagePageState extends State<InventoryManagePage>
    with OfflineSyncRefresh<InventoryManagePage> {
  @override
  Future<void> refreshAfterOfflineSync() => _reload();
  late final InventoryRepository _inventoryRepository;
  late final FinanceRepository _financeRepository;
  late final WorkspacePermissionsRepository _permissionsRepository;
  Future<_InventoryManageData>? _future;
  _InventoryManageData? _cachedData;
  Future<_InventoryManageData>? _inFlight;
  bool _limitedData = false;
  final TextEditingController _searchController = TextEditingController();
  (String?, String?)? _futureScope;

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
    _permissionsRepository =
        widget.permissionsRepository ?? WorkspacePermissionsRepository();
    if (widget.section != null) {
      unawaited(Future<void>.delayed(Duration.zero, _reload));
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    if (widget.inventoryRepository == null) _inventoryRepository.dispose();
    super.dispose();
  }

  Future<void> _reload({bool forceRefresh = false}) async {
    if (!mounted) return;
    final scope = _scope;
    final wsId = scope.$2;
    if (scope.$1 == null || wsId == null) {
      setState(() {
        _future = null;
        _cachedData = null;
        _futureScope = scope;
      });
      return;
    }
    if (!forceRefresh && _futureScope == scope && _inFlight != null) return;
    if (_futureScope != scope) _cachedData = null;
    final future = CacheStore.readWithRevalidation(
      () => _loadData(wsId, forceRefresh: forceRefresh),
      onSnapshot: (data) {
        if (!mounted || _scope != scope) return;
        setState(() => _cachedData = data);
      },
    );
    _inFlight = future;
    setState(() {
      _future = future;
      _futureScope = scope;
    });
    try {
      await future;
    } on Object {
      // The scoped FutureBuilder renders the error and retry action.
    } finally {
      if (identical(_inFlight, future)) _inFlight = null;
    }
  }

  Future<_InventoryManageData> _loadData(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    _limitedData = false;
    final results = await Future.wait<dynamic>([
      _loadManageCollection(
        'owners',
        _cachedData?.owners ?? const [],
        () => _inventoryRepository.getOwners(wsId, forceRefresh: forceRefresh),
      ),
      _loadManageCollection(
        'manufacturers',
        _cachedData?.manufacturers ?? const [],
        () => _inventoryRepository.getManufacturers(
          wsId,
          forceRefresh: forceRefresh,
        ),
      ),
      _loadManageCollection(
        'product categories',
        _cachedData?.productCategories ?? const [],
        () => _inventoryRepository.getProductCategories(
          wsId,
          forceRefresh: forceRefresh,
        ),
      ),
      _loadManageCollection(
        'product units',
        _cachedData?.units ?? const [],
        () => _inventoryRepository.getProductUnits(
          wsId,
          forceRefresh: forceRefresh,
        ),
      ),
      _loadManageCollection(
        'product warehouses',
        _cachedData?.warehouses ?? const [],
        () => _inventoryRepository.getProductWarehouses(
          wsId,
          forceRefresh: forceRefresh,
        ),
      ),
      _loadManageCollection(
        'finance categories',
        _cachedData?.financeCategories ?? const [],
        () => _financeRepository.getCategories(wsId),
      ),
      _permissionsRepository.getPermissions(wsId: wsId),
    ]);

    return _InventoryManageData(
      owners: results[0] as List<InventoryOwner>,
      manufacturers: results[1] as List<InventoryLookupItem>,
      productCategories: results[2] as List<InventoryLookupItem>,
      units: results[3] as List<InventoryLookupItem>,
      warehouses: results[4] as List<InventoryLookupItem>,
      financeCategories: results[5] as List<TransactionCategory>,
      canManageSetup: canManageInventorySetup(
        results[6] as WorkspacePermissions,
      ),
    );
  }

  Future<List<T>> _loadManageCollection<T>(
    String collectionName,
    List<T> retained,
    Future<List<T>> Function() loader,
  ) async {
    try {
      return await loader();
    } on Object catch (error, stackTrace) {
      debugPrint(
        'Failed to load inventory Manage $collectionName: $error\n$stackTrace',
      );
      _limitedData = true;
      return retained;
    }
  }

  Future<void> _createOwner(String name) async {
    final wsId = _wsId;
    if (wsId == null || name.isEmpty) return;
    await _inventoryRepository.createOwner(wsId, name);
  }

  Future<void> _createCategory(String name) async {
    final wsId = _wsId;
    if (wsId == null || name.isEmpty) return;
    await _inventoryRepository.createProductCategory(wsId, name);
  }

  Future<void> _createManufacturer(String name) async {
    final wsId = _wsId;
    if (wsId == null || name.isEmpty) return;
    await _inventoryRepository.createManufacturer(wsId, name);
  }

  Future<void> _createUnit(String name) async {
    final wsId = _wsId;
    if (wsId == null || name.isEmpty) return;
    await _inventoryRepository.createProductUnit(wsId, name);
  }

  Future<void> _createWarehouse(String name) async {
    final wsId = _wsId;
    if (wsId == null || name.isEmpty) return;
    await _inventoryRepository.createProductWarehouse(wsId, name);
  }

  Future<void> _showCreateDialog({
    required String title,
    required String confirmLabel,
    required Future<void> Function(String value) onConfirm,
    String initialValue = '',
  }) async {
    final scope = _scope;
    final scopeError = context.l10n.commonSomethingWentWrong;
    final result = await showAdaptiveSheet<bool>(
      context: context,
      maxDialogWidth: 420,
      builder: (_) => _CreateManageItemDialog(
        title: title,
        confirmLabel: confirmLabel,
        initialValue: initialValue,
        onConfirm: (value) async {
          if (!mounted || _scope != scope) {
            throw _InventoryScopeChanged(scopeError);
          }
          await onConfirm(value);
        },
      ),
    );

    if (result == true && mounted && _scope == scope) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || _scope != scope) return;
        unawaited(_reload(forceRefresh: true));
        showInventoryToast(context, confirmLabel);
      });
    }
  }

  InventorySetupKind? get _setupKind => switch (widget.section) {
    InventoryCatalogSection.owners => InventorySetupKind.owner,
    InventoryCatalogSection.categories => InventorySetupKind.category,
    InventoryCatalogSection.manufacturers => InventorySetupKind.manufacturer,
    InventoryCatalogSection.units => InventorySetupKind.unit,
    InventoryCatalogSection.warehouses => InventorySetupKind.warehouse,
    _ => null,
  };

  String get _createLabel {
    final l10n = context.l10n;
    return switch (widget.section) {
      InventoryCatalogSection.owners => l10n.inventoryAddOwner,
      InventoryCatalogSection.categories => l10n.inventoryAddCategory,
      InventoryCatalogSection.manufacturers => l10n.inventoryAddManufacturer,
      InventoryCatalogSection.units => l10n.inventoryAddUnit,
      InventoryCatalogSection.warehouses => l10n.inventoryAddWarehouse,
      _ => l10n.commonCreate,
    };
  }

  Future<void> _createSection(String name) => switch (widget.section) {
    InventoryCatalogSection.owners => _createOwner(name),
    InventoryCatalogSection.categories => _createCategory(name),
    InventoryCatalogSection.manufacturers => _createManufacturer(name),
    InventoryCatalogSection.units => _createUnit(name),
    InventoryCatalogSection.warehouses => _createWarehouse(name),
    _ => Future<void>.value(),
  };

  List<(String, String)> _sectionItems(_InventoryManageData data) =>
      switch (widget.section) {
        InventoryCatalogSection.owners =>
          data.owners.map((i) => (i.id, i.name)).toList(),
        InventoryCatalogSection.categories =>
          data.productCategories.map((i) => (i.id, i.name)).toList(),
        InventoryCatalogSection.manufacturers =>
          data.manufacturers.map((i) => (i.id, i.name)).toList(),
        InventoryCatalogSection.units =>
          data.units.map((i) => (i.id, i.name)).toList(),
        InventoryCatalogSection.warehouses =>
          data.warehouses.map((i) => (i.id, i.name)).toList(),
        InventoryCatalogSection.financeCategories =>
          data.financeCategories.map((i) => (i.id, i.name ?? '')).toList(),
        _ => const [],
      };

  @override
  Widget build(BuildContext context) {
    if (widget.section == null) return const InventoryCatalogHub();
    final l10n = context.l10n;
    context.select<AuthCubit, (AuthStatus, String?)>(
      (cubit) => (cubit.state.status, cubit.state.user?.id),
    );
    final scope = _scope;
    return BlocListener<AuthCubit, AuthState>(
      listenWhen: (previous, current) =>
          previous.status != current.status ||
          previous.user?.id != current.user?.id,
      listener: (context, state) => unawaited(_reload()),
      child: shad.Scaffold(
        child: BlocListener<WorkspaceCubit, WorkspaceState>(
          listenWhen: (previous, current) =>
              previous.currentWorkspace?.id != current.currentWorkspace?.id,
          listener: (context, state) => unawaited(_reload()),
          child: FutureBuilder<_InventoryManageData>(
            key: ValueKey(scope),
            future: _futureScope == scope ? _future : null,
            builder: (context, snapshot) {
              if (scope.$1 == null || scope.$2 == null) {
                return const SizedBox.shrink();
              }
              final data =
                  snapshot.data ?? (_futureScope == scope ? _cachedData : null);
              if (data == null &&
                  snapshot.connectionState != ConnectionState.done) {
                return const InventoryOverviewSkeleton();
              }

              if (data == null) {
                return Center(
                  child: FinanceEmptyState(
                    icon: Icons.error_outline,
                    title: l10n.commonSomethingWentWrong,
                    body:
                        snapshot.error?.toString() ?? l10n.inventoryManageLabel,
                    action: shad.SecondaryButton(
                      onPressed: () => unawaited(_reload(forceRefresh: true)),
                      child: Text(l10n.commonRetry),
                    ),
                  ),
                );
              }

              return ResponsiveWrapper(
                maxWidth: ResponsivePadding.maxContentWidth(
                  context.deviceClass,
                ),
                child: Stack(
                  children: [
                    InventorySearchChrome(
                      location: Routes.inventoryCatalogPath(
                        widget.section!.name,
                      ),
                      controller: _searchController,
                      onChanged: (_) => setState(() {}),
                    ),
                    NovaRefreshIndicator(
                      onRefresh: () => _reload(forceRefresh: true),
                      child: ListView(
                        padding: EdgeInsets.fromLTRB(
                          16,
                          8,
                          16,
                          108 + MediaQuery.paddingOf(context).bottom,
                        ),
                        children: [
                          if (snapshot.hasError || _limitedData)
                            InventoryReadWarning(
                              onRetry: () =>
                                  unawaited(_reload(forceRefresh: true)),
                            ),
                          _ChipWrap(
                            workspaceId: _wsId ?? '',
                            feature:
                                widget.section ==
                                    InventoryCatalogSection.financeCategories
                                ? 'finance'
                                : 'inventory',
                            items: _sectionItems(data)
                                .where(
                                  (item) => item.$2.toLowerCase().contains(
                                    _searchController.text.trim().toLowerCase(),
                                  ),
                                )
                                .toList(),
                            onEdit: data.canManageSetup && _setupKind != null
                                ? (id, name) =>
                                      _editSetupItem(_setupKind!, id, name)
                                : null,
                            onDelete: data.canManageSetup && _setupKind != null
                                ? (id, name) =>
                                      _deleteSetupItem(_setupKind!, id, name)
                                : null,
                          ),
                        ],
                      ),
                    ),
                    if (data.canManageSetup && _setupKind != null)
                      ExtendedFab(
                        icon: Icons.add,
                        label: _createLabel,
                        includeBottomSafeArea: false,
                        onPressed: () => _showCreateDialog(
                          title: _createLabel,
                          confirmLabel: _createLabel,
                          onConfirm: _createSection,
                        ),
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

class _InventoryScopeChanged implements Exception {
  const _InventoryScopeChanged(this.message);

  final String message;

  @override
  String toString() => message;
}

class _InventoryManageData {
  const _InventoryManageData({
    required this.owners,
    required this.manufacturers,
    required this.productCategories,
    required this.units,
    required this.warehouses,
    required this.financeCategories,
    required this.canManageSetup,
  });

  final List<InventoryOwner> owners;
  final List<InventoryLookupItem> manufacturers;
  final List<InventoryLookupItem> productCategories;
  final List<InventoryLookupItem> units;
  final List<InventoryLookupItem> warehouses;
  final List<TransactionCategory> financeCategories;
  final bool canManageSetup;
}
