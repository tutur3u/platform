part of 'task_repository.dart';

extension _TaskRepositoryLocal on TaskRepository {
  bool _boardFlag(Map<String, dynamic> row, String name) =>
      row[name] is bool ? row[name] == true : row['${name}_at'] != null;
  Future<Map<String, dynamic>> _readTaskResource(
    String wsId,
    String namespace,
    String path,
  ) async {
    final key = CacheKey(
      namespace: 'tasks.$namespace',
      userId: currentCacheUserId(),
      workspaceId: wsId,
      params: {'path': path},
    );
    final cached = await CacheStore.instance.read<Object?>(
      key: key,
      decode: (value) => value,
    );
    if (!cached.hasValue) {
      final local = await _localTaskResource(wsId, path);
      if (local != null) {
        unawaited(
          ApiClient.offlinePreparation(
            () => readThroughJson(
              api: _apiClient,
              namespace: 'tasks.$namespace',
              workspaceId: wsId,
              path: path,
              forceRefresh: true,
            ),
            allowChallenge: false,
          ).then<void>((_) {}, onError: (Object _) {}),
        );
        return local;
      }
    }
    try {
      return await readThroughJson(
        api: _apiClient,
        namespace: 'tasks.$namespace',
        workspaceId: wsId,
        path: path,
      );
    } on Object catch (error) {
      if (!isOfflineTransportFailure(error)) {
        rethrow;
      }
      final local = await _localTaskResource(wsId, path);
      if (local == null) {
        rethrow;
      }
      return local;
    }
  }

  Future<Map<String, dynamic>?> _localTaskResource(
    String wsId,
    String path,
  ) async {
    final uri = Uri.parse(path);
    if (uri.path == '/api/v1/workspaces/$wsId/task-boards') {
      return await _localBoardList(wsId, uri);
    }
    final base = '/api/v1/workspaces/$wsId/tasks';
    if (uri.queryParameters['forTimeTracking'] == 'true') return null;
    if (uri.path != base && !uri.path.startsWith('$base/')) {
      return null;
    }
    final rows = await queryLocalRows(
      store: CacheStore.instance,
      userId: currentCacheUserId(),
      workspaceId: wsId,
      namespaces: const [
        'tasks.boardTasks',
        'tasks.deletedTasks',
        'tasks.detail',
      ],
    );
    if (rows.isEmpty &&
        !(await OfflineMutationQueue.instance.listPending()).any(
          (item) =>
              item.workspaceId == wsId &&
              item.feature == 'tasks' &&
              item.path == base,
        )) {
      return null;
    }
    final projected = await _overlayTaskRows(
      wsId,
      rows,
      deletedOnly: uri.queryParameters['includeDeleted'] == 'only',
    );
    if (uri.path != base) {
      final id = uri.path.substring(base.length + 1);
      if (id.contains('/')) {
        return null;
      }
      for (final row in projected) {
        if (row['id'] == id) {
          return {'task': row};
        }
      }
      return {'task': null};
    }
    final listId = uri.queryParameters['listId'];
    final boardId = uri.queryParameters['boardId'];
    final search = uri.queryParameters['q']?.trim().toLowerCase();
    final assigned = uri.queryParameters['assignedToMe'] == 'true';
    final currentUserId = currentCacheUserId();
    final matching = projected
        .where(
          (row) =>
              (search == null ||
                  (row['name'] as String? ?? '').toLowerCase().contains(
                    search,
                  )) &&
              (!assigned ||
                  row['assignee_ids'] is List &&
                      (row['assignee_ids'] as List).contains(currentUserId) ||
                  row['assignees'] is List &&
                      (row['assignees'] as List).any(
                        (assignee) =>
                            assignee is Map && assignee['id'] == currentUserId,
                      )) &&
              (listId == null || row['list_id'] == listId) &&
              (boardId == null ||
                  row['board_id'] == boardId ||
                  row['list'] is Map &&
                      (row['list'] as Map)['board'] is Map &&
                      ((row['list'] as Map)['board'] as Map)['id'] == boardId),
        )
        .toList(growable: false);
    final offset = int.tryParse(uri.queryParameters['offset'] ?? '') ?? 0;
    final limit =
        int.tryParse(uri.queryParameters['limit'] ?? '') ?? matching.length;
    return {
      'tasks': matching.skip(offset).take(limit).toList(),
      'count': matching.length,
    };
  }

  Future<Map<String, dynamic>?> _localBoardList(String wsId, Uri uri) async {
    final rows = await queryLocalRows(
      store: CacheStore.instance,
      userId: currentCacheUserId(),
      workspaceId: wsId,
      namespaces: const ['tasks.boards'],
    );
    final base = '/api/v1/workspaces/$wsId/task-boards';
    final pending = await OfflineMutationQueue.instance.listPending();
    if (rows.isEmpty &&
        !pending.any(
          (item) =>
              item.workspaceId == wsId &&
              item.userId == currentCacheUserId() &&
              item.path == base &&
              item.method == 'POST',
        )) {
      return null;
    }
    final source = overlayPendingCollection(
      workspaceId: wsId,
      feature: 'tasks',
      pathContains: base,
      source: rows,
      pending: pending
          .where(
            (item) =>
                item.path == base || item.path == '$base/${item.entityId}',
          )
          .toList(),
      normalizeCreate: (payload) => {...payload, 'ws_id': wsId},
    );
    final status = uri.queryParameters['status'] ?? 'all';
    final filtered = source
        .where(
          (row) => switch (status) {
            'active' =>
              !_boardFlag(row, 'archived') && !_boardFlag(row, 'deleted'),
            'archived' =>
              _boardFlag(row, 'archived') && !_boardFlag(row, 'deleted'),
            'deleted' => _boardFlag(row, 'deleted'),
            _ => true,
          },
        )
        .toList();
    final page = int.tryParse(uri.queryParameters['page'] ?? '') ?? 1;
    final size = int.tryParse(uri.queryParameters['pageSize'] ?? '') ?? 20;
    return {
      'boards': filtered.skip((page - 1) * size).take(size).toList(),
      'count': filtered.length,
    };
  }
}
