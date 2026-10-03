import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/replica_entity_record.dart';

/// Merge visited pages/details by stable ID, retaining the latest scoped row.
Future<List<Map<String, dynamic>>> queryLocalRows({
  required CacheStore store,
  required String? userId,
  required String workspaceId,
  required List<String> namespaces,
}) async {
  if (userId == null) return const [];
  final rows = <String, ReplicaEntityRecord>{};
  for (final namespace in namespaces) {
    for (final row in await store.queryReplica(
      namespace: namespace,
      userId: userId,
      workspaceId: workspaceId,
    )) {
      final previous = rows[row.id];
      if (previous == null || row.fetchedAt.isAfter(previous.fetchedAt)) {
        rows[row.id] = row;
      }
    }
  }
  return rows.values.map((row) => row.payload).toList();
}
