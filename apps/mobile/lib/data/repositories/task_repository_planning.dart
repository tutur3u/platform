part of 'task_repository.dart';

extension _TaskRepositoryPlanning on TaskRepository {
  Future<void> _writePlanningVoid({
    required String wsId,
    required String method,
    required String path,
    required Future<void> Function() send,
    Map<String, dynamic>? payload,
    String? entityId,
  }) async {
    final localId = entityId ?? newLocalMutationId();
    await queueOrSendVoid(
      feature: 'tasks',
      method: method,
      path: path,
      workspaceId: wsId,
      entityId: localId,
      payload: payload,
      send: send,
    );
    final pending = await OfflineMutationQueue.instance.listPending();
    if (!pending.any(
      (item) =>
          item.feature == 'tasks' &&
          item.workspaceId == wsId &&
          item.entityId == localId,
    )) {
      await CacheStore.instance.invalidateTags({
        'module:tasks',
      }, workspaceId: wsId);
    }
  }

  Future<List<TaskLabel>> _getTaskLabels(String wsId) async {
    final path = '/api/v1/workspaces/$wsId/labels';
    final response = await readThroughJsonList(
      api: _apiClient,
      namespace: 'tasks.labels',
      workspaceId: wsId,
      path: path,
    );
    final rows = overlayPendingCollection(
      workspaceId: wsId,
      feature: 'tasks',
      pathContains: path,
      source: response.whereType<Map<String, dynamic>>().toList(),
      pending: await OfflineMutationQueue.instance.listPending(),
      normalizeCreate: (payload) => {...payload, 'ws_id': wsId},
    );
    return rows.map(TaskLabel.fromJson).toList(growable: false);
  }

  Future<TaskLabel> _createTaskLabel({
    required String wsId,
    required String name,
    required String color,
  }) async {
    final normalizedColor = normalizeTaskLabelColor(color);
    if (normalizedColor == null) {
      throw const FormatException('Invalid task label color');
    }

    final path = '/api/v1/workspaces/$wsId/labels';
    final payload = {'name': name, 'color': normalizedColor};
    return await queueOrSendValue<TaskLabel>(
      feature: 'tasks',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      pendingValue: (id) =>
          TaskLabel(id: id, wsId: wsId, name: name, color: normalizedColor),
      send: () async =>
          TaskLabel.fromJson(await _apiClient.postJson(path, payload)),
    );
  }

  Future<TaskLabel> _updateTaskLabel({
    required String wsId,
    required String labelId,
    required String name,
    required String color,
  }) async {
    final normalizedColor = normalizeTaskLabelColor(color);
    if (normalizedColor == null) {
      throw const FormatException('Invalid task label color');
    }

    final path = '/api/v1/workspaces/$wsId/labels/$labelId';
    final payload = {'name': name, 'color': normalizedColor};
    return await queueOrSendValue<TaskLabel>(
      feature: 'tasks',
      method: 'PATCH',
      path: path,
      workspaceId: wsId,
      entityId: labelId,
      payload: payload,
      pendingValue: (_) => TaskLabel(
        id: labelId,
        wsId: wsId,
        name: name,
        color: normalizedColor,
      ),
      send: () async =>
          TaskLabel.fromJson(await _apiClient.patchJson(path, payload)),
    );
  }

  Future<void> _deleteTaskLabel({
    required String wsId,
    required String labelId,
  }) async {
    final path = '/api/v1/workspaces/$wsId/labels/$labelId';
    await queueOrSendVoid(
      feature: 'tasks',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: labelId,
      send: () async {
        await _apiClient.deleteJson(path);
      },
    );
  }

