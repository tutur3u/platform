part of 'task_repository.dart';

extension TaskRepositoryOfflinePreparation on TaskRepository {
  /// Await accessible task data; fail if pagination does not finish.
  Future<void> prepareOffline(
    String wsId, {
    String? Function()? cacheUserId,
  }) async {
    final owner = cacheUserId ?? currentCacheUserId;
    final userId = owner();
    if (userId == null) {
      throw StateError('Sign in before preparing offline data.');
    }
    final manifest = OfflineDownloadManifest(
      CacheStore.instance,
      userId,
      owner,
    );
    Future<Map<String, dynamic>> read(String namespace, String path) async {
      if (owner() != userId) {
        throw StateError('Account changed during offline preparation.');
      }
      final response = await readThroughJson(
        api: _apiClient,
        namespace: 'tasks.$namespace',
        workspaceId: wsId,
        path: path,
        forceRefresh: true,
        policy: CachePolicies.offlineCatalog,
        cacheUserId: owner,
      );
      await manifest.save(
        CacheKey(
          namespace: 'tasks.$namespace',
          userId: userId,
          workspaceId: wsId,
          params: {'path': path},
        ),
        response,
      );
      return response;
    }

    Future<List<Map<String, dynamic>>> pages(
      String namespace,
      String path,
      String field, {
      int pageSize = 200,
    }) async {
      final rows = <Map<String, dynamic>>[];
      for (var page = 0; page < 1000; page++) {
        final separator = path.contains('?') ? '&' : '?';
        final result = await read(
          namespace,
          '$path${separator}limit=$pageSize&offset=${page * pageSize}',
        );
        if (result[field] is! List) {
          throw FormatException(
            'Missing $field in offline preparation response.',
          );
        }
        final batch = (result[field] as List<dynamic>)
            .whereType<Map<String, dynamic>>()
            .toList();
        rows.addAll(batch);
        if (batch.length < pageSize) {
          return rows;
        }
      }
      throw StateError('Task offline preparation pagination limit exceeded.');
    }

    final base = '/api/v1/workspaces/$wsId';
    await read('workspaceMembers', '$base/members');
    await read('estimation', '$base/boards/estimation');
    final projects = <Map<String, dynamic>>[];
    for (final entry in {
      'labels': 'labels',
      'projects': 'task-projects',
      'initiatives': 'task-initiatives',
    }.entries) {
      final rows = await readThroughJsonList(
        api: _apiClient,
        namespace: 'tasks.${entry.key}',
        workspaceId: wsId,
        path: '$base/${entry.value}',
        forceRefresh: true,
        policy: CachePolicies.offlineCatalog,
        cacheUserId: owner,
      );
      await manifest.save(
        CacheKey(
          namespace: 'tasks.${entry.key}',
          userId: userId,
          workspaceId: wsId,
          params: {'path': '$base/${entry.value}'},
        ),
        rows,
      );
      if (entry.key == 'projects') {
        projects.addAll(rows.whereType<Map<String, dynamic>>());
      }
    }
    for (final project in projects) {
      await pages(
        'projectUpdates',
        '$base/task-projects/${project['id']}/updates',
        'updates',
        pageSize: 50,
      );
    }
    final boards = <Map<String, dynamic>>[];
    for (var page = 1; page <= 1000; page++) {
      final result = await read(
        'boards',
        '$base/task-boards?page=$page&pageSize=200&status=all',
      );
      if (result['boards'] is! List) {
        throw const FormatException(
          'Missing boards in offline preparation response.',
        );
      }
      final batch = (result['boards'] as List<dynamic>)
          .whereType<Map<String, dynamic>>()
          .toList();
      boards.addAll(batch);
      if (page * 200 >= ((result['count'] as num?)?.toInt() ?? boards.length) ||
          batch.length < 200) {
        break;
      }
      if (page == 1000) {
        throw StateError(
          'Task board offline preparation pagination limit exceeded.',
        );
      }
    }
    await read('boards', '$base/task-boards?page=1&pageSize=20&status=all');
    for (final board in boards) {
      final id = board['id'] as String;
      await read('boardDetail', '$base/task-boards/$id');
      await read('boardLists', '$base/task-boards/$id/lists');
      await pages(
        'deletedTasks',
        '$base/tasks?boardId=$id&includeDeleted=only',
        'tasks',
      );
    }
    final tasks = await pages('boardTasks', '$base/tasks', 'tasks');
    for (final task in tasks) {
      final id = task['id'] as String;
      await read('detail', '$base/tasks/$id');
      await read('relationships', '$base/tasks/$id/relationships');
    }
    for (final personal in [false, true]) {
      for (var page = 0; page < 1000; page++) {
        final query = _encodeQueryParameters({
          'wsId': wsId,
          'isPersonal': '$personal',
          'completedPage': '$page',
          'completedLimit': '20',
        });
        final response = await read('mine', '/api/v1/users/me/tasks?$query');
        if (response['completed'] is! List ||
            response['hasMoreCompleted'] is! bool) {
          throw const FormatException(
            'Missing completed tasks in offline preparation response.',
          );
        }
        if (response['hasMoreCompleted'] != true) {
          break;
        }
        if (page == 999) {
          throw StateError(
            'Completed task offline preparation pagination limit exceeded.',
          );
        }
      }
    }
    await pages(
      'timeLinkOptions',
      '$base/tasks?forTimeTracking=true&includeCount=true&assignedToMe=true',
      'tasks',
    );
    await manifest.verify();
    manifest.retain('tasks', wsId);
  }
}
