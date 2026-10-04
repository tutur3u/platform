import 'package:mobile/core/cache/replica_entity_record.dart';

// Only API collection envelopes are indexed. Metadata/relations nested inside
// an entity remain part of that entity, never independent rows in its domain.
Iterable<Map<String, dynamic>> extractReplicaRows(
  String namespace,
  Object? value,
) sync* {
  if (value is List) {
    for (final row in value.take(1000)) {
      if (row is Map) {
        final id = row['id'] ?? row['auditRecordId'];
        if (id is String) yield {...Map<String, dynamic>.from(row), 'id': id};
      }
    }
    return;
  }
  if (value is! Map) return;
  final id = value['id'] ?? value['auditRecordId'];
  if (id is String) {
    yield {...Map<String, dynamic>.from(value), 'id': id};
    return;
  }
  final wrappers = <String>{'data', 'items', 'rows'};
  if (namespace.startsWith('tasks.')) {
    wrappers.addAll({
      'tasks',
      'task',
      'boards',
      'lists',
      'members',
      'labels',
      'projects',
      'initiatives',
    });
  } else if (namespace.startsWith('finance.')) {
    wrappers.addAll({
      'transactions',
      'transaction',
      'wallets',
      'wallet',
      'categories',
      'tags',
    });
  } else if (namespace.startsWith('calendar.')) {
    wrappers.addAll({'events', 'event', 'connections'});
  } else if (namespace.startsWith('inventory.')) {
    wrappers.addAll({
      'products',
      'product',
      'invoice',
      'sales',
      'warehouses',
      'categories',
      'units',
      'manufacturers',
      'owners',
      'periods',
      'logs',
    });
  } else if (namespace.startsWith('notes.')) {
    wrappers.addAll({'notes', 'note'});
  } else if (namespace.startsWith('mail.')) {
    wrappers.addAll({'messages', 'message', 'threads', 'accounts'});
  } else if (namespace.startsWith('meet.')) {
    wrappers.addAll({'meetings', 'meeting', 'rooms'});
  }
  for (final wrapper in wrappers) {
    final nested = value[wrapper];
    if (nested is List || nested is Map) {
      yield* extractReplicaRows(namespace, nested);
    }
  }
}

// Sparse autocomplete/summary rows cannot replace domain detail fields. Among
// equally authoritative rows, newer explicit values (including null) win.
int _replicaAuthority(ReplicaEntityRecord row) {
  final payload = row.payload;
  if (const {
    'inventory.product',
    'inventory.sale-detail',
    'tasks.detail',
    'finance.transactionDetail',
    'finance.walletDetail',
    'calendar.event.detail',
  }.contains(row.namespace)) {
    return 2;
  }
  if (row.namespace.startsWith('inventory.')) {
    return payload.containsKey('inventory') ||
            payload.containsKey('invoice_products')
        ? 1
        : 0;
  }
  if (row.namespace.startsWith('tasks.')) {
    return payload.containsKey('description') && payload.containsKey('list_id')
        ? 1
        : 0;
  }
  if (row.namespace.startsWith('finance.')) {
    return payload.containsKey('amount') && payload.containsKey('wallet_id')
        ? 1
        : 0;
  }
  if (row.namespace.startsWith('calendar.')) {
    return payload.containsKey('start_at') && payload.containsKey('end_at')
        ? 1
        : 0;
  }
  return 0;
}

ReplicaEntityRecord mergeReplicaRows(
  ReplicaEntityRecord previous,
  ReplicaEntityRecord next,
) {
  final sources = <String, ReplicaEntityRecord>{};
  for (final aggregate in [previous, next]) {
    for (final row
        in aggregate.mergeSources.isEmpty
            ? [aggregate]
            : aggregate.mergeSources) {
      final identity = '${row.namespace}:${row.sourceKey}';
      final old = sources[identity];
      if (old == null || row.fetchedAt.isAfter(old.fetchedAt)) {
        sources[identity] = row;
      }
    }
  }
  final ordered = sources.values.toList()..sort(_compareReplicaAuthority);
  final payload = <String, dynamic>{};
  final fields = {for (final row in ordered) ...row.payload.keys};
  for (final field in fields) {
    final clears = [
      for (final row in ordered)
        if (row.payload.containsKey(field) && row.payload[field] == null)
          (time: row.fetchedAt, rank: _replicaAuthority(row)),
    ];
    ReplicaEntityRecord? selected;
    for (final row in ordered) {
      if (!row.payload.containsKey(field) ||
          row.payload[field] == null ||
          clears.any(
            (clear) =>
                !row.fetchedAt.isAfter(clear.time) ||
                _replicaAuthority(row) < clear.rank,
          )) {
        continue;
      }
      // Authority is considered only among values not superseded by a clear.
      selected = row;
    }
    payload[field] = selected?.payload[field];
  }
  final winner = ordered.last;
  final latest = ordered
      .map((row) => row.fetchedAt)
      .reduce((a, b) => a.isAfter(b) ? a : b);
  return ReplicaEntityRecord(
    id: winner.id,
    namespace: winner.namespace,
    sourceKey: winner.sourceKey,
    payload: payload,
    fetchedAt: latest,
    userId: winner.userId,
    workspaceId: winner.workspaceId,
    pendingStatus: winner.pendingStatus,
    mergeSources: List.unmodifiable(ordered),
  );
}

int _compareReplicaAuthority(ReplicaEntityRecord a, ReplicaEntityRecord b) {
  final rank = _replicaAuthority(a).compareTo(_replicaAuthority(b));
  if (rank != 0) return rank;
  final time = a.fetchedAt.compareTo(b.fetchedAt);
  if (time != 0) return time;
  return '${a.namespace}:${a.sourceKey}'.compareTo(
    '${b.namespace}:${b.sourceKey}',
  );
}
