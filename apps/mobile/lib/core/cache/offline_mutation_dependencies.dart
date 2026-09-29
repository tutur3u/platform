part of 'offline_mutation_queue.dart';

/// Finds structured references to a local ID. The task image marker is the
/// only supported reference embedded in user-authored text.
bool referencesPendingEntity(
  String path,
  Map<String, dynamic>? payload,
  String? entityId,
) {
  if (entityId == null || entityId.isEmpty) return false;
  final uri = Uri.tryParse(path);
  if (uri != null &&
      (uri.pathSegments.contains(entityId) ||
          uri.queryParameters.values.contains(entityId))) {
    return true;
  }

  bool visit(Object? value, {String? field}) {
    if (value is String) {
      return value == entityId ||
          field == 'description' &&
              entityId.startsWith('offline-task-image-') &&
              value.contains(entityId);
    }
    if (value is List) {
      return value.any(visit);
    }
    if (value is Map) {
      return value.entries.any(
        (entry) => visit(entry.value, field: entry.key.toString()),
      );
    }
    return false;
  }

  return visit(payload);
}
