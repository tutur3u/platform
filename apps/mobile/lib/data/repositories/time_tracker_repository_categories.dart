part of 'time_tracker_repository.dart';

extension _TimeTrackerRepositoryCategories on TimeTrackerRepository {
  String _categoriesPath(String wsId) =>
      '/api/v1/workspaces/$wsId/time-tracking/categories';

  Future<List<TimeTrackingCategory>> _getCategories(String wsId) async {
    final path = _categoriesPath(wsId);
    final data = await _read(wsId, path);
    final rows = overlayPendingCollection(
      workspaceId: wsId,
      feature: 'time_tracker',
      pathContains: path,
      source: (data['categories'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .toList(growable: false),
      pending: await OfflineMutationQueue.instance.listPending(),
      normalizeCreate: (payload) => {...payload, 'ws_id': wsId},
    );
    return rows.map(TimeTrackingCategory.fromJson).toList(growable: false);
  }

  Future<TimeTrackingCategory> _createCategory(
    String wsId,
    String name, {
    String? color,
    String? description,
  }) async {
    final path = _categoriesPath(wsId);
    final body = <String, dynamic>{
      'name': name,
      if (color != null) 'color': color,
      if (description != null) 'description': description,
    };
    return await queueOrSendValue<TimeTrackingCategory>(
      feature: 'time_tracker',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: body,
      pendingValue: (localId) => TimeTrackingCategory(
        id: localId,
        wsId: wsId,
        name: name,
        color: color,
        description: description,
      ),
      send: () async {
        final response = await _api.postJson(path, body);
        return TimeTrackingCategory.fromJson(
          response['category'] as Map<String, dynamic>,
        );
      },
    );
  }
}
