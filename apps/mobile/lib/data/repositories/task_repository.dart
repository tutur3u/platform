import 'package:mobile/data/models/task.dart';
import 'package:mobile/data/models/task_estimate_board.dart';
import 'package:mobile/data/models/task_initiative_summary.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/supabase_client.dart';

/// Repository for task operations.
class TaskRepository {
  TaskRepository({ApiClient? apiClient})
    : _apiClient = apiClient ?? ApiClient();

  final ApiClient _apiClient;

  /// Fetches user-accessible tasks via the same RPC the web app uses.
  ///
  /// When [isPersonal] is true, [wsId] is omitted so the RPC returns tasks
  /// across all workspaces the user belongs to.
  Future<List<UserTask>> getUserTasks({
    required String userId,
    required String wsId,
    required bool isPersonal,
  }) async {
    // 1. Call the RPC
    final rpcResponse = await supabase.rpc<List<dynamic>>(
      'get_user_accessible_tasks',
      params: {
        'p_user_id': userId,
        if (!isPersonal) 'p_ws_id': wsId,
        'p_include_deleted': false,
        'p_list_statuses': ['not_started', 'active', 'done'],
      },
    );

    final tasks = rpcResponse
        .map((e) => UserTask.fromRpcJson(e as Map<String, dynamic>))
        .toList();

    // 2. Fetch list → board → workspace relations
    final listIds = tasks
        .map((t) => t.listId)
        .where((id) => id != null)
        .toSet()
        .toList();

    if (listIds.isEmpty) return tasks;

    final listsResponse = await supabase
        .from('task_lists')
        .select('''
          id, name, status,
          board:workspace_boards!inner(
            id, name, ws_id,
            workspaces(id, name, personal)
          )
        ''')
        .inFilter('id', listIds);

    final listsData = (listsResponse as List<dynamic>?) ?? [];
    final listsById = <String, TaskListInfo>{};
    for (final raw in listsData) {
      final json = raw as Map<String, dynamic>;
      final info = TaskListInfo.fromJson(json);
      listsById[info.id] = info;
    }

    // 3. Merge list info onto tasks
    return tasks.map((t) => t.withList(listsById[t.listId])).toList();
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

  Future<List<TaskProjectSummary>> getTaskProjects(String wsId) async {
    final response = await _apiClient.getJsonList(
      '/api/v1/workspaces/$wsId/task-projects',
    );

    return response
        .whereType<Map<String, dynamic>>()
        .map(TaskProjectSummary.fromJson)
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
}
