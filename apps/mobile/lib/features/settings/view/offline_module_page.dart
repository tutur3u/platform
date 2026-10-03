import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_cache_inventory.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/inventory/cubit/inventory_access_cubit.dart';
import 'package:mobile/features/settings/view/offline_module_preferences.dart';
import 'package:mobile/features/settings/view/offline_preparation_section.dart';
import 'package:mobile/features/settings/view/settings_dialogs.dart';
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
    unawaited(_refresh());
  }

  @override
  void dispose() {
    _generation++;
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
    final title = switch (widget.moduleId) {
      'finance' => l10n.financeTitle,
      'inventory' => l10n.inventoryTitle,
      'tasks' => l10n.tasksTitle,
      _ => l10n.calendarTitle,
    };
    final inventory = _inventory;
    final rows = inventory?.namespaces
        .where((row) => row.namespace.toLowerCase().contains(_query))
        .toList();
    final unavailable =
        !_allowed ||
        _coordinator.state.value.products[widget.moduleId]?.status ==
            OfflinePreparationStatus.unavailable;
    final body = RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(20),
        children: [
          if (widget.embedded)
            Row(
              children: [
                IconButton(
                  tooltip: MaterialLocalizations.of(context).backButtonTooltip,
                  onPressed: () => Navigator.of(context).maybePop(),
                  icon: const Icon(Icons.arrow_back),
                ),
                Expanded(
                  child: Text(
                    title,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                ),
              ],
            ),
          if (unavailable)
            Text(l10n.offlinePreparationUnavailable)
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
            const SizedBox(height: 20),
            Text(l10n.offlineCoverageUnknown),
            Text(l10n.offlineBytesExplanation),
            if (inventory != null) ...[
              const SizedBox(height: 12),
              Text(l10n.offlineLogicalBytes('${inventory.logicalBytes}')),
              Text(l10n.offlinePendingCoverage(inventory.pending)),
              const SizedBox(height: 12),
              TextField(
                key: const ValueKey('offline-namespace-search'),
                decoration: InputDecoration(hintText: l10n.offlineSearchStored),
                onChanged: (value) =>
                    setState(() => _query = value.toLowerCase().trim()),
              ),
              if (rows!.isEmpty) Text(l10n.offlineNoStoredItems),
              for (final row in rows)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        row.namespace,
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                      Text(
                        l10n.offlineAvailableItems(row.items, row.snapshots),
                      ),
                      Text(l10n.offlineLogicalBytes('${row.logicalBytes}')),
                      Text(
                        row.serverReportedTotal == null
                            ? l10n.offlineExpectedTotalUnknown
                            : l10n.offlineExpectedTotal(
                                row.serverReportedTotal!,
                              ),
                      ),
                      Text(
                        l10n.offlineFreshness(
                          row.staleSnapshots,
                          row.expiredSnapshots,
                        ),
                      ),
                      Text(
                        l10n.offlineLastFetch(
                          DateFormat.yMd(
                            Localizations.localeOf(context).toString(),
                          ).add_jm().format(row.lastFetch.toLocal()),
                        ),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: _busy || _coordinator.state.value.running
                    ? null
                    : _evict,
                icon: const Icon(Icons.delete_outline),
                label: Text(l10n.offlineEvictTitle),
              ),
            ],
            if (_error != null) ...[
              Text(_error!, semanticsLabel: _error),
              TextButton(onPressed: _refresh, child: Text(l10n.commonRetry)),
            ],
          ],
        ],
      ),
    );
    if (widget.embedded) return body;
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: body,
    );
  }
}
