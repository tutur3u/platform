import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:mime/mime.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/core/cache/pending_collection_overlay.dart';
import 'package:mobile/data/models/task.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/task_board_summary.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/task_boards_page.dart';
import 'package:mobile/data/models/task_bulk.dart';
import 'package:mobile/data/models/task_estimate_board.dart';
import 'package:mobile/data/models/task_initiative_summary.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/data/models/task_link_option.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/models/task_project_update.dart';
import 'package:mobile/data/models/task_relationships.dart';
import 'package:mobile/data/models/user_tasks_page.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/tasks_estimates/utils/task_label_colors.dart';

part 'task_repository_helpers.dart';

/// Repository for task operations.
class TaskRepository {
  TaskRepository({ApiClient? apiClient, http.Client? httpClient})
    : _apiClient = apiClient ?? ApiClient(),
      _httpClient = httpClient ?? http.Client();

  final ApiClient _apiClient;
  final http.Client _httpClient;

  Future<Map<String, dynamic>> _read(
    String wsId,
    String namespace,
    String path,
  ) => readThroughJson(
    api: _apiClient,
    namespace: 'tasks.$namespace',
    workspaceId: wsId,
    path: path,
  );

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

  String _filenameFromPath(String path) {
    final normalized = path.replaceAll(RegExp(r'\\'), '/');
    final parts = normalized.split('/');
    final last = parts.isNotEmpty ? parts.last.trim() : '';
    if (last.isNotEmpty) {
      return last;
    }

    return 'task-image-${DateTime.now().millisecondsSinceEpoch}.jpg';
  }

  Future<String> uploadTaskDescriptionImage({
    required String wsId,
    required String localFilePath,
    String? taskId,
  }) async {
    final filename = _filenameFromPath(localFilePath);
    final uploadResponse = await _apiClient
        .postJson('/api/v1/workspaces/$wsId/tasks/upload-url', {
          'filename': filename,
          if (taskId != null && taskId.trim().isNotEmpty) 'taskId': taskId,
        });

    final signedUrl = uploadResponse['signedUrl'] as String?;
    final token = uploadResponse['token'] as String?;
    final path = uploadResponse['path'] as String?;

    if (signedUrl == null || token == null || path == null) {
      throw const ApiException(
        message: 'Invalid task upload URL response',
        statusCode: 0,
      );
    }

    final fileBytes = await File(localFilePath).readAsBytes();
    final contentType =
        lookupMimeType(localFilePath) ?? 'application/octet-stream';

    final putResponse = await _httpClient
        .put(
          Uri.parse(signedUrl),
          headers: {
            'Authorization': 'Bearer $token',
            'Content-Type': contentType,
          },
          body: fileBytes,
        )
        .timeout(const Duration(seconds: 60));

    if (putResponse.statusCode < 200 || putResponse.statusCode >= 300) {
      throw ApiException(
        message: 'Failed to upload image (${putResponse.statusCode})',
        statusCode: putResponse.statusCode,
      );
    }

    final encodedWsId = Uri.encodeComponent(wsId);
    final query = Uri(queryParameters: {'path': path}).query;
    return '/api/v1/workspaces/$encodedWsId/storage/share?$query';
  }

  /// Fetches the current user's task buckets from the shared web API.
  Future<UserTasksPage> getMyTasks({
    required String wsId,
    required bool isPersonal,
    int completedPage = 0,
    int completedLimit = 20,
  }) async {
    final query = _encodeQueryParameters({
      'wsId': wsId,
      'isPersonal': isPersonal.toString(),
      'completedPage': completedPage.toString(),
      'completedLimit': completedLimit.toString(),
    });

    final response = await _read(wsId, 'mine', '/api/v1/users/me/tasks?$query');
    return UserTasksPage.fromJson(response);
  }

  Future<List<Task>> getTasks(String wsId) async {
    final path = '/api/v1/workspaces/$wsId/tasks';
    final response = await _read(wsId, 'list', path);
    final tasks = await _overlayTaskRows(
      wsId,
      response['tasks'] as List<dynamic>? ?? const <dynamic>[],
    );

    return tasks
        .whereType<Map<String, dynamic>>()
        .map(_taskFromApiJson)
        .toList();
  }

