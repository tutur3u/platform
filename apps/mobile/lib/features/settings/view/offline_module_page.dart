import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_cache_inventory.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/inventory/cubit/inventory_access_cubit.dart';
import 'package:mobile/features/settings/view/offline_module_preferences.dart';
import 'package:mobile/features/settings/view/offline_module_storage_section.dart';
import 'package:mobile/features/settings/view/offline_preparation_section.dart';
import 'package:mobile/features/settings/view/offline_search_chrome.dart';
import 'package:mobile/features/settings/view/settings_dialogs.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

class OfflineModulePage extends StatefulWidget {
  const OfflineModulePage({
    required this.moduleId,
    this.store,
    this.coordinator,
    this.embedded = false,
    super.key,
  });
  final String moduleId;
  final bool embedded;
  final CacheStore? store;
  final OfflinePreparationCoordinator? coordinator;
  @override
  State<OfflineModulePage> createState() => _OfflineModulePageState();
}

class _OfflineModulePageState extends State<OfflineModulePage> {
  CacheStore get _store => widget.store ?? CacheStore.instance;
  OfflinePreparationCoordinator get _coordinator =>
      widget.coordinator ?? OfflinePreparationCoordinator.instance;
  OfflineCacheInventory? _inventory;
  String? _userId;
  String? _workspaceId;
  String? _error;
  String _query = '';
  final _search = TextEditingController();
  bool _allowed = false;
  bool _busy = false;
  bool _refreshScheduled = false;
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    _coordinator.state.addListener(_changed);
  }

  void _changed() {
    if (!mounted || _refreshScheduled) return;
    _refreshScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _refreshScheduled = false;
      if (!mounted) return;
      setState(() {});
      unawaited(_refresh());
    });
    WidgetsBinding.instance.ensureVisualUpdate();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final user = context.watch<AuthCubit?>()?.state.user?.id;
    final workspace = context
        .watch<WorkspaceCubit>()
        .state
        .currentWorkspace
        ?.id;
    final access = context.watch<InventoryAccessCubit?>()?.state;
    final product = _coordinator.state.value.products[widget.moduleId];
    final allowed =
        user != null &&
        workspace != null &&
        product?.status != OfflinePreparationStatus.unavailable &&
        (widget.moduleId != 'inventory' ||
            (access?.wsId == workspace &&
                access?.status == InventoryAccessStatus.loaded &&
                access?.enabled == true));
    if (user == _userId && workspace == _workspaceId && allowed == _allowed) {
      return;
    }
    _generation++;
    _userId = user;
    _workspaceId = workspace;
    _allowed = allowed;
    _inventory = null;
    _error = null;
    _query = '';
    _search.clear();
    unawaited(_refresh());
  }

  @override
  void dispose() {
    _generation++;
    _search.dispose();
    _coordinator.state.removeListener(_changed);
    super.dispose();
  }

  Future<void> _refresh() async {
    final generation = ++_generation;
    final user = _userId;
    final workspace = _workspaceId;
    final status = _coordinator.state.value.products[widget.moduleId]?.status;
    if (!_allowed ||
        user == null ||
        workspace == null ||
        status == OfflinePreparationStatus.unavailable) {
      if (mounted) setState(() => _inventory = null);
      return;
    }
    try {
      final inventory = await _store.offlineInventory(
        userId: user,
        workspaceId: workspace,
        moduleId: widget.moduleId,
      );
      if (!mounted || generation != _generation) return;
      setState(() {
        _inventory = inventory;
        _error = null;
      });
    } on Object {
      if (mounted && generation == _generation) {
        setState(() => _error = context.l10n.offlineInventoryError);
      }
    }
  }

  Future<void> _evict() async {
    final user = _userId;
    final workspace = _workspaceId;
    if (!_allowed ||
        _busy ||
        _coordinator.state.value.running ||
        user == null ||
        workspace == null) {
      return;
    }
    final confirmed = await showSettingsConfirmationDialog(
      context: context,
      title: context.l10n.offlineEvictTitle,
      description: context.l10n.offlineEvictDescription,
      confirmLabel: context.l10n.offlineEvictTitle,
      isDestructive: true,
    );
    if (confirmed != true ||
        !mounted ||
        user != _userId ||
        workspace != _workspaceId ||
        !_allowed ||
        _coordinator.state.value.running) {
      return;
    }
    setState(() => _busy = true);
    try {
      _coordinator.invalidateRetainedData();
      await _store.clearNamespacePrefix(
        prefix: '${widget.moduleId}.',
        userId: user,
        workspaceId: workspace,
      );
      await _refresh();
    } on Object {
      if (mounted && user == _userId && workspace == _workspaceId) {
        setState(() => _error = context.l10n.offlineInventoryError);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final inventory = _inventory;
    final rows = inventory?.namespaces
        .where((row) => row.namespace.toLowerCase().contains(_query))
        .toList();
    final unavailable =
        !_allowed ||
        _coordinator.state.value.products[widget.moduleId]?.status ==
            OfflinePreparationStatus.unavailable;
    final scrollingBody = RefreshIndicator(
      onRefresh: _refresh,
      child: AppPageListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          if (unavailable)
            AppStateMessage(
              icon: LucideIcons.cloudOff,
              title: l10n.offlinePreparationUnavailable,
            )
          else ...[
            OfflinePreparationSection(
              productId: widget.moduleId,
              coordinator: _coordinator,
            ),
            OfflineModulePreferences(
              key: ValueKey((_userId, _workspaceId)),
              moduleId: widget.moduleId,
              userId: _userId!,
              workspaceId: _workspaceId!,
            ),
            const SizedBox(height: SettingsRowLayout.groupGap),
            if (inventory != null)
              OfflineModuleStorageSection(
                moduleId: widget.moduleId,
                inventory: inventory,
                rows: rows!,
                store: _store,
                userId: _userId!,
                workspaceId: _workspaceId!,
                canEvict: !_busy && !_coordinator.state.value.running,
                onEvict: () => unawaited(_evict()),
              ),
            if (_error != null)
              AppStateMessage.inline(
                icon: LucideIcons.triangleAlert,
                tone: AppTone.destructive,
                title: _error!,
                actionLabel: l10n.commonRetry,
                onAction: () => unawaited(_refresh()),
              ),
          ],
        ],
      ),
    );
    final body = Column(
      children: [
        if (!unavailable && inventory != null)
          OfflineSearchChrome(
            moduleId: widget.moduleId,
            controller: _search,
            onChanged: (value) =>
                setState(() => _query = value.toLowerCase().trim()),
            hint: l10n.offlineSearchStored,
          ),
        Expanded(child: scrollingBody),
      ],
    );
    if (widget.embedded) return body;
    return AppScaffold(child: body);
  }
}