  Future<List<TaskProjectSummary>> _getTaskProjects(String wsId) async {
    final path = '/api/v1/workspaces/$wsId/task-projects';
    final response = await readThroughJsonList(
      api: _apiClient,
      namespace: 'tasks.projects',
      workspaceId: wsId,
      path: path,
    );
    final rows = overlayPendingCollection(
      workspaceId: wsId,
      feature: 'tasks',
      pathContains: path,
      source: response.whereType<Map<String, dynamic>>().toList(),
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
        'ws_id': wsId,
        'created_at': DateTime.now().toUtc().toIso8601String(),
      },
    );
    return rows.map(TaskProjectSummary.fromJson).toList(growable: false);
  }

  Future<void> _createTaskProject({
    required String wsId,
    required String name,
    String? description,
  }) async {
    final path = '/api/v1/workspaces/$wsId/task-projects';
    final payload = <String, dynamic>{
      'name': name,
      if (description != null) 'description': description,
    };
    await _writePlanningVoid(
      wsId: wsId,
      method: 'POST',
      path: path,
      payload: payload,
      send: () async {
        await _apiClient.postJson(path, payload);
      },
    );
  }

  Future<void> _updateTaskProject({
    required String wsId,
    required String projectId,
    required String name,
    String? status,
    String? priority,
    String? healthStatus,
    String? description,
    String? leadId,
    DateTime? startDate,
    DateTime? endDate,
    bool? archived,
  }) async {
    final path = '/api/v1/workspaces/$wsId/task-projects/$projectId';
    final payload = <String, dynamic>{
      'name': name,
      'description': description,
      if (status != null) 'status': status,
      if (priority != null) 'priority': priority,
      'health_status': healthStatus,
      'lead_id': leadId,
      'start_date': startDate?.toUtc().toIso8601String(),
      'end_date': endDate?.toUtc().toIso8601String(),
      'archived': archived,
    };
    await _writePlanningVoid(
      wsId: wsId,
      method: 'PUT',
      path: path,
      entityId: projectId,
      payload: payload,
      send: () async {
        await _apiClient.putJson(path, payload);
      },
    );
  }

  Future<void> _deleteTaskProject({
    required String wsId,
    required String projectId,
  }) async {
    final path = '/api/v1/workspaces/$wsId/task-projects/$projectId';
    await _writePlanningVoid(
      wsId: wsId,
      method: 'DELETE',
      path: path,
      entityId: projectId,
      send: () async {
        await _apiClient.deleteJson(path);
      },
    );
  }

  Future<List<TaskInitiativeSummary>> _getTaskInitiatives(String wsId) async {
    final path = '/api/v1/workspaces/$wsId/task-initiatives';
    final response = await readThroughJsonList(
      api: _apiClient,
      namespace: 'tasks.initiatives',
      workspaceId: wsId,
      path: path,
    );
    final rows = overlayPendingCollection(
      workspaceId: wsId,
      feature: 'tasks',
      pathContains: path,
      source: response.whereType<Map<String, dynamic>>().toList(),
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
        'created_at': DateTime.now().toUtc().toIso8601String(),
      },
    );
    return rows.map(TaskInitiativeSummary.fromJson).toList(growable: false);
  }

  Future<void> _createTaskInitiative({
    required String wsId,
    required String name,
    required String status,
    String? description,
  }) async {
    final path = '/api/v1/workspaces/$wsId/task-initiatives';
    final payload = <String, dynamic>{
      'name': name,
      if (description != null) 'description': description,
      'status': status,
    };
    await _writePlanningVoid(
      wsId: wsId,
      method: 'POST',
      path: path,
      payload: payload,
      send: () async {
        await _apiClient.postJson(path, payload);
      },
    );
  }

  Future<void> _updateTaskInitiative({
    required String wsId,
    required String initiativeId,
    required String name,
    required String status,
    String? description,
  }) async {
    final path = '/api/v1/workspaces/$wsId/task-initiatives/$initiativeId';
    final payload = <String, dynamic>{
      'name': name,
      if (description != null) 'description': description,
      'status': status,
    };
    await _writePlanningVoid(
      wsId: wsId,
      method: 'PUT',
      path: path,
      entityId: initiativeId,
      payload: payload,
      send: () async {
        await _apiClient.putJson(path, payload);
      },
    );
  }

  Future<void> _deleteTaskInitiative({
    required String wsId,
    required String initiativeId,
  }) async {
    final path = '/api/v1/workspaces/$wsId/task-initiatives/$initiativeId';
    await _writePlanningVoid(
      wsId: wsId,
      method: 'DELETE',
      path: path,
      entityId: initiativeId,
      send: () async {
        await _apiClient.deleteJson(path);
      },
    );
  }

  Future<TaskRelationshipsResponse> _getTaskRelationships({
    required String wsId,
    required String taskId,
  }) async {
    final response = await _read(
      wsId,
      'relationships',
      '/api/v1/workspaces/$wsId/tasks/$taskId/relationships',
    );
    return TaskRelationshipsResponse.fromJson(response);
  }

  Future<void> _createTaskRelationship({
    required String wsId,
    required String taskId,
    required String sourceTaskId,
    required String targetTaskId,
    required TaskRelationshipType type,
  }) async {
    final path = '/api/v1/workspaces/$wsId/tasks/$taskId/relationships';
    final payload = {
      'source_task_id': sourceTaskId,
      'target_task_id': targetTaskId,
      'type': type.apiValue,
    };
    await _writePlanningVoid(
      wsId: wsId,
      method: 'POST',
      path: path,
      entityId: taskId,
      payload: payload,
      send: () async {
        await _apiClient.postJson(path, payload);
      },
    );
  }

  Future<void> _deleteTaskRelationship({
    required String wsId,
    required String taskId,
    required String sourceTaskId,
    required String targetTaskId,
    required TaskRelationshipType type,
  }) async {
    final payload = {
      'source_task_id': sourceTaskId,
      'target_task_id': targetTaskId,
      'type': type.apiValue,
    };

    final path = '/api/v1/workspaces/$wsId/tasks/$taskId/relationships';
    await _writePlanningVoid(
      wsId: wsId,
      method: 'DELETE',
      path: path,
      entityId: taskId,
      payload: payload,
      send: () async {
        await _apiClient.deleteJson(path, body: payload);
      },
    );
  }

  Future<void> _linkProjectToInitiative({
    required String wsId,
    required String initiativeId,
    required String projectId,
  }) async {
    final path =
        '/api/v1/workspaces/$wsId/task-initiatives/$initiativeId/projects';
    final payload = {'projectId': projectId};
    await _writePlanningVoid(
      wsId: wsId,
      method: 'POST',
      path: path,
      entityId: initiativeId,
      payload: payload,
      send: () async {
        await _apiClient.postJson(path, payload);
      },
    );
  }

  Future<void> _unlinkProjectFromInitiative({
    required String wsId,
    required String initiativeId,
    required String projectId,
  }) async {
    final path =
        '/api/v1/workspaces/$wsId/task-initiatives/$initiativeId/projects/$projectId';
    await _writePlanningVoid(
      wsId: wsId,
      method: 'DELETE',
      path: path,
      entityId: initiativeId,
      send: () async {
        await _apiClient.deleteJson(path);
      },
    );
  }

  Future<void> _linkTaskToProject({
    required String wsId,
    required String projectId,
    required String taskId,
  }) async {
    final path = '/api/v1/workspaces/$wsId/task-projects/$projectId/tasks';
    final payload = {'taskId': taskId};
    await _writePlanningVoid(
      wsId: wsId,
      method: 'POST',
      path: path,
      entityId: projectId,
      payload: payload,
      send: () async {
        await _apiClient.postJson(path, payload);
      },
    );
  }

  Future<void> _unlinkTaskFromProject({
    required String wsId,
    required String projectId,
    required String taskId,
  }) async {
    final path =
        '/api/v1/workspaces/$wsId/task-projects/$projectId/tasks/$taskId';
    await _writePlanningVoid(
      wsId: wsId,
      method: 'DELETE',
      path: path,
      entityId: projectId,
      send: () async {
        await _apiClient.deleteJson(path);
      },
    );
  }
}
