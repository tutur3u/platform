import 'package:mobile/data/models/task.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/data/sources/supabase_client.dart';

/// Repository for task operations.
class TaskRepository {
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
}
