import {
  Task,
  TaskAssignee,
  TaskBoard,
  TaskList,
} from '@/types/primitives/TaskBoard';
import { SupabaseClient } from '@supabase/supabase-js';

export async function getTaskBoard(supabase: SupabaseClient, boardId: string) {
  const { data, error } = await supabase
    .from('workspace_boards')
    .select('*')
    .eq('id', boardId)
    .single();

  if (error) throw error;
  return data as TaskBoard;
}

export async function getTaskLists(supabase: SupabaseClient, boardId: string) {
  const { data, error } = await supabase
    .from('task_lists')
    .select('*')
    .eq('board_id', boardId)
    .eq('deleted', false)
    .order('created_at');

  if (error) throw error;
  return data as TaskList[];
}

export async function getTasks(supabase: SupabaseClient, listId: string) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('list_id', listId)
    .eq('deleted', false)
    .order('created_at');

  if (error) throw error;
  return data as Task[];
}

export async function getTaskAssignees(
  supabase: SupabaseClient,
  taskId: string
) {
  const { data, error } = await supabase
    .from('task_assignees')
    .select('*')
    .eq('task_id', taskId);

  if (error) throw error;
  return data as TaskAssignee[];
}

export async function createTaskList(
  supabase: SupabaseClient,
  boardId: string,
  name: string
) {
  const { data, error } = await supabase
    .from('task_lists')
    .insert({ board_id: boardId, name })
    .select()
    .single();

  if (error) throw error;
  return data as TaskList;
}

export async function createTask(
  supabase: SupabaseClient,
  listId: string,
  task: Partial<Task>
) {
  const { data, error } = await supabase
    .from('tasks')
    .insert({ ...task, list_id: listId })
    .select()
    .single();

  if (error) throw error;
  return data as Task;
}

export async function updateTask(
  supabase: SupabaseClient,
  taskId: string,
  task: Partial<Task>
) {
  const { data, error } = await supabase
    .from('tasks')
    .update(task)
    .eq('id', taskId)
    .select()
    .single();

  if (error) throw error;
  return data as Task;
}

export async function moveTask(
  supabase: SupabaseClient,
  taskId: string,
  newListId: string
) {
  console.log('Moving task in database:', { taskId, newListId });

  const { data, error } = await supabase
    .from('tasks')
    .update({ list_id: newListId })
    .eq('id', taskId)
    .select()
    .single();

  if (error) {
    console.error('Error moving task in database:', error);
    throw error;
  }

  console.log('Successfully moved task in database:', data);
  return data as Task;
}

export async function assignTask(
  supabase: SupabaseClient,
  taskId: string,
  userId: string
) {
  const { error } = await supabase
    .from('task_assignees')
    .insert({ task_id: taskId, user_id: userId });

  if (error) throw error;
}

export async function unassignTask(
  supabase: SupabaseClient,
  taskId: string,
  userId: string
) {
  const { error } = await supabase
    .from('task_assignees')
    .delete()
    .eq('task_id', taskId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function deleteTask(supabase: SupabaseClient, taskId: string) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ deleted: true })
    .eq('id', taskId)
    .select()
    .single();

  if (error) throw error;
  return data as Task;
}

export async function deleteTaskList(supabase: SupabaseClient, listId: string) {
  const { data, error } = await supabase
    .from('task_lists')
    .update({ deleted: true })
    .eq('id', listId)
    .select()
    .single();

  if (error) throw error;
  return data as TaskList;
}
