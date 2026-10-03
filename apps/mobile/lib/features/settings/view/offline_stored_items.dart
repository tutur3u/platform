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
    super.key,
  });

  final CacheStore store;
  final String userId;
  final String workspaceId;
  final String namespace;
  final Object revision;

  @override
  State<OfflineStoredItems> createState() => _OfflineStoredItemsState();
}

class _OfflineStoredItemsState extends State<OfflineStoredItems> {
  List<ReplicaEntityRecord>? _items;
  String _query = '';
  bool _failed = false;
  bool _expanded = false;
  int _generation = 0;

  @override
  void didUpdateWidget(OfflineStoredItems oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.userId != widget.userId ||
        oldWidget.workspaceId != widget.workspaceId ||
        oldWidget.namespace != widget.namespace ||
        oldWidget.revision != widget.revision) {
      _items = null;
      _query = '';
      _generation++;
      if (_expanded) unawaited(_load());
    }
  }

  Future<void> _load() async {
    final generation = ++_generation;
    setState(() => _failed = false);
    try {
      final items = await widget.store.queryReplica(
        userId: widget.userId,
        workspaceId: widget.workspaceId,
        namespace: widget.namespace,
      );
      if (!mounted || generation != _generation) return;
      setState(() => _items = items);
    } on Object {
      if (mounted && generation == _generation) {
        setState(() => _failed = true);
      }
    }
  }

  String _label(ReplicaEntityRecord item) {
    for (final key in ['name', 'title', 'summary', 'display_name']) {
      final value = item.payload[key];
      if (value is String && value.trim().isNotEmpty) return value.trim();
    }
    return item.id;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final items = _items?.where((item) {
      return _label(item).toLowerCase().contains(_query) ||
          item.id.toLowerCase().contains(_query);
    }).toList();
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
          if (items.isEmpty) Text(l10n.offlineNoMatchingItems),
          for (final item in items)
            ExpansionTile(
              key: ValueKey(('offline-stored-item', item.id)),
              title: Text(_label(item)),
              childrenPadding: const EdgeInsets.all(16),
              expandedCrossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l10n.offlineStoredItemId(item.id)),
                Text(
                  l10n.offlineLogicalBytes(
                    '${utf8.encode(jsonEncode(item.payload)).length}',
                  ),
                ),
                Text(
                  l10n.offlineLastFetch(
                    DateFormat.yMd(
                      Localizations.localeOf(context).toString(),
                    ).add_jm().format(item.fetchedAt.toLocal()),
                  ),
                ),
              ],
            ),
        ],
      ],
    );
  }
}