  Future<Task?> getTaskById(String taskId, {required String wsId}) async {
    final pending = await OfflineMutationQueue.instance.listPending();
    for (final item in pending) {
      if (item.feature == 'tasks' &&
          item.workspaceId == wsId &&
          item.entityId == taskId &&
          item.method == 'POST' &&
          item.payload != null) {
        return _taskFromApiJson({...item.payload!, 'id': taskId});
      }
    }
    try {
      final response = await _read(
        wsId,
        'detail',
        '/api/v1/workspaces/$wsId/tasks/$taskId',
      );
      final task = response['task'];
      if (task is! Map<String, dynamic>) return null;
      final rows = overlayPendingCollection(
        workspaceId: wsId,
        feature: 'tasks',
        pathContains: '/api/v1/workspaces/$wsId/tasks',
        source: [task],
        pending: pending,
        includeCreates: false,
        matchesQuery: (row) => row['deleted'] != true,
      );
      return rows.isEmpty ? null : _taskFromApiJson(rows.single);
    } on ApiException catch (error) {
      if (error.statusCode == 404) {
        return null;
      }
      rethrow;
    }
  }

  Future<Task> createTask(String wsId, Map<String, dynamic> data) async {
    final path = '/api/v1/workspaces/$wsId/tasks';
    final payload = _normalizeTaskPayload(data);
    final result = await queueOrSendValue<Task>(
      feature: 'tasks',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      pendingValue: (id) => _taskFromApiJson({...payload, 'id': id}),
      send: () async {
        final response = await _apiClient.postJson(path, payload);
        final task = response['task'];
        if (task is! Map<String, dynamic>) {
          throw const ApiException(
            message: 'Invalid task create response',
            statusCode: 0,
          );
        }
        return _taskFromApiJson(task);
      },
    );
    await CacheStore.instance.invalidateTags({
      'module:tasks',
    }, workspaceId: wsId);
    return result;
  }

  Future<void> updateTask(
    String taskId,
    Map<String, dynamic> data, {
    required String wsId,
  }) async {
    final path = '/api/v1/workspaces/$wsId/tasks/$taskId';
    final payload = _normalizeTaskPayload(data);
    await _writeTaskVoid(wsId, 'PUT', path, payload: payload, entityId: taskId);
  }

  Future<void> updateTaskDescription({
    required String wsId,
    required String taskId,
    String? description,
    List<int>? descriptionYjsState,
  }) async {
    final payload = <String, dynamic>{
      'description': description,
      if (descriptionYjsState != null)
        'description_yjs_state': descriptionYjsState,
    };

    final path = '/api/v1/workspaces/$wsId/tasks/$taskId/description';
    await _writeTaskVoid(
      wsId,
      'PATCH',
      path,
      payload: payload,
      entityId: taskId,
    );
  }

  Future<void> deleteTask(String taskId, {required String wsId}) async {
    await updateTask(taskId, {'deleted': true}, wsId: wsId);
  }

  Future<void> restoreTask({
    required String wsId,
    required String taskId,
  }) async {
    final path = '/api/v1/workspaces/$wsId/tasks/$taskId';
    const payload = {'restore': true};
    await _writeTaskVoid(
      wsId,
      'PATCH',
      path,
      payload: payload,
      entityId: taskId,
    );
  }

  Future<void> permanentlyDeleteTask({
    required String wsId,
    required String taskId,
  }) async {
    final path = '/api/v1/workspaces/$wsId/tasks/$taskId';
    await _writeTaskVoid(wsId, 'DELETE', path, entityId: taskId);
  }

  Future<TaskBulkResult> bulkBoardTasks({
    required String wsId,
    required List<String> taskIds,
    required TaskBulkOperation operation,
  }) async {
    final normalizedTaskIds = taskIds
        .map((id) => id.trim())
        .where((id) => id.isNotEmpty)
        .toSet()
        .toList(growable: false);

    if (normalizedTaskIds.isEmpty) {
      throw const ApiException(
        message: 'No task IDs provided for bulk operation',
        statusCode: 400,
      );
    }

    final response = await _apiClient.postJson(
      '/api/v1/workspaces/$wsId/tasks/bulk',
      {'taskIds': normalizedTaskIds, 'operation': operation.toJson()},
    );
    return TaskBulkResult.fromJson(response);
  }

  Future<List<TaskEstimateBoard>> getTaskEstimateBoards(String wsId) async {
    final response = await _read(
      wsId,
      'estimation',
      '/api/v1/workspaces/$wsId/boards/estimation',
    );
    final boardsData = response['boards'] as List<dynamic>? ?? const [];

    return boardsData
        .map(
          (board) => TaskEstimateBoard.fromJson(
            Map<String, dynamic>.from(board as Map),
          ),
        )
        .toList(growable: false);
  }

