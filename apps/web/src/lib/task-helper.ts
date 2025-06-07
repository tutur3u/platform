import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@tuturuuu/supabase/next/client';
import { createClient } from '@tuturuuu/supabase/next/client';
import {
  Task,
  TaskAssignee,
  TaskBoard,
  TaskList,
} from '@tuturuuu/types/primitives/TaskBoard';
import { toast } from '@tuturuuu/ui/hooks/use-toast';

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

export async function getTasks(supabase: SupabaseClient, boardId: string) {
  const { data: lists } = await supabase
    .from('task_lists')
    .select('id')
    .eq('board_id', boardId)
    .eq('deleted', false);

  if (!lists?.length) return [];

  const { data, error } = await supabase
    .from('tasks')
    .select(
      `
      *,
      assignees:task_assignees(
        user:users(
          id,
          display_name,
          avatar_url
        )
      )
    `
    )
    .in(
      'list_id',
      lists.map((list) => list.id)
    )
    .eq('deleted', false)
    .order('created_at');

  if (error) throw error;

  // Transform the nested assignees data
  const transformedTasks = data.map((task) => ({
    ...task,
    assignees: task.assignees
      ?.map((a: any) => a.user)
      .filter(
        (user: any, index: number, self: any[]) =>
          user &&
          user.id &&
          self.findIndex((u: any) => u.id === user.id) === index
      ),
  }));

  return transformedTasks as Task[];
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
  const { data, error } = await supabase
    .from('tasks')
    .update({ list_id: newListId })
    .eq('id', taskId)
    .select(
      `
      *,
      assignees:task_assignees(
        user:users(
          id,
          display_name,
          avatar_url
        )
      )
    `
    )
    .single();

  if (error) {
    console.error('Error moving task in database:', error);
    throw error;
  }

  // Transform the nested assignees data
  const transformedTask = {
    ...data,
    assignees: data.assignees
      ?.map((a: any) => a.user)
      .filter(
        (user: any, index: number, self: any[]) =>
          user &&
          user.id &&
          self.findIndex((u: any) => u.id === user.id) === index
      ),
  };

  return transformedTask as Task;
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

// React Query Hooks with Optimistic Updates

export function useUpdateTask(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      updates,
    }: {
      taskId: string;
      updates: Partial<Task>;
    }) => {
      const supabase = createClient();
      return updateTask(supabase, taskId, updates);
    },
    onMutate: async ({ taskId, updates }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

      // Snapshot the previous value
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      // Optimistically update the cache
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((task) =>
            task.id === taskId ? { ...task, ...updates } : task
          );
        }
      );

      return { previousTasks };
    },
    onError: (err, _, context) => {
      // Rollback optimistic update on error
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }

      console.error('Failed to update task:', err);
      toast({
        title: 'Error',
        description: 'Failed to update task. Please try again.',
        variant: 'destructive',
      });
    },
    onSuccess: (updatedTask) => {
      // Update the cache with the server response
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((task) =>
            task.id === updatedTask.id ? updatedTask : task
          );
        }
      );
    },
    onSettled: () => {
      // Ensure data consistency
      queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
    },
  });
}

export function useCreateTask(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      listId,
      task,
    }: {
      listId: string;
      task: Partial<Task>;
    }) => {
      const supabase = createClient();
      return createTask(supabase, listId, task);
    },
    onMutate: async ({ listId, task }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

      // Snapshot the previous value
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      // Create optimistic task
      const optimisticTask: Task = {
        id: `temp-${Date.now()}`,
        name: task.name || 'New Task',
        description: task.description,
        list_id: listId,
        start_date: task.start_date,
        end_date: task.end_date,
        priority: task.priority,
        archived: false,
        deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        assignees: [],
        ...task,
      } as Task;

      // Optimistically add the task to the cache
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return [optimisticTask];
          return [...old, optimisticTask];
        }
      );

      return { previousTasks, optimisticTask };
    },
    onError: (err, _, context) => {
      // Rollback optimistic update on error
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }

      console.error('Failed to create task:', err);
      toast({
        title: 'Error',
        description: 'Failed to create task. Please try again.',
        variant: 'destructive',
      });
    },
    onSuccess: (newTask, _, context) => {
      // Replace optimistic task with real task
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return [newTask];
          return old.map((task) =>
            task.id === context?.optimisticTask.id ? newTask : task
          );
        }
      );
    },
    onSettled: () => {
      // Ensure data consistency
      queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
    },
  });
}

export function useDeleteTask(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      const supabase = createClient();
      return deleteTask(supabase, taskId);
    },
    onMutate: async (taskId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

      // Snapshot the previous value
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      // Optimistically remove the task from the cache
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.filter((task) => task.id !== taskId);
        }
      );

      return { previousTasks };
    },
    onError: (err, _, context) => {
      // Rollback optimistic update on error
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }

      console.error('Failed to delete task:', err);
      toast({
        title: 'Error',
        description: 'Failed to delete task. Please try again.',
        variant: 'destructive',
      });
    },
    onSuccess: () => {
      // Task is already removed from cache optimistically
      toast({
        title: 'Success',
        description: 'Task deleted successfully.',
      });
    },
    onSettled: () => {
      // Ensure data consistency
      queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
    },
  });
}

export function useMoveTask(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      newListId,
    }: {
      taskId: string;
      newListId: string;
    }) => {
      const supabase = createClient();
      return moveTask(supabase, taskId, newListId);
    },
    onMutate: async ({ taskId, newListId }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

      // Snapshot the previous value
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      // Optimistically update the task's list_id
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((task) =>
            task.id === taskId ? { ...task, list_id: newListId } : task
          );
        }
      );

      return { previousTasks };
    },
    onError: (err, _, context) => {
      // Rollback optimistic update on error
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }

      console.error('Failed to move task:', err);
      toast({
        title: 'Error',
        description: 'Failed to move task. Please try again.',
        variant: 'destructive',
      });
    },
    onSuccess: (updatedTask) => {
      // Update the cache with the server response
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((task) =>
            task.id === updatedTask.id ? updatedTask : task
          );
        }
      );
    },
    onSettled: () => {
      // Ensure data consistency
      queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
    },
  });
}
