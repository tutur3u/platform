import 'package:mobile/data/models/task.dart';
import 'package:mobile/data/sources/supabase_client.dart';

/// Repository for task operations.
class TaskRepository {
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
    await supabase
        .from('workspace_tasks')
        .update(data)
        .eq('id', taskId);
  }

  Future<void> deleteTask(String taskId) async {
    await supabase.from('workspace_tasks').delete().eq('id', taskId);
  }
}
