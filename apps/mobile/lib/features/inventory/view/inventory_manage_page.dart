import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
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
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'inventory_manage_item_widgets.dart';
part 'inventory_manage_item_actions.dart';

class InventoryManagePage extends StatefulWidget {
  const InventoryManagePage({
    super.key,
    this.inventoryRepository,
    this.financeRepository,
    this.permissionsRepository,
  });

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
    unawaited(Future<void>.delayed(Duration.zero, _reload));
  }

  @override
  void dispose() {
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
    final results = await Future.wait<dynamic>([
      _loadManageCollection(
        'owners',
        () => _inventoryRepository.getOwners(wsId, forceRefresh: forceRefresh),
      ),
      _loadManageCollection(
        'manufacturers',
        () => _inventoryRepository.getManufacturers(
          wsId,
          forceRefresh: forceRefresh,
        ),
      ),
      _loadManageCollection(
        'product categories',
        () => _inventoryRepository.getProductCategories(
          wsId,
          forceRefresh: forceRefresh,
        ),
      ),
      _loadManageCollection(
        'product units',
        () => _inventoryRepository.getProductUnits(
          wsId,
          forceRefresh: forceRefresh,
        ),
      ),
      _loadManageCollection(
        'product warehouses',
        () => _inventoryRepository.getProductWarehouses(
          wsId,
          forceRefresh: forceRefresh,
        ),
      ),
      _loadManageCollection(
        'finance categories',
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
    Future<List<T>> Function() loader,
  ) async {
    try {
      return await loader();
    } on Object catch (error, stackTrace) {
      debugPrint(
        'Failed to load inventory Manage $collectionName: $error\n$stackTrace',
      );
      return <T>[];
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

  @override
  Widget build(BuildContext context) {
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
                child: NovaRefreshIndicator(
                  onRefresh: () => _reload(forceRefresh: true),
                  child: ListView(
                    padding: EdgeInsets.fromLTRB(
                      16,
                      8,
                      16,
                      32 + MediaQuery.paddingOf(context).bottom,
                    ),
                    children: [
                      if (snapshot.hasError)
                        shad.SecondaryButton(
                          onPressed: () =>
                              unawaited(_reload(forceRefresh: true)),
                          child: Text(l10n.commonRetry),
                        ),
                      Align(
                        alignment: AlignmentDirectional.centerEnd,
                        child: shad.OutlineButton(
                          onPressed: () =>
                              context.go(Routes.inventoryAuditLogs),
                          leading: const Icon(Icons.history_rounded, size: 18),
                          child: Text(l10n.inventoryAuditLabel),
                        ),
                      ),
                      const shad.Gap(12),
                      _ManageSection(
                        title: l10n.inventoryManageOwners,
                        actionLabel: l10n.inventoryAddOwner,
                        canManage: data.canManageSetup,
                        onSubmit: () => _showCreateDialog(
                          title: l10n.inventoryAddOwner,
                          confirmLabel: l10n.inventoryAddOwner,
                          onConfirm: _createOwner,
                        ),
                        child: _ChipWrap(
                          workspaceId: _wsId ?? '',
                          onEdit: data.canManageSetup
                              ? (id, name) => _editSetupItem(
                                  InventorySetupKind.owner,
                                  id,
                                  data.owners
                                      .firstWhere((owner) => owner.id == id)
                                      .name,
                                )
                              : null,
                          onDelete: data.canManageSetup
                              ? (id, name) => _deleteSetupItem(
                                  InventorySetupKind.owner,
                                  id,
                                  name,
                                )
                              : null,
                          items: data.owners
                              .map((owner) {
                                if (owner.archived) {
                                  return (
                                    owner.id,
                                    '${owner.name} '
                                        '(${l10n.inventoryOwnerArchived})',
                                  );
                                }
                                return (owner.id, owner.name);
                              })
                              .toList(growable: false),
                        ),
                      ),
                      const shad.Gap(12),
                      _ManageSection(
                        title: l10n.inventoryManageCategories,
                        actionLabel: l10n.inventoryAddCategory,
                        canManage: data.canManageSetup,
                        onSubmit: () => _showCreateDialog(
                          title: l10n.inventoryAddCategory,
                          confirmLabel: l10n.inventoryAddCategory,
                          onConfirm: _createCategory,
                        ),
                        child: _ChipWrap(
                          workspaceId: _wsId ?? '',
                          onEdit: data.canManageSetup
                              ? (id, name) => _editSetupItem(
                                  InventorySetupKind.category,
                                  id,
                                  name,
                                )
                              : null,
                          onDelete: data.canManageSetup
                              ? (id, name) => _deleteSetupItem(
                                  InventorySetupKind.category,
                                  id,
                                  name,
                                )
                              : null,
                          items: data.productCategories
                              .map((item) => (item.id, item.name))
                              .toList(growable: false),
                        ),
                      ),
                      const shad.Gap(12),
                      _ManageSection(
                        title: l10n.inventoryManageManufacturers,
                        actionLabel: l10n.inventoryAddManufacturer,
                        canManage: data.canManageSetup,
                        onSubmit: () => _showCreateDialog(
                          title: l10n.inventoryAddManufacturer,
                          confirmLabel: l10n.inventoryAddManufacturer,
                          onConfirm: _createManufacturer,
                        ),
                        child: _ChipWrap(
                          workspaceId: _wsId ?? '',
                          onEdit: data.canManageSetup
                              ? (id, name) => _editSetupItem(
                                  InventorySetupKind.manufacturer,
                                  id,
                                  name,
                                )
                              : null,
                          onDelete: data.canManageSetup
                              ? (id, name) => _deleteSetupItem(
                                  InventorySetupKind.manufacturer,
                                  id,
                                  name,
                                )
                              : null,
                          items: data.manufacturers
                              .map((item) => (item.id, item.name))
                              .toList(growable: false),
                        ),
                      ),
                      const shad.Gap(12),
                      _ManageSection(
                        title: l10n.inventoryManageUnits,
                        actionLabel: l10n.inventoryAddUnit,
                        canManage: data.canManageSetup,
                        onSubmit: () => _showCreateDialog(
                          title: l10n.inventoryAddUnit,
                          confirmLabel: l10n.inventoryAddUnit,
                          onConfirm: _createUnit,
                        ),
                        child: _ChipWrap(
                          workspaceId: _wsId ?? '',
                          onEdit: data.canManageSetup
                              ? (id, name) => _editSetupItem(
                                  InventorySetupKind.unit,
                                  id,
                                  name,
                                )
                              : null,
                          onDelete: data.canManageSetup
                              ? (id, name) => _deleteSetupItem(
                                  InventorySetupKind.unit,
                                  id,
                                  name,
                                )
                              : null,
                          items: data.units
                              .map((item) => (item.id, item.name))
                              .toList(growable: false),
                        ),
                      ),
                      const shad.Gap(12),
                      _ManageSection(
                        title: l10n.inventoryManageWarehouses,
                        actionLabel: l10n.inventoryAddWarehouse,
                        canManage: data.canManageSetup,
                        onSubmit: () => _showCreateDialog(
                          title: l10n.inventoryAddWarehouse,
                          confirmLabel: l10n.inventoryAddWarehouse,
                          onConfirm: _createWarehouse,
                        ),
                        child: _ChipWrap(
                          workspaceId: _wsId ?? '',
                          onEdit: data.canManageSetup
                              ? (id, name) => _editSetupItem(
                                  InventorySetupKind.warehouse,
                                  id,
                                  name,
                                )
                              : null,
                          onDelete: data.canManageSetup
                              ? (id, name) => _deleteSetupItem(
                                  InventorySetupKind.warehouse,
                                  id,
                                  name,
                                )
                              : null,
                          items: data.warehouses
                              .map((item) => (item.id, item.name))
                              .toList(growable: false),
                        ),
                      ),
                      const shad.Gap(12),
                      FinancePanel(
                        padding: const EdgeInsets.all(14),
                        radius: 18,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              l10n.financeCategories,
                              style: shad.Theme.of(context).typography.large
                                  .copyWith(fontWeight: FontWeight.w700),
                            ),
                            const shad.Gap(10),
                            _ChipWrap(
                              workspaceId: _wsId ?? '',
                              feature: 'finance',
                              items: data.financeCategories
                                  .where((item) => (item.name ?? '').isNotEmpty)
                                  .map((item) => (item.id, item.name ?? ''))
                                  .toList(growable: false),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
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

class _ManageSection extends StatelessWidget {
  const _ManageSection({
    required this.title,
    required this.actionLabel,
    required this.canManage,
    required this.onSubmit,
    required this.child,
  });

  final String title;
  final String actionLabel;
  final bool canManage;
  final Future<void> Function() onSubmit;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return FinancePanel(
      padding: const EdgeInsets.all(14),
      radius: 18,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          FinanceSectionHeader(
            title: title,
            action: canManage
                ? IconButton(
                    tooltip: actionLabel,
                    onPressed: () => unawaited(onSubmit()),
                    icon: const Icon(Icons.add_rounded, size: 20),
                  )
                : null,
          ),
          const shad.Gap(12),
          child,
        ],
      ),
    );
  }
}