  Future<TaskBoardsPage> getTaskBoards(
    String wsId, {
    int page = 1,
    int pageSize = 20,
    String status = 'all',
  }) async {
    final normalizedPage = page < 1 ? 1 : page;
    final normalizedPageSize = pageSize.clamp(1, 200);
    final query = _encodeQueryParameters({
      'page': normalizedPage.toString(),
      'pageSize': normalizedPageSize.toString(),
      'status': status,
    });

    final response = await _read(
      wsId,
      'boards',
      '/api/v1/workspaces/$wsId/task-boards?$query',
    );
    final base = '/api/v1/workspaces/$wsId/task-boards';
    final boardsData = response['boards'] as List<dynamic>? ?? const [];
    final rows = overlayPendingCollection(
      workspaceId: wsId,
      feature: 'tasks',
      pathContains: base,
      source: boardsData.whereType<Map<String, dynamic>>().toList(
        growable: false,
      ),
      pending: (await OfflineMutationQueue.instance.listPending())
          .where(
            (item) =>
                item.path == base || item.path == '$base/${item.entityId}',
          )
          .toList(growable: false),
      normalizeCreate: (payload) => {...payload, 'ws_id': wsId},
      includeCreates: normalizedPage == 1 && status == 'all',
    );
    final pageBoards = rows
        .map(TaskBoardSummary.fromSummaryJson)
        .toList(growable: false);
    final totalCount =
        ((response['count'] as num?)?.toInt() ?? boardsData.length) +
        rows.length -
        boardsData.length;

    return TaskBoardsPage(
      boards: List.unmodifiable(pageBoards),
      totalCount: totalCount,
      page: normalizedPage,
      pageSize: normalizedPageSize,
    );
  }

  Future<TaskBoardDetail> getTaskBoardDetail(
    String wsId,
    String boardId,
  ) async {
    final results = await Future.wait<dynamic>([
      _getTaskBoardMetadata(this, wsId, boardId),
      getBoardLists(wsId, boardId),
      getTaskLabels(wsId),
      getWorkspaceUsers(wsId),
      getTaskProjects(wsId),
      getTaskEstimateBoards(wsId),
    ]);

    final estimateBoards = results[5] as List<TaskEstimateBoard>;
    TaskEstimateBoard? boardEstimation;
    for (final estimateBoard in estimateBoards) {
      if (estimateBoard.id == boardId) {
        boardEstimation = estimateBoard;
        break;
      }
    }

    final labels = results[2] as List<TaskLabel>;
    final members = results[3] as List<WorkspaceUserOption>;
    final projects = results[4] as List<TaskProjectSummary>;

    return (results[0] as TaskBoardDetail).copyWith(
      lists: results[1] as List<TaskBoardList>,
      tasks: const <TaskBoardTask>[],
      labels: labels,
      members: members,
      projects: projects,
      estimationType: boardEstimation?.estimationType,
      extendedEstimation: boardEstimation?.extendedEstimation ?? false,
      allowZeroEstimates: boardEstimation?.allowZeroEstimates ?? true,
      countUnestimatedIssues: boardEstimation?.countUnestimatedIssues ?? false,
    );
  }

  Future<List<TaskBoardTask>> getBoardTasksForList(
    String wsId, {
    required String listId,
    int limit = 50,
    int offset = 0,
    List<WorkspaceUserOption> members = const <WorkspaceUserOption>[],
    List<TaskLabel> labels = const <TaskLabel>[],
    List<TaskProjectSummary> projects = const <TaskProjectSummary>[],
  }) async {
    final normalizedLimit = limit.clamp(1, 200);
    final normalizedOffset = offset < 0 ? 0 : offset;
    final query = _encodeQueryParameters({
      'listId': listId,
      'limit': normalizedLimit.toString(),
      'offset': normalizedOffset.toString(),
    });

    final response = await _read(
      wsId,
      'boardTasks',
      '/api/v1/workspaces/$wsId/tasks?$query',
    );
    final taskRows = response['tasks'] as List<dynamic>? ?? const [];
    final pageTasks = (await _overlayTaskRows(
      wsId,
      taskRows,
      listId: listId,
      offset: normalizedOffset,
    )).map(TaskBoardTask.fromJson).toList(growable: false);

    if (members.isEmpty && labels.isEmpty && projects.isEmpty) {
      return List.unmodifiable(pageTasks);
    }

    return List.unmodifiable(
      _hydrateTaskRelations(
        tasks: pageTasks,
        members: members,
        labels: labels,
        projects: projects,
      ),
    );
  }

