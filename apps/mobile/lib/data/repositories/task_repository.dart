import 'package:mobile/data/models/task.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/task_board_summary.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/task_boards_page.dart';
import 'package:mobile/data/models/task_estimate_board.dart';
import 'package:mobile/data/models/task_initiative_summary.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/data/models/task_link_option.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/models/task_project_update.dart';
import 'package:mobile/data/models/user_tasks_page.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/tasks_estimates/utils/task_label_colors.dart';

/// Repository for task operations.
class TaskRepository {
  TaskRepository({ApiClient? apiClient})
    : _apiClient = apiClient ?? ApiClient();

  final ApiClient _apiClient;

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

  Future<List<Task>> getTasks(String wsId) async {
    final response = await supabase
        .from('workspace_tasks')
        .select()
        .eq('ws_id', wsId)
        .order('created_at', ascending: false);

    return (response as List<dynamic>)
        .map((e) => Task.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Task?> getTaskById(String taskId) async {
    final response = await supabase
        .from('workspace_tasks')
        .select()
        .eq('id', taskId)
        .maybeSingle();

    if (response == null) return null;
    return Task.fromJson(response);
  }

  Future<Task> createTask(String wsId, Map<String, dynamic> data) async {
    final response = await supabase
        .from('workspace_tasks')
        .insert({...data, 'ws_id': wsId})
        .select()
        .single();

    return Task.fromJson(response);
  }

  Future<void> updateTask(String taskId, Map<String, dynamic> data) async {
    await supabase.from('workspace_tasks').update(data).eq('id', taskId);
  }

  Future<void> deleteTask(String taskId) async {
    await supabase.from('workspace_tasks').delete().eq('id', taskId);
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
      getBoardLists(boardId),
      getBoardTasks(wsId, boardId),
      getTaskLabels(wsId),
      getWorkspaceUsers(wsId),
      getTaskProjects(wsId),
    ]);

    return (results[0] as TaskBoardDetail).copyWith(
      lists: results[1] as List<TaskBoardList>,
      tasks: results[2] as List<TaskBoardTask>,
      labels: results[3] as List<TaskLabel>,
      members: results[4] as List<WorkspaceUserOption>,
      projects: results[5] as List<TaskProjectSummary>,
    );
  }

  Future<List<TaskBoardTask>> getBoardTasks(
    String wsId,
    String boardId, {
    int pageSize = 200,
  }) async {
    final normalizedPageSize = pageSize.clamp(1, 200);
    final tasks = <TaskBoardTask>[];
    var offset = 0;

    while (true) {
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

  Future<List<TaskBoardList>> getBoardLists(String boardId) async {
    final response = await supabase
        .from('task_lists')
        .select('id, board_id, name, status, color, position, archived')
        .eq('board_id', boardId)
        .eq('deleted', false)
        .order('position', ascending: true)
        .order('created_at', ascending: true);

    return (response as List<dynamic>)
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
    required String taskId,
    String? name,
    String? description,
    String? priority,
    DateTime? startDate,
    DateTime? endDate,
    bool? completed,
  }) async {
    final updatePayload = <String, dynamic>{
      if (name != null) 'name': name,
      if (description != null) 'description': description,
      if (priority != null) 'priority': priority,
      if (startDate != null) 'start_date': startDate.toUtc().toIso8601String(),
      if (endDate != null) 'end_date': endDate.toUtc().toIso8601String(),
      if (completed != null) 'completed': completed,
    };

    if (updatePayload.isEmpty) {
      throw const ApiException(
        message: 'No task fields provided for update',
        statusCode: 400,
      );
    }

    final response = await supabase
        .from('tasks')
        .update(updatePayload)
        .eq('id', taskId)
        .select(
          'id, list_id, name, description, priority, completed, '
          'start_date, end_date, created_at, closed_at',
        )
        .single();

    return TaskBoardTask.fromJson(response);
  }

  Future<TaskBoardTask> moveBoardTask({
    required String taskId,
    required String listId,
  }) async {
    final response = await supabase
        .from('tasks')
        .update({'list_id': listId})
        .eq('id', taskId)
        .select(
          'id, list_id, name, description, priority, completed, '
          'start_date, end_date, created_at, closed_at',
        )
        .single();

    return TaskBoardTask.fromJson(response);
  }

  Future<TaskBoardList> createBoardList({
    required String boardId,
    required String name,
    String status = 'not_started',
  }) async {
    final response = await supabase
        .from('task_lists')
        .insert({
          'board_id': boardId,
          'name': name,
          'status': status,
          'deleted': false,
        })
        .select('id, board_id, name, status, color, position, archived')
        .single();

    return TaskBoardList.fromJson(response);
  }

  Future<TaskBoardList> renameBoardList({
    required String listId,
    required String name,
  }) async {
    final response = await supabase
        .from('task_lists')
        .update({'name': name})
        .eq('id', listId)
        .select('id, board_id, name, status, color, position, archived')
        .single();

    return TaskBoardList.fromJson(response);
  }

  Future<TaskBoardDetail> _getTaskBoardMetadata(
    String wsId,
    String boardId,
  ) async {
    final boardsPage = await getTaskBoards(wsId, pageSize: 200);

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
        createdAt: targetBoard.createdAt,
        archivedAt: targetBoard.archivedAt,
        deletedAt: targetBoard.deletedAt,
      );
    }

    final fallbackBoard = await supabase
        .from('workspace_boards')
        .select('id, ws_id, name, icon, created_at, archived_at, deleted_at')
        .eq('ws_id', wsId)
        .eq('id', boardId)
        .maybeSingle();

    if (fallbackBoard == null) {
      throw const ApiException(message: 'Board not found', statusCode: 404);
    }

    return TaskBoardDetail.fromJson(fallbackBoard);
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
    if (normalizedColor == null || !isTaskLabelColorPreset(normalizedColor)) {
      throw const FormatException('Invalid task label color preset');
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
    if (normalizedColor == null || !isTaskLabelColorPreset(normalizedColor)) {
      throw const FormatException('Invalid task label color preset');
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
