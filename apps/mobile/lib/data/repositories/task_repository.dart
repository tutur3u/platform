import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:mime/mime.dart';
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

/// Repository for task operations.
class TaskRepository {
  TaskRepository({ApiClient? apiClient, http.Client? httpClient})
    : _apiClient = apiClient ?? ApiClient(),
      _httpClient = httpClient ?? http.Client();

  final ApiClient _apiClient;
  final http.Client _httpClient;

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
    final uploadResponse = await _apiClient.postJson(
      '/api/v1/workspaces/$wsId/tasks/upload-url',
      {
        'filename': filename,
        if (taskId != null && taskId.trim().isNotEmpty) 'taskId': taskId,
      },
    );

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

    final response = await _apiClient.getJson('/api/v1/users/me/tasks?$query');
    return UserTasksPage.fromJson(response);
  }

  String _encodeQueryParameters(Map<String, String> params) {
    return Uri(queryParameters: params).query;
  }

  Task _taskFromApiJson(Map<String, dynamic> json) {
    final priority = switch (json['priority']) {
      'low' => 1,
      'normal' => 2,
      'high' => 3,
      'critical' => 4,
      final int value => value,
      final num value => value.toInt(),
      _ => null,
    };

    return Task(
      id: json['id'] as String,
      name: json['name'] as String?,
      description: json['description'] as String?,
      priority: priority,
      completed: json['completed'] as bool?,
      startDate: json['start_date'] != null
          ? DateTime.tryParse(json['start_date'] as String)?.toLocal()
          : null,
      endDate: json['end_date'] != null
          ? DateTime.tryParse(json['end_date'] as String)?.toLocal()
          : null,
      boardId: json['board_id'] as String?,
      listId: json['list_id'] as String?,
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'] as String)?.toLocal()
          : null,
    );
  }

  String? _priorityToApiValue(Object? value) {
    return switch (value) {
      'low' => 'low',
      'normal' => 'normal',
      'high' => 'high',
      'critical' => 'critical',
      1 => 'low',
      2 => 'normal',
      3 => 'high',
      4 => 'critical',
      final num number when number.toInt() >= 1 && number.toInt() <= 4 =>
        _priorityToApiValue(number.toInt()),
      _ => null,
    };
  }

  Map<String, dynamic> _normalizeTaskPayload(Map<String, dynamic> data) {
    return {
      if (data['name'] != null) 'name': data['name'],
      if (data.containsKey('description')) 'description': data['description'],
      if (_priorityToApiValue(data['priority']) != null)
        'priority': _priorityToApiValue(data['priority']),
      if (data['start_date'] != null) 'start_date': data['start_date'],
      if (data['startDate'] != null) 'start_date': data['startDate'],
      if (data['end_date'] != null) 'end_date': data['end_date'],
      if (data['endDate'] != null) 'end_date': data['endDate'],
      if (data['list_id'] != null) 'list_id': data['list_id'],
      if (data['listId'] != null) 'list_id': data['listId'],
      if (data['completed'] != null) 'completed': data['completed'],
      if (data['deleted'] != null) 'deleted': data['deleted'],
    };
  }

  Future<List<Task>> getTasks(String wsId) async {
    final response = await _apiClient.getJson('/api/v1/workspaces/$wsId/tasks');
    final tasks = response['tasks'] as List<dynamic>? ?? const [];

    return tasks
        .whereType<Map<String, dynamic>>()
        .map(_taskFromApiJson)
        .toList();
  }

  Future<Task?> getTaskById(String taskId, {required String wsId}) async {
    try {
      final response = await _apiClient.getJson(
        '/api/v1/workspaces/$wsId/tasks/$taskId',
      );
      final task = response['task'];
      if (task is! Map<String, dynamic>) return null;
      return _taskFromApiJson(task);
    } on ApiException catch (error) {
      if (error.statusCode == 404) {
        return null;
      }
      rethrow;
    }
  }

  Future<Task> createTask(String wsId, Map<String, dynamic> data) async {
    final response = await _apiClient.postJson(
      '/api/v1/workspaces/$wsId/tasks',
      _normalizeTaskPayload(data),
    );
    final task = response['task'];
    if (task is! Map<String, dynamic>) {
      throw const ApiException(
        message: 'Invalid task create response',
        statusCode: 0,
      );
    }

    return _taskFromApiJson(task);
  }

  Future<void> updateTask(
    String taskId,
    Map<String, dynamic> data, {
    required String wsId,
  }) async {
    await _apiClient.putJson(
      '/api/v1/workspaces/$wsId/tasks/$taskId',
      _normalizeTaskPayload(data),
    );
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

    await _apiClient.patchJson(
      '/api/v1/workspaces/$wsId/tasks/$taskId/description',
      payload,
    );
  }

  Future<void> deleteTask(String taskId, {required String wsId}) async {
    await _apiClient.putJson('/api/v1/workspaces/$wsId/tasks/$taskId', {
      'deleted': true,
    });
  }

  Future<void> restoreTask({
    required String wsId,
    required String taskId,
  }) async {
    await _apiClient.patchJson('/api/v1/workspaces/$wsId/tasks/$taskId', {
      'restore': true,
    });
  }

  Future<void> permanentlyDeleteTask({
    required String wsId,
    required String taskId,
  }) async {
    await _apiClient.deleteJson('/api/v1/workspaces/$wsId/tasks/$taskId');
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
      {
        'taskIds': normalizedTaskIds,
        'operation': operation.toJson(),
      },
    );
    return TaskBulkResult.fromJson(response);
  }

  Future<List<TaskEstimateBoard>> getTaskEstimateBoards(String wsId) async {
    final response = await _apiClient.getJson(
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
  }) async {
    final normalizedPage = page < 1 ? 1 : page;
    final normalizedPageSize = pageSize.clamp(1, 200);

    final response = await _apiClient.getJson(
      '/api/v1/workspaces/$wsId/task-boards?page=$normalizedPage&pageSize=$normalizedPageSize',
    );
    final boardsData = response['boards'] as List<dynamic>? ?? const [];
    final pageBoards = boardsData
        .whereType<Map<String, dynamic>>()
        .map(TaskBoardSummary.fromSummaryJson)
        .toList(growable: false);
    final totalCount =
        (response['count'] as num?)?.toInt() ?? pageBoards.length;

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
      _getTaskBoardMetadata(wsId, boardId),
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

    final response = await _apiClient.getJson(
      '/api/v1/workspaces/$wsId/tasks?$query',
    );
    final taskRows = response['tasks'] as List<dynamic>? ?? const [];
    final pageTasks = taskRows
        .whereType<Map<String, dynamic>>()
        .map(TaskBoardTask.fromJson)
        .toList(growable: false);

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

    final response = await _apiClient.getJson(
      '/api/v1/workspaces/$wsId/tasks?$query',
    );
    final taskRows = response['tasks'] as List<dynamic>? ?? const [];
    final pageTasks = taskRows
        .whereType<Map<String, dynamic>>()
        .map(TaskBoardTask.fromJson)
        .toList(growable: false);

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

  List<TaskBoardTask> _hydrateTaskRelations({
    required List<TaskBoardTask> tasks,
    required List<WorkspaceUserOption> members,
    required List<TaskLabel> labels,
    required List<TaskProjectSummary> projects,
  }) {
    final membersById = {for (final member in members) member.id: member};
    final labelsById = {for (final label in labels) label.id: label};
    final projectsById = {for (final project in projects) project.id: project};

    return tasks
        .map((task) {
          final hydratedAssignees = task.assigneeIds
              .map((id) => membersById[id])
              .whereType<WorkspaceUserOption>()
              .map(
                (member) => TaskBoardTaskAssignee(
                  id: member.id,
                  displayName: member.displayName,
                  email: member.email,
                  avatarUrl: member.avatarUrl,
                ),
              )
              .toList(growable: false);

          final hydratedLabels = task.labelIds
              .map((id) => labelsById[id])
              .whereType<TaskLabel>()
              .map(
                (label) => TaskBoardTaskLabel(
                  id: label.id,
                  name: label.name,
                  color: normalizeTaskLabelColor(label.color),
                ),
              )
              .toList(growable: false);

          final hydratedProjects = task.projectIds
              .map((id) => projectsById[id])
              .whereType<TaskProjectSummary>()
              .map(
                (project) =>
                    TaskBoardTaskProject(id: project.id, name: project.name),
              )
              .toList(growable: false);

          return task.copyWith(
            assignees: hydratedAssignees,
            labels: hydratedLabels,
            projects: hydratedProjects,
          );
        })
        .toList(growable: false);
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

      final response = await _apiClient.getJson(
        '/api/v1/workspaces/$wsId/tasks?$query',
      );
      final taskRows = response['tasks'] as List<dynamic>? ?? const [];
      final pageTasks = taskRows
          .whereType<Map<String, dynamic>>()
          .map(TaskBoardTask.fromJson)
          .toList(growable: false);

      tasks.addAll(pageTasks);
      if (pageTasks.length < normalizedPageSize) break;
      offset += normalizedPageSize;
    }

    return List.unmodifiable(tasks);
  }

  Future<List<TaskBoardList>> getBoardLists(String wsId, String boardId) async {
    final response = await _apiClient.getJson(
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
    final response = await _apiClient.postJson(
      '/api/v1/workspaces/$wsId/tasks',
      {
        'name': name,
        'listId': listId,
        'description': description,
        'priority': priority,
        'start_date': startDate?.toUtc().toIso8601String(),
        'end_date': endDate?.toUtc().toIso8601String(),
        'estimation_points': estimationPoints,
        if (labelIds != null) 'label_ids': labelIds,
        if (projectIds != null) 'project_ids': projectIds,
        if (assigneeIds != null) 'assignee_ids': assigneeIds,
      },
    );

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
      throw ArgumentError(
        'endDate and clearEndDate cannot both be provided',
      );
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
      if (startDate != null) 'start_date': startDate.toUtc().toIso8601String(),
      if (endDate != null) 'end_date': endDate.toUtc().toIso8601String(),
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
      {
        'name': name,
        'status': normalizedStatus,
        'color': normalizedColor,
      },
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

  Future<TaskBoardDetail> _getTaskBoardMetadata(
    String wsId,
    String boardId,
  ) async {
    try {
      final response = await _apiClient.getJson(
        '/api/v1/workspaces/$wsId/task-boards/$boardId',
      );
      final board = response['board'];
      if (board is! Map<String, dynamic>) {
        throw const ApiException(message: 'Board not found', statusCode: 404);
      }

      return TaskBoardDetail.fromJson(board);
    } on ApiException catch (error) {
      if (error.statusCode != 404) {
        rethrow;
      }
    }

    var page = 1;
    const maxPages = 50;

    while (true) {
      if (page > maxPages) {
        throw const ApiException(
          message: 'Board search pagination limit exceeded',
          statusCode: 500,
        );
      }

      final boardsPage = await getTaskBoards(wsId, page: page, pageSize: 200);

      TaskBoardSummary? targetBoard;
      for (final board in boardsPage.boards) {
        if (board.id == boardId) {
          targetBoard = board;
          break;
        }
      }

      if (targetBoard != null) {
        return TaskBoardDetail(
          id: targetBoard.id,
          wsId: targetBoard.wsId,
          name: targetBoard.name,
          icon: targetBoard.icon,
          ticketPrefix: targetBoard.ticketPrefix,
          createdAt: targetBoard.createdAt,
          archivedAt: targetBoard.archivedAt,
          deletedAt: targetBoard.deletedAt,
        );
      }

      final loadedCount = page * boardsPage.pageSize;
      if (boardsPage.boards.isEmpty || loadedCount >= boardsPage.totalCount) {
        break;
      }

      page += 1;
    }

    throw const ApiException(message: 'Board not found', statusCode: 404);
  }

  Future<void> createTaskBoard({
    required String wsId,
    required String name,
    String? icon,
  }) async {
    await _apiClient.postJson('/api/v1/workspaces/$wsId/task-boards', {
      'name': name,
      'icon': icon,
    });
  }

  Future<void> updateTaskBoard({
    required String wsId,
    required String boardId,
    required String name,
    String? icon,
  }) async {
    await _apiClient.putJson('/api/v1/workspaces/$wsId/task-boards/$boardId', {
      'name': name,
      'icon': icon,
    });
  }

  Future<void> duplicateTaskBoard({
    required String wsId,
    required String boardId,
    String? newBoardName,
  }) async {
    await _apiClient.postJson(
      '/api/v1/workspaces/$wsId/task-boards/$boardId/copy',
      {
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
    await _apiClient.postJson(
      '/api/v1/workspaces/$wsId/boards/$boardId/archive',
      {},
    );
  }

  Future<void> unarchiveTaskBoard({
    required String wsId,
    required String boardId,
  }) async {
    await _apiClient.deleteJson(
      '/api/v1/workspaces/$wsId/boards/$boardId/archive',
    );
  }

  Future<void> softDeleteTaskBoard({
    required String wsId,
    required String boardId,
  }) async {
    await _apiClient.putJson('/api/v1/workspaces/$wsId/boards/$boardId', {});
  }

  Future<void> restoreTaskBoard({
    required String wsId,
    required String boardId,
  }) async {
    await _apiClient.patchJson('/api/v1/workspaces/$wsId/boards/$boardId', {
      'restore': true,
    });
  }

  Future<void> permanentlyDeleteTaskBoard({
    required String wsId,
    required String boardId,
  }) async {
    await _apiClient.deleteJson('/api/v1/workspaces/$wsId/boards/$boardId');
  }

  Future<TaskEstimateBoard> updateBoardEstimation({
    required String wsId,
    required String boardId,
    required String? estimationType,
    required bool extendedEstimation,
    required bool allowZeroEstimates,
    required bool countUnestimatedIssues,
  }) async {
    final response = await _apiClient.patchJson(
      '/api/v1/workspaces/$wsId/boards/$boardId/estimation',
      {
        'estimation_type': estimationType,
        'extended_estimation': extendedEstimation,
        'allow_zero_estimates': allowZeroEstimates,
        'count_unestimated_issues': countUnestimatedIssues,
      },
    );

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
      {
        'name': name,
        'color': normalizedColor,
      },
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
      {
        'name': name,
        'color': normalizedColor,
      },
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
    await _apiClient.postJson(
      '/api/v1/workspaces/$wsId/tasks/$taskId/relationships',
      {
        'source_task_id': sourceTaskId,
        'target_task_id': targetTaskId,
        'type': type.apiValue,
      },
    );
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
    await _apiClient.putJson(
      '/api/v1/workspaces/$wsId/task-projects/$projectId',
      {
        'name': name,
        'description': description,
        if (status != null) 'status': status,
        if (priority != null) 'priority': priority,
        'health_status': healthStatus,
        'lead_id': leadId,
        'start_date': startDate?.toUtc().toIso8601String(),
        'end_date': endDate?.toUtc().toIso8601String(),
        'archived': archived,
      },
    );
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
    await _apiClient.putJson(
      '/api/v1/workspaces/$wsId/task-initiatives/$initiativeId',
      {
        'name': name,
        if (description != null) 'description': description,
        'status': status,
      },
    );
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