  Future<List<TaskBoardTask>> getDeletedBoardTasks(
    String wsId, {
    required String boardId,
    int limit = 100,
    int offset = 0,
    List<TaskLabel> labels = const <TaskLabel>[],
    List<TaskProjectSummary> projects = const <TaskProjectSummary>[],
  }) async {
    final normalizedLimit = limit.clamp(1, 200);
    final normalizedOffset = offset < 0 ? 0 : offset;
    final query = _encodeQueryParameters({
      'boardId': boardId,
      'includeDeleted': 'only',
      'limit': normalizedLimit.toString(),
      'offset': normalizedOffset.toString(),
    });

    final response = await _read(
      wsId,
      'deletedTasks',
      '/api/v1/workspaces/$wsId/tasks?$query',
    );
    final taskRows = response['tasks'] as List<dynamic>? ?? const [];
    final pageTasks = (await _overlayTaskRows(
      wsId,
      taskRows,
      deletedOnly: true,
      offset: normalizedOffset,
    )).map(TaskBoardTask.fromJson).toList(growable: false);

    if (labels.isEmpty && projects.isEmpty) {
      return List.unmodifiable(pageTasks);
    }

    return List.unmodifiable(
      _hydrateTaskRelations(
        tasks: pageTasks,
        members: const [],
        labels: labels,
        projects: projects,
      ),
    );
  }

  Future<List<TaskBoardTask>> getBoardTasks(
    String wsId,
    String boardId, {
    int pageSize = 200,
  }) async {
    final normalizedPageSize = pageSize.clamp(1, 200);
    const maxIterations = 1000;
    final tasks = <TaskBoardTask>[];
    var offset = 0;
    var iteration = 0;

    while (true) {
      iteration += 1;
      if (iteration > maxIterations) {
        throw const ApiException(
          message: 'Task pagination iteration limit exceeded',
          statusCode: 500,
        );
      }

      final query = _encodeQueryParameters({
        'boardId': boardId,
        'limit': normalizedPageSize.toString(),
        'offset': offset.toString(),
      });

      final response = await _read(
        wsId,
        'boardTasks',
        '/api/v1/workspaces/$wsId/tasks?$query',
      );
      final taskRows = response['tasks'] as List<dynamic>? ?? const [];
      final pageTasks = (await _overlayTaskRows(
        wsId,
        taskRows,
        includeCreates: false,
        offset: offset,
      )).map(TaskBoardTask.fromJson).toList(growable: false);

      tasks.addAll(pageTasks);
      if (pageTasks.length < normalizedPageSize) break;
      offset += normalizedPageSize;
    }

    return List.unmodifiable(tasks);
  }

  Future<List<TaskBoardList>> getBoardLists(String wsId, String boardId) async {
    final response = await _read(
      wsId,
      'boardLists',
      '/api/v1/workspaces/$wsId/task-boards/$boardId/lists',
    );
    final lists = response['lists'] as List<dynamic>? ?? const [];

    return lists
        .whereType<Map<String, dynamic>>()
        .map(TaskBoardList.fromJson)
        .toList(growable: false);
  }

  Future<TaskBoardTask> createBoardTask({
    required String wsId,
    required String listId,
    required String name,
    String? description,
    String? priority,
    DateTime? startDate,
    DateTime? endDate,
    int? estimationPoints,
    List<String>? labelIds,
    List<String>? projectIds,
    List<String>? assigneeIds,
  }) async {
    final response = await _apiClient
        .postJson('/api/v1/workspaces/$wsId/tasks', {
          'name': name,
          'listId': listId,
          'description': description,
          'priority': priority,
          'start_date': startDate == null ? null : _taskStartDateIso(startDate),
          'end_date': endDate == null ? null : _taskEndDateIso(endDate),
          'estimation_points': estimationPoints,
          if (labelIds != null) 'label_ids': labelIds,
          if (projectIds != null) 'project_ids': projectIds,
          if (assigneeIds != null) 'assignee_ids': assigneeIds,
        });

    final task = response['task'];
    if (task is! Map<String, dynamic>) {
      throw const ApiException(
        message: 'Invalid task create response',
        statusCode: 0,
      );
    }

    return TaskBoardTask.fromJson(task);
  }

