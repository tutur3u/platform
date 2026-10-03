import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/replica_entity_record.dart';
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
    super.key,
  });

  final CacheStore store;
  final String userId;
  final String workspaceId;
  final String namespace;
  final Object revision;

  /// Injectable scoped local source; production reads the encrypted store.
  final Future<List<ReplicaEntityRecord>> Function()? loadItems;

  @override
  State<OfflineStoredItems> createState() => _OfflineStoredItemsState();
}

class _OfflineStoredItemsState extends State<OfflineStoredItems> {
  List<_StoredItem>? _items;
  String _query = '';
  final _expandedIds = <String>{};
  bool _failed = false;
  bool _expanded = false;
  int _generation = 0;

  @override
  void didUpdateWidget(OfflineStoredItems oldWidget) {
    super.didUpdateWidget(oldWidget);
    final scopeChanged =
        oldWidget.userId != widget.userId ||
        oldWidget.workspaceId != widget.workspaceId ||
        oldWidget.namespace != widget.namespace ||
        oldWidget.store != widget.store;
    if (scopeChanged) {
      _items = null;
      _query = '';
      _expandedIds.clear();
    }
    if (scopeChanged || oldWidget.revision != widget.revision) {
      _generation++;
      if (_expanded) unawaited(_load());
    }
  }

  Future<void> _load() async {
    final generation = ++_generation;
    setState(() => _failed = false);
    try {
      // Complete search requires every scoped row. queryReplica's limit is
      // applied after its scan, so it cannot bound I/O and would hide matches.
      // Read once per content revision and index labels once; render lazily.
      final items =
          await (widget.loadItems?.call() ??
              widget.store.queryReplica(
                userId: widget.userId,
                workspaceId: widget.workspaceId,
                namespace: widget.namespace,
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
    return ExpansionTile(
      key: ValueKey(('offline-stored-items', widget.namespace)),
      title: Text(l10n.offlineBrowseStoredItems),
      onExpansionChanged: (expanded) {
        _expanded = expanded;
        if (expanded && _items == null) unawaited(_load());
      },
      children: [
        if (_failed) ...[
          Text(l10n.offlineInventoryError),
          TextButton(onPressed: _load, child: Text(l10n.commonRetry)),
        ] else if (items == null)
          const LinearProgressIndicator()
        else ...[
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TextField(
              key: ValueKey(('offline-item-search', widget.namespace)),
              decoration: InputDecoration(hintText: l10n.offlineSearchItems),
              onChanged: (value) =>
                  setState(() => _query = value.toLowerCase().trim()),
            ),
          ),
          if (items.isEmpty)
            Text(l10n.offlineNoMatchingItems)
          else
            SizedBox(
              height: 320,
              child: ListView.builder(
                key: ValueKey(('offline-item-list', widget.namespace)),
                primary: false,
                itemCount: items.length,
                itemBuilder: (context, index) => _itemTile(items[index]),
              ),
            ),
        ],
      ],
    );
  }

  Widget _itemTile(_StoredItem item) {
    final l10n = context.l10n;
    final expanded = _expandedIds.contains(item.record.id);
    if (expanded && item.bytes == null) {
      item.bytes = utf8.encode(jsonEncode(item.record.payload)).length;
    }
    return ExpansionTile(
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
