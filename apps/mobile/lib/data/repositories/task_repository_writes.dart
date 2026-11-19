part of 'task_repository.dart';

extension _TaskRepositoryWrites on TaskRepository {
  Future<void> _writeTaskVoid(
    String wsId,
    String method,
    String path, {
    Map<String, dynamic>? payload,
    String? entityId,
  }) async {
    await queueOrSendVoid(
      feature: 'tasks',
      method: method,
      path: path,
      workspaceId: wsId,
      payload: payload,
      entityId: entityId,
      send: () async {
        switch (method) {
          case 'POST':
            await _apiClient.postJson(path, payload);
          case 'PUT':
            await _apiClient.putJson(path, payload ?? {});
          case 'PATCH':
            await _apiClient.patchJson(path, payload ?? {});
          case 'DELETE':
            await _apiClient.deleteJson(path, body: payload);
        }
      },
    );
    await CacheStore.instance.invalidateTags({
      'module:tasks',
    }, workspaceId: wsId);
  }
}