  Future<TaskBoardTask> updateBoardTask({
    required String wsId,
    required String taskId,
    String? name,
    String? description,
    String? priority,
    DateTime? startDate,
    DateTime? endDate,
    int? estimationPoints,
    List<String>? labelIds,
    List<String>? projectIds,
    List<String>? assigneeIds,
    bool? completed,
    bool clearDescription = false,
    bool clearStartDate = false,
    bool clearEndDate = false,
    bool clearEstimationPoints = false,
  }) async {
    if (description != null && clearDescription) {
      throw ArgumentError(
        'description and clearDescription cannot both be provided',
      );
    }

    if (startDate != null && clearStartDate) {
      throw ArgumentError(
        'startDate and clearStartDate cannot both be provided',
      );
    }

    if (endDate != null && clearEndDate) {
      throw ArgumentError('endDate and clearEndDate cannot both be provided');
    }

    if (estimationPoints != null && clearEstimationPoints) {
      throw ArgumentError(
        'estimationPoints and clearEstimationPoints cannot both be provided',
      );
    }

    final updatePayload = <String, dynamic>{
      if (name != null) 'name': name,
      if (description != null) 'description': description,
      if (clearDescription) 'description': null,
      if (priority != null) 'priority': priority,
      if (startDate != null) 'start_date': _taskStartDateIso(startDate),
      if (endDate != null) 'end_date': _taskEndDateIso(endDate),
      if (clearStartDate) 'start_date': null,
      if (clearEndDate) 'end_date': null,
      if (estimationPoints != null) 'estimation_points': estimationPoints,
      if (clearEstimationPoints) 'estimation_points': null,
      if (labelIds != null) 'label_ids': labelIds,
      if (projectIds != null) 'project_ids': projectIds,
      if (assigneeIds != null) 'assignee_ids': assigneeIds,
      if (completed != null) 'completed': completed,
    };

    if (updatePayload.isEmpty) {
      throw const ApiException(
        message: 'No task fields provided for update',
        statusCode: 400,
      );
    }

    final response = await _apiClient.putJson(
      '/api/v1/workspaces/$wsId/tasks/$taskId',
      updatePayload,
    );
    final task = response['task'];
    if (task is! Map<String, dynamic>) {
      throw const ApiException(
        message: 'Invalid task update response',
        statusCode: 0,
      );
    }

    return TaskBoardTask.fromJson(task);
  }

  Future<TaskBoardTask> moveBoardTask({
    required String wsId,
    required String taskId,
    required String listId,
  }) async {
    final response = await _apiClient.putJson(
      '/api/v1/workspaces/$wsId/tasks/$taskId',
      {'list_id': listId},
    );
    final task = response['task'];
    if (task is! Map<String, dynamic>) {
      throw const ApiException(
        message: 'Invalid task move response',
        statusCode: 0,
      );
    }

    return TaskBoardTask.fromJson(task);
  }

  Future<TaskBoardList> createBoardList({
    required String wsId,
    required String boardId,
    required String name,
    String status = 'active',
    String color = 'BLUE',
  }) async {
    final normalizedStatus =
        TaskBoardList.normalizeSupportedStatus(status) ?? 'active';
    final normalizedColor =
        TaskBoardList.normalizeSupportedColor(color) ?? 'BLUE';

    final response = await _apiClient.postJson(
      '/api/v1/workspaces/$wsId/task-boards/$boardId/lists',
      {'name': name, 'status': normalizedStatus, 'color': normalizedColor},
    );
    final list = response['list'];
    if (list is! Map<String, dynamic>) {
      throw const ApiException(
        message: 'Invalid task list create response',
        statusCode: 0,
      );
    }

    return TaskBoardList.fromJson(list);
  }

  Future<TaskBoardList> updateBoardList({
    required String wsId,
    required String boardId,
    required String listId,
    String? name,
    String? status,
    String? color,
    int? position,
    bool? deleted,
  }) async {
    final updatePayload = <String, dynamic>{
      if (name != null) 'name': name,
      if (status != null)
        'status': TaskBoardList.normalizeSupportedStatus(status) ?? 'active',
      if (color != null)
        'color': TaskBoardList.normalizeSupportedColor(color) ?? 'BLUE',
      if (position != null) 'position': position,
      if (deleted != null) 'deleted': deleted,
    };

    if (updatePayload.isEmpty) {
      throw const ApiException(
        message: 'No task list fields provided for update',
        statusCode: 400,
      );
    }

    final response = await _apiClient.patchJson(
      '/api/v1/workspaces/$wsId/task-boards/$boardId/lists/$listId',
      updatePayload,
    );
    final list = response['list'];
    if (list is! Map<String, dynamic>) {
      throw const ApiException(
        message: 'Invalid task list update response',
        statusCode: 0,
      );
    }

    return TaskBoardList.fromJson(list);
  }

