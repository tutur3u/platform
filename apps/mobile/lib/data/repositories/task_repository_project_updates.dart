part of 'task_repository.dart';

extension _TaskRepositoryProjectUpdates on TaskRepository {
  Future<List<TaskProjectUpdate>> _getTaskProjectUpdates({
    required String wsId,
    required String projectId,
    int limit = 50,
    int offset = 0,
  }) async {
    final path = '/api/v1/workspaces/$wsId/task-projects/$projectId/updates';
    final response = await _read(
      wsId,
      'projectUpdates',
      '$path?limit=$limit&offset=$offset',
    );
    final updates = overlayPendingCollection(
      workspaceId: wsId,
      feature: 'tasks',
      pathContains: path,
      source: (response['updates'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .toList(),
      pending: (await OfflineMutationQueue.instance.listPending())
          .where(
            (item) =>
                item.path == path ||
                item.path.startsWith('$path/') &&
                    !item.path.substring(path.length + 1).contains('/'),
          )
          .toList(),
      normalizeCreate: (payload) => {
        ...payload,
        'project_id': projectId,
        'creator_id': currentCacheUserId() ?? '',
        'created_at': DateTime.now().toUtc().toIso8601String(),
      },
      includeCreates: offset == 0,
    );
    return updates.map(TaskProjectUpdate.fromJson).toList(growable: false);
  }

  Future<TaskProjectUpdate> _createTaskProjectUpdate({
    required String wsId,
    required String projectId,
    required String content,
  }) async {
    final path = '/api/v1/workspaces/$wsId/task-projects/$projectId/updates';
    final payload = {'content': content};
    return await queueOrSendValue<TaskProjectUpdate>(
      feature: 'tasks',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      pendingValue: (id) => TaskProjectUpdate(
        id: id,
        projectId: projectId,
        creatorId: currentCacheUserId() ?? '',
        content: content,
        createdAt: DateTime.now(),
      ),
      send: () async =>
          TaskProjectUpdate.fromJson(await _apiClient.postJson(path, payload)),
    );
  }

  Future<TaskProjectUpdate> _updateTaskProjectUpdate({
    required String wsId,
    required String projectId,
    required String updateId,
    required String content,
  }) async {
    final path =
        '/api/v1/workspaces/$wsId/task-projects/$projectId/updates/$updateId';
    final payload = {'content': content};
    return await queueOrSendValue<TaskProjectUpdate>(
      feature: 'tasks',
      method: 'PATCH',
      path: path,
      workspaceId: wsId,
      entityId: updateId,
      payload: payload,
      pendingValue: (_) => TaskProjectUpdate(
        id: updateId,
        projectId: projectId,
        creatorId: currentCacheUserId() ?? '',
        content: content,
        createdAt: DateTime.now(),
      ),
      send: () async =>
          TaskProjectUpdate.fromJson(await _apiClient.patchJson(path, payload)),
    );
  }

  Future<void> _deleteTaskProjectUpdate({
    required String wsId,
    required String projectId,
    required String updateId,
  }) async {
    final path =
        '/api/v1/workspaces/$wsId/task-projects/$projectId/updates/$updateId';
    await queueOrSendVoid(
      feature: 'tasks',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: updateId,
      send: () async {
        await _apiClient.deleteJson(path);
      },
    );
  }
}
