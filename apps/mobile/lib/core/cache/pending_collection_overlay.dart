import 'package:mobile/core/cache/pending_mutation_record.dart';

/// Materializes queued CRUD edits over a list response without changing the
/// server snapshot. The caller owns query matching and any endpoint-specific
/// payload normalization.
List<Map<String, dynamic>> overlayPendingCollection({
  required String workspaceId,
  required String feature,
  required String pathContains,
  required List<Map<String, dynamic>> source,
  required List<PendingMutationRecord> pending,
  Map<String, dynamic> Function(Map<String, dynamic>)? normalizeCreate,
  Map<String, dynamic> Function(Map<String, dynamic>)? normalizeUpdate,
  bool Function(Map<String, dynamic>)? matchesQuery,
  bool includeCreates = true,
}) {
  final rows = <String, Map<String, dynamic>>{
    for (final row in source)
      if (row['id'] is String)
        row['id'] as String: Map<String, dynamic>.from(row),
  };
  for (final mutation in pending) {
    if (mutation.feature != feature ||
        mutation.workspaceId != workspaceId ||
        !mutation.path.contains(pathContains)) {
      continue;
    }
    final id = mutation.entityId;
    if (id == null) continue;
    if (mutation.method == 'DELETE') {
      rows.remove(id);
      continue;
    }
    if (mutation.method == 'POST' && !includeCreates) continue;
    final payload = mutation.payload;
    if (payload == null) continue;
    if (mutation.method != 'POST' && !rows.containsKey(id)) continue;
    final normalized = switch (mutation.method) {
      'POST' when normalizeCreate != null => normalizeCreate(payload),
      'PUT' || 'PATCH' when normalizeUpdate != null => normalizeUpdate(payload),
      _ => payload,
    };
    final next = <String, dynamic>{...?rows[id], ...normalized, 'id': id};
    if (matchesQuery != null && !matchesQuery(next)) {
      rows.remove(id);
    } else {
      rows[id] = next;
    }
  }
  return rows.values.toList(growable: false);
}