  Future<void> createTaskBoard({
    required String wsId,
    required String name,
    String? icon,
  }) async {
    await _writeTaskVoid(
      wsId,
      'POST',
      '/api/v1/workspaces/$wsId/task-boards',
      payload: {'name': name, 'icon': icon},
    );
  }

  Future<void> updateTaskBoard({
    required String wsId,
    required String boardId,
    required String name,
    String? icon,
  }) async {
    await _writeTaskVoid(
      wsId,
      'PUT',
      '/api/v1/workspaces/$wsId/task-boards/$boardId',
      entityId: boardId,
      payload: {'name': name, 'icon': icon},
    );
  }

  Future<void> duplicateTaskBoard({
    required String wsId,
    required String boardId,
    String? newBoardName,
  }) async {
    await _writeTaskVoid(
      wsId,
      'POST',
      '/api/v1/workspaces/$wsId/task-boards/$boardId/copy',
      payload: {
        'targetWorkspaceId': wsId,
        if (newBoardName != null && newBoardName.trim().isNotEmpty)
          'newBoardName': newBoardName.trim(),
      },
    );
  }

  Future<void> archiveTaskBoard({
    required String wsId,
    required String boardId,
  }) async {
    await _writeTaskVoid(
      wsId,
      'PUT',
      '/api/v1/workspaces/$wsId/task-boards/$boardId',
      entityId: boardId,
      payload: {'archived': true},
    );
  }

  Future<void> unarchiveTaskBoard({
    required String wsId,
    required String boardId,
  }) async {
    await _writeTaskVoid(
      wsId,
      'PUT',
      '/api/v1/workspaces/$wsId/task-boards/$boardId',
      entityId: boardId,
      payload: {'archived': false},
    );
  }

  Future<void> softDeleteTaskBoard({
    required String wsId,
    required String boardId,
  }) async {
    await _writeTaskVoid(
      wsId,
      'PUT',
      '/api/v1/workspaces/$wsId/task-boards/$boardId',
      entityId: boardId,
      payload: {'deleted': true},
    );
  }

  Future<void> restoreTaskBoard({
    required String wsId,
    required String boardId,
  }) async {
    await _writeTaskVoid(
      wsId,
      'PUT',
      '/api/v1/workspaces/$wsId/task-boards/$boardId',
      entityId: boardId,
      payload: {'restore': true},
    );
  }

  Future<void> permanentlyDeleteTaskBoard({
    required String wsId,
    required String boardId,
  }) async {
    await _writeTaskVoid(
      wsId,
      'DELETE',
      '/api/v1/workspaces/$wsId/task-boards/$boardId',
      entityId: boardId,
    );
  }

  Future<TaskEstimateBoard> updateBoardEstimation({
    required String wsId,
    required String boardId,
    required String? estimationType,
    required bool extendedEstimation,
    required bool allowZeroEstimates,
    required bool countUnestimatedIssues,
  }) async {
    final response = await _apiClient
        .patchJson('/api/v1/workspaces/$wsId/boards/$boardId/estimation', {
          'estimation_type': estimationType,
          'extended_estimation': extendedEstimation,
          'allow_zero_estimates': allowZeroEstimates,
          'count_unestimated_issues': countUnestimatedIssues,
        });

    return TaskEstimateBoard.fromJson(response);
  }

  Future<List<TaskLabel>> getTaskLabels(String wsId) async {
    final response = await _apiClient.getJsonList(
      '/api/v1/workspaces/$wsId/labels',
    );

    return response
        .whereType<Map<String, dynamic>>()
        .map(TaskLabel.fromJson)
        .toList(growable: false);
  }

  Future<TaskLabel> createTaskLabel({
    required String wsId,
    required String name,
    required String color,
  }) async {
    final normalizedColor = normalizeTaskLabelColor(color);
    if (normalizedColor == null) {
      throw const FormatException('Invalid task label color');
    }

    final response = await _apiClient.postJson(
      '/api/v1/workspaces/$wsId/labels',
      {'name': name, 'color': normalizedColor},
    );

    return TaskLabel.fromJson(response);
  }

