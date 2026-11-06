import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/replica_entity_record.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

/// Stored rows only: no pending overlay or network request. The owning module
/// removes this subtree when its authenticated scope or permission changes.
class OfflineStoredItems extends StatefulWidget {
  const OfflineStoredItems({
    required this.store,
    required this.userId,
    required this.workspaceId,
    required this.namespace,
    required this.revision,
    this.loadItems,
    this.triggerBuilder,
    super.key,
  });

  final CacheStore store;
  final String userId;
  final String workspaceId;
  final String namespace;
  final Object revision;

  /// Injectable scoped local source; production reads the encrypted store.
  final Future<List<ReplicaEntityRecord>> Function()? loadItems;

  /// Row that opens the browser; defaults to a "Browse stored items" tile.
  final Widget Function(BuildContext context, VoidCallback open)?
  triggerBuilder;

  @override
  State<OfflineStoredItems> createState() => _OfflineStoredItemsState();
}

class _OfflineStoredItemsState extends State<OfflineStoredItems> {
  late final ValueNotifier<OfflineStoredItems> _config = ValueNotifier(widget);
  ModalRoute<dynamic>? _route;

  void _close() {
    final route = _route;
    _route = null;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (route?.isActive ?? false) route!.navigator?.removeRoute(route);
    });
  }

  @override
  void didUpdateWidget(OfflineStoredItems oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.userId != widget.userId ||
        oldWidget.workspaceId != widget.workspaceId ||
        oldWidget.namespace != widget.namespace ||
        oldWidget.store != widget.store) {
      _close();
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _config.value = widget;
    });
  }

  @override
  void dispose() {
    _close();
    _config.dispose();
    super.dispose();
  }

  Future<void> _open() async {
    await showAppSheet<void>(
      context: context,
      size: AppSheetSize.large,
      builder: (context) {
        _route = ModalRoute.of(context);
        return ValueListenableBuilder(
          valueListenable: _config,
          builder: (_, config, _) => _OfflineStoredItemsBrowser(config: config),
        );
      },
    );
    _route = null;
  }

  @override
  Widget build(BuildContext context) =>
      widget.triggerBuilder?.call(context, () => unawaited(_open())) ??
      AppListTile(
        title: Text(context.l10n.offlineBrowseStoredItems),
        trailing: const Icon(LucideIcons.chevronRight),
        onTap: _open,
      );
}

class _OfflineStoredItemsBrowser extends StatefulWidget {
  const _OfflineStoredItemsBrowser({required this.config});
  final OfflineStoredItems config;

  @override
  State<_OfflineStoredItemsBrowser> createState() =>
      _OfflineStoredItemsBrowserState();
}

class _OfflineStoredItemsBrowserState
    extends State<_OfflineStoredItemsBrowser> {
  List<_StoredItem>? _items;
  String _query = '';
  final _searchController = TextEditingController();
  final _expandedIds = <String>{};
  bool _failed = false;

  int _generation = 0;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void didUpdateWidget(_OfflineStoredItemsBrowser oldWidget) {
    super.didUpdateWidget(oldWidget);
    final scopeChanged =
        oldWidget.config.userId != widget.config.userId ||
        oldWidget.config.workspaceId != widget.config.workspaceId ||
        oldWidget.config.namespace != widget.config.namespace ||
        oldWidget.config.store != widget.config.store;
    if (scopeChanged) {
      _items = null;
      _query = '';
      _searchController.clear();
      _expandedIds.clear();
    }
    if (scopeChanged || oldWidget.config.revision != widget.config.revision) {
      _items = null;
      _generation++;
      unawaited(_load());
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final generation = ++_generation;
    setState(() => _failed = false);
    try {
      // Complete search requires every scoped row. queryReplica's limit is
      // applied after its scan, so it cannot bound I/O and would hide matches.
      // Read once per content revision and index labels once; render lazily.
      final items =
          await (widget.config.loadItems?.call() ??
              widget.config.store.queryReplica(
                userId: widget.config.userId,
                workspaceId: widget.config.workspaceId,
                namespace: widget.config.namespace,
              ));
      if (!mounted || generation != _generation) return;
      setState(() => _items = items.map(_StoredItem.new).toList());
    } on Object {
      if (mounted && generation == _generation) {
        setState(() => _failed = true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final items = _items
        ?.where((item) => item.searchText.contains(_query))
        .toList();
    return AppSheetScaffold(
      title: widget.config.namespace,
      search: AppSheetSearch(
        controller: _searchController,
        hint: l10n.offlineSearchItems,
        onChanged: (value) =>
            setState(() => _query = value.toLowerCase().trim()),
      ),
      slivers: [
        if (_failed)
          SliverToBoxAdapter(
            child: Column(
              children: [
                Text(l10n.offlineInventoryError),
                AppButton.ghost(
                  onPressed: _load,
                  child: Text(l10n.commonRetry),
                ),
              ],
            ),
          )
        else if (items == null)
          const SliverToBoxAdapter(child: LinearProgressIndicator())
        else if (items.isEmpty)
          SliverToBoxAdapter(child: Text(l10n.offlineNoMatchingItems))
        else
          SliverList.builder(
            key: ValueKey(('offline-item-list', widget.config.namespace)),
            itemCount: items.length,
            itemBuilder: (context, index) => _itemTile(items[index]),
          ),
      ],
    );
  }

  Widget _itemTile(_StoredItem item) {
    final l10n = context.l10n;
    final expanded = _expandedIds.contains(item.record.id);
    if (expanded && item.bytes == null) {
      item.bytes = utf8.encode(jsonEncode(item.record.payload)).length;
    }
    return AppDisclosure(
      key: ValueKey(('offline-stored-item', item.record.id)),
      initiallyExpanded: expanded,
      title: Text(item.label),
      onExpansionChanged: (expanded) {
        setState(() {
          if (expanded) {
            _expandedIds.add(item.record.id);
          } else {
            _expandedIds.remove(item.record.id);
          }
        });
      },
      childrenPadding: const EdgeInsets.all(16),
      expandedCrossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (item.bytes != null) ...[
          Text(l10n.offlineStoredItemId(item.record.id)),
          Text(l10n.offlineLogicalBytes('${item.bytes}')),
          Text(
            l10n.offlineLastFetch(
              DateFormat.yMd(
                Localizations.localeOf(context).toString(),
              ).add_jm().format(item.record.fetchedAt.toLocal()),
            ),
          ),
        ],
      ],
    );
  }
}

class _StoredItem {
  _StoredItem(this.record) {
    var resolvedLabel = record.id;
    for (final key in ['name', 'title', 'summary', 'display_name']) {
      final value = record.payload[key];
      if (value is String && value.trim().isNotEmpty) {
        resolvedLabel = value.trim();
        break;
      }
    }
    label = resolvedLabel;
    searchText = '${label.toLowerCase()}\n${record.id.toLowerCase()}';
  }

  final ReplicaEntityRecord record;
  late final String searchText;
  late final String label;
  int? bytes;
}
