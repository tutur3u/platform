import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { WorkspaceTask } from '@tuturuuu/types';

import { queryKeys, type TaskFilters } from '@/lib/query';
import { supabase } from '@/lib/supabase';

// Explicit types for task data with relations
export type TaskWithRelations = WorkspaceTask & {
  list?: {
    id: string;
    name: string | null;
    board?: {
      id: string;
      name: string | null;
      ws_id: string;
    } | null;
  } | null;
  assignees?: Array<{
    user?: {
      id: string;
      display_name: string | null;
      avatar_url: string | null;
    } | null;
  }> | null;
};

/**
 * Fetch tasks for a workspace with optional filters
 */
export function useTasks(wsId: string | undefined, filters?: TaskFilters) {
  return useQuery<TaskWithRelations[]>({
    queryKey: queryKeys.tasks.list(wsId ?? '', filters),
    queryFn: async () => {
      if (!wsId) return [];

      let query = supabase
        .from('tasks')
        .select(
          `
          *,
          list:task_lists (
            id,
            name,
            board:workspace_boards (
              id,
              name,
              ws_id
            )
          ),
          assignees:task_assignees (
            user:users (
              id,
              display_name,
              avatar_url
            )
          )
        `
        )
        .eq('list.board.ws_id', wsId)
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters?.status) {
        query = query.eq('list.name', filters.status);
      }
      if (filters?.priority) {
        query = query.eq('priority', filters.priority);
      }
      if (filters?.boardId) {
        query = query.eq('list.board_id', filters.boardId);
      }
      if (filters?.listId) {
        query = query.eq('list_id', filters.listId);
      }
      if (filters?.search) {
        query = query.ilike('name', `%${filters.search}%`);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []) as TaskWithRelations[];
    },
    enabled: !!wsId,
  });
}

/**
 * Fetch a single task by ID
 */
export function useTask(wsId: string | undefined, taskId: string | undefined) {
  return useQuery<TaskWithRelations | null>({
    queryKey: queryKeys.tasks.detail(wsId ?? '', taskId ?? ''),
    queryFn: async () => {
      if (!wsId || !taskId) return null;

      const { data, error } = await supabase
        .from('tasks')
        .select(
          `
          *,
          list:task_lists (
            id,
            name,
            board:workspace_boards (
              id,
              name,
              ws_id
            )
          ),
          assignees:task_assignees (
            user:users (
              id,
              display_name,
              avatar_url
            )
          )
        `
        )
        .eq('id', taskId)
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data as TaskWithRelations;
    },
    enabled: !!wsId && !!taskId,
  });
}

/**
 * Fetch task boards for a workspace
 */
export function useTaskBoards(wsId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.tasks.boards(wsId ?? ''),
    queryFn: async () => {
      if (!wsId) return [];

      const { data, error } = await supabase
        .from('workspace_boards')
        .select(
          `
          id,
          name,
          created_at,
          lists:task_lists (
            id,
            name
          )
        `
        )
        .eq('ws_id', wsId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      return data ?? [];
    },
    enabled: !!wsId,
  });
}

/**
 * Task mutation hooks
 */
export function useTaskMutations(wsId: string) {
  const queryClient = useQueryClient();

  const createTask = useMutation({
    mutationFn: async (task: Partial<WorkspaceTask> & { list_id: string }) => {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          name: task.name ?? 'Untitled Task',
          description: task.description,
          priority: task.priority,
          list_id: task.list_id,
          start_date: task.start_date,
          end_date: task.end_date,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all(wsId) });
    },
  });

  const updateTask = useMutation({
    mutationFn: async ({
      taskId,
      updates,
    }: {
      taskId: string;
      updates: Partial<WorkspaceTask>;
    }) => {
      const { data, error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', taskId)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.tasks.detail(wsId, variables.taskId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all(wsId) });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', taskId);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all(wsId) });
    },
  });

  return {
    createTask,
    updateTask,
    deleteTask,
  };
}