  Future<TaskLabel> updateTaskLabel({
    required String wsId,
    required String labelId,
    required String name,
    required String color,
  }) async {
    final normalizedColor = normalizeTaskLabelColor(color);
    if (normalizedColor == null) {
      throw const FormatException('Invalid task label color');
    }

    final response = await _apiClient.patchJson(
      '/api/v1/workspaces/$wsId/labels/$labelId',
      {'name': name, 'color': normalizedColor},
    );

    return TaskLabel.fromJson(response);
  }

  Future<void> deleteTaskLabel({
    required String wsId,
    required String labelId,
  }) async {
    await _apiClient.deleteJson('/api/v1/workspaces/$wsId/labels/$labelId');
  }

  Future<List<TaskProjectSummary>> getTaskProjects(String wsId) async {
    final response = await _apiClient.getJsonList(
      '/api/v1/workspaces/$wsId/task-projects',
    );

    return response
        .whereType<Map<String, dynamic>>()
        .map(TaskProjectSummary.fromJson)
        .toList(growable: false);
  }

  Future<List<TaskLinkOption>> getWorkspaceTasksForProjectLinking(
    String wsId,
  ) async {
    final response = await _apiClient.getJson('/api/v1/workspaces/$wsId/tasks');
    final tasks = response['tasks'] as List<dynamic>? ?? const [];

    return tasks
        .whereType<Map<String, dynamic>>()
        .map(TaskLinkOption.fromJson)
        .toList(growable: false);
  }

  Future<({List<TaskLinkOption> tasks, int totalCount})>
  getTimeTrackingTaskLinkOptions(
    String wsId, {
    required int limit,
    required int offset,
    bool assignedToMe = true,
    String? searchQuery,
  }) async {
    final normalizedLimit = limit.clamp(1, 100);
    final normalizedOffset = offset < 0 ? 0 : offset;
    final normalizedSearch = searchQuery?.trim();
    final query = _encodeQueryParameters({
      'forTimeTracking': 'true',
      'includeCount': 'true',
      'limit': '$normalizedLimit',
      'offset': '$normalizedOffset',
      'assignedToMe': assignedToMe.toString(),
      if (normalizedSearch != null && normalizedSearch.isNotEmpty)
        'q': normalizedSearch,
    });
    final response = await _apiClient.getJson(
      '/api/v1/workspaces/$wsId/tasks?$query',
    );
    final tasksRaw = response['tasks'] as List<dynamic>? ?? const [];
    final tasks = tasksRaw
        .whereType<Map<String, dynamic>>()
        .map(TaskLinkOption.fromJson)
        .toList(growable: false);
    final totalCount = (response['count'] as num?)?.toInt() ?? tasks.length;

    return (tasks: tasks, totalCount: totalCount);
  }

  Future<List<WorkspaceUserOption>> getWorkspaceUsers(String wsId) async {
    final response = await _apiClient.getJson(
      '/api/v1/workspaces/$wsId/members',
    );
    final members = response['members'] as List<dynamic>? ?? const [];

    return members
        .whereType<Map<String, dynamic>>()
        .map(WorkspaceUserOption.fromJson)
        .toList(growable: false);
  }

  Future<TaskRelationshipsResponse> getTaskRelationships({
    required String wsId,
    required String taskId,
  }) async {
    final response = await _apiClient.getJson(
      '/api/v1/workspaces/$wsId/tasks/$taskId/relationships',
    );
    return TaskRelationshipsResponse.fromJson(response);
  }

  Future<void> createTaskRelationship({
    required String wsId,
    required String taskId,
    required String sourceTaskId,
    required String targetTaskId,
    required TaskRelationshipType type,
  }) async {
    await _apiClient
        .postJson('/api/v1/workspaces/$wsId/tasks/$taskId/relationships', {
          'source_task_id': sourceTaskId,
          'target_task_id': targetTaskId,
          'type': type.apiValue,
        });
  }

  Future<void> deleteTaskRelationship({
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

    await _apiClient.deleteJson(
      '/api/v1/workspaces/$wsId/tasks/$taskId/relationships',
      body: payload,
    );
  }

  Future<void> createTaskProject({
    required String wsId,
    required String name,
    String? description,
  }) async {
    await _apiClient.postJson('/api/v1/workspaces/$wsId/task-projects', {
      'name': name,
      if (description != null) 'description': description,
    });
  }

  Future<void> updateTaskProject({
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
    await _apiClient
        .putJson('/api/v1/workspaces/$wsId/task-projects/$projectId', {
          'name': name,
          'description': description,
          if (status != null) 'status': status,
          if (priority != null) 'priority': priority,
          'health_status': healthStatus,
          'lead_id': leadId,
          'start_date': startDate?.toUtc().toIso8601String(),
          'end_date': endDate?.toUtc().toIso8601String(),
          'archived': archived,
        });
  }

  Future<void> deleteTaskProject({
    required String wsId,
    required String projectId,
  }) async {
    await _apiClient.deleteJson(
      '/api/v1/workspaces/$wsId/task-projects/$projectId',
    );
  }

  Future<List<TaskInitiativeSummary>> getTaskInitiatives(String wsId) async {
    final response = await _apiClient.getJsonList(
      '/api/v1/workspaces/$wsId/task-initiatives',
    );

    return response
        .whereType<Map<String, dynamic>>()
        .map(TaskInitiativeSummary.fromJson)
        .toList(growable: false);
  }

  Future<void> createTaskInitiative({
    required String wsId,
    required String name,
    required String status,
    String? description,
  }) async {
    await _apiClient.postJson('/api/v1/workspaces/$wsId/task-initiatives', {
      'name': name,
      if (description != null) 'description': description,
      'status': status,
    });
  }

  Future<void> updateTaskInitiative({
    required String wsId,
    required String initiativeId,
    required String name,
    required String status,
    String? description,
  }) async {
    await _apiClient
        .putJson('/api/v1/workspaces/$wsId/task-initiatives/$initiativeId', {
          'name': name,
          if (description != null) 'description': description,
          'status': status,
        });
  }

  Future<void> deleteTaskInitiative({
    required String wsId,
    required String initiativeId,
  }) async {
    await _apiClient.deleteJson(
      '/api/v1/workspaces/$wsId/task-initiatives/$initiativeId',
    );
  }

  Future<void> linkProjectToInitiative({
    required String wsId,
    required String initiativeId,
    required String projectId,
  }) async {
    await _apiClient.postJson(
      '/api/v1/workspaces/$wsId/task-initiatives/$initiativeId/projects',
      {'projectId': projectId},
    );
  }

  Future<void> unlinkProjectFromInitiative({
    required String wsId,
    required String initiativeId,
    required String projectId,
  }) async {
    await _apiClient.deleteJson(
      '/api/v1/workspaces/$wsId/task-initiatives/$initiativeId/projects/$projectId',
    );
  }

  Future<void> linkTaskToProject({
    required String wsId,
    required String projectId,
    required String taskId,
  }) async {
    await _apiClient.postJson(
      '/api/v1/workspaces/$wsId/task-projects/$projectId/tasks',
      {'taskId': taskId},
    );
  }

  Future<void> unlinkTaskFromProject({
    required String wsId,
    required String projectId,
    required String taskId,
  }) async {
    await _apiClient.deleteJson(
      '/api/v1/workspaces/$wsId/task-projects/$projectId/tasks/$taskId',
    );
  }

  Future<List<TaskProjectUpdate>> getTaskProjectUpdates({
    required String wsId,
    required String projectId,
    int limit = 50,
    int offset = 0,
  }) async {
    final response = await _apiClient.getJson(
      '/api/v1/workspaces/$wsId/task-projects/$projectId/updates?limit=$limit&offset=$offset',
    );
    final updates = response['updates'] as List<dynamic>? ?? const [];

    return updates
        .whereType<Map<String, dynamic>>()
        .map(TaskProjectUpdate.fromJson)
        .toList(growable: false);
  }

  Future<TaskProjectUpdate> createTaskProjectUpdate({
    required String wsId,
    required String projectId,
    required String content,
  }) async {
    final response = await _apiClient.postJson(
      '/api/v1/workspaces/$wsId/task-projects/$projectId/updates',
      {'content': content},
    );

    return TaskProjectUpdate.fromJson(response);
  }

  Future<TaskProjectUpdate> updateTaskProjectUpdate({
    required String wsId,
    required String projectId,
    required String updateId,
    required String content,
  }) async {
    final response = await _apiClient.patchJson(
      '/api/v1/workspaces/$wsId/task-projects/$projectId/updates/$updateId',
      {'content': content},
    );

    return TaskProjectUpdate.fromJson(response);
  }

  Future<void> deleteTaskProjectUpdate({
    required String wsId,
    required String projectId,
    required String updateId,
  }) async {
    await _apiClient.deleteJson(
      '/api/v1/workspaces/$wsId/task-projects/$projectId/updates/$updateId',
    );
  }
}
