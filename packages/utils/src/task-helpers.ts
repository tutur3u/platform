/**
 * Utility functions for task management and calculations
 */
import { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { Active, Over } from '@dnd-kit/core';

interface Task {
  id: string;
  name: string;
  description?: string;
  priority?: TaskPriority | null;
  created_at?: string;
  updated_at?: string;
  end_date?: string | null;
  boardId: string;
  boardName: string;
  listName: string;
  listStatus?: string;
  archived?: boolean;
  completed_at?: string;
  closed_at?: string;
  finished_at?: string;
  done_at?: string;
  [key: string]: unknown;
}

interface BoardMetrics {
  id: string;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  highPriorityTasks: number;
  progressPercentage: number;
}

interface DraggableData {
  type: 'Task' | 'Column';
  task?: unknown;
  column?: unknown;
}

export function hasDraggableData(
  element: Active | Over | null
): element is Active | Over {
  if (!element) return false;
  if (!element.data?.current) return false;

  const data = element.data.current as DraggableData;

  if (data.type === 'Task' && !data.task) return false;
  if (data.type === 'Column' && !data.column) return false;

  return data.type === 'Task' || data.type === 'Column';
}


/**
 * Calculate the number of days a task is overdue
 * @param dueDate The task's due date
 * @returns Number of days the task is overdue
 */
export function calculateOverdueDays(dueDate: string | Date): number {
  const due = new Date(dueDate);
  return Math.ceil((Date.now() - due.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Safe utility to get completion date from various possible fields
 * @param task Task object with potential completion date fields
 * @returns Date object or null if no valid completion date found
 */
export function getTaskCompletionDate(task: Task): Date | null {
  const possibleFields = [
    'updated_at',
    'completed_at',
    'closed_at',
    'finished_at',
    'done_at',
  ];

  // First try to get explicit completion dates
  for (const field of possibleFields) {
    const dateStr = task[field];
    if (dateStr) {
      const date = new Date(dateStr as string);
      if (!Number.isNaN(date.getTime()) && date.getTime() > 0) {
        return date;
      }
    }
  }

  // Fallback: if task is completed but no completion date, use updated_at or created_at as estimate
  if (
    task.listStatus === 'done' ||
    task.listStatus === 'closed' ||
    task.archived
  ) {
    // Try updated_at first (might indicate when status was changed)
    if (task.updated_at) {
      const date = new Date(task.updated_at);
      if (!Number.isNaN(date.getTime()) && date.getTime() > 0) {
        return date;
      }
    }

    // Last resort: use creation date (not ideal but better than nothing)
    if (task.created_at) {
      const date = new Date(task.created_at);
      if (!Number.isNaN(date.getTime()) && date.getTime() > 0) {
        return date;
      }
    }
  }

  return null;
}

/**
 * Get status color for task visualization
 * @param status Task status string
 * @returns CSS class name for background color
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'done':
    case 'closed':
      return 'bg-green-500';
    case 'active':
      return 'bg-blue-500';
    default:
      return 'bg-gray-400';
  }
}

/**
 * Filter tasks based on board selection and status
 * @param tasks Array of tasks to filter
 * @param boardId Board ID to filter by (null for all boards)
 * @param statusFilter Status filter to apply
 * @returns Filtered array of tasks
 */
export function filterTasks(
  tasks: Task[],
  boardId: string | null,
  statusFilter: 'all' | 'not_started' | 'active' | 'done' | 'closed'
): Task[] {
  let filtered = tasks;

  // Filter by board
  if (boardId) {
    filtered = filtered.filter((task) => task.boardId === boardId);
  }

  // Filter by status
  if (statusFilter !== 'all') {
    filtered = filtered.filter((task) => {
      const taskStatus = task.listStatus || 'not_started';
      return taskStatus === statusFilter;
    });
  }

  return filtered;
}

/**
 * Group tasks by their status
 * @param tasks Array of tasks to group
 * @returns Object with tasks grouped by status
 */
export function groupTasksByStatus(tasks: Task[]): Record<string, Task[]> {
  const groups: Record<string, Task[]> = {
    not_started: [],
    active: [],
    done: [],
    closed: [],
  };

  tasks.forEach((task) => {
    if (task.archived || task.listStatus === 'done') {
      groups.done?.push(task);
    } else if (task.listStatus === 'closed') {
      groups.closed?.push(task);
    } else if (task.listStatus === 'active') {
      groups.active?.push(task);
    } else {
      groups.not_started?.push(task);
    }
  });

  return groups;
}

/**
 * Calculate filtered metrics for boards based on selection
 * @param data Array of board data
 * @param selectedBoard Board ID to filter by (null for all boards)
 * @returns Aggregated metrics
 */
export function getFilteredMetrics(
  data: BoardMetrics[],
  selectedBoard: string | null
) {
  const filteredData = selectedBoard
    ? data.filter((board) => board.id === selectedBoard)
    : data;

  const totalTasks = filteredData.reduce(
    (sum, board) => sum + board.totalTasks,
    0
  );
  const totalCompleted = filteredData.reduce(
    (sum, board) => sum + board.completedTasks,
    0
  );
  const totalOverdue = filteredData.reduce(
    (sum, board) => sum + board.overdueTasks,
    0
  );
  const totalHighPriority = filteredData.reduce(
    (sum, board) => sum + board.highPriorityTasks,
    0
  );
  const avgProgress =
    filteredData.length > 0
      ? Math.round(
          filteredData.reduce(
            (sum, board) => sum + board.progressPercentage,
            0
          ) / filteredData.length
        )
      : 0;

  return {
    totalTasks,
    totalCompleted,
    totalOverdue,
    totalHighPriority,
    avgProgress,
  };
}

import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { SupabaseClient } from '@tuturuuu/supabase/next/client';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { Task, TaskAssignee } from '@tuturuuu/types/primitives/Task';
import type {
  TaskBoard,
  TaskBoardStatus,
  TaskBoardStatusTemplate,
} from '@tuturuuu/types/primitives/TaskBoard';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { User } from '@tuturuuu/types/primitives/User';
import { toast } from '@tuturuuu/ui/hooks/use-toast';

export async function getTaskBoard(supabase: SupabaseClient, boardId: string) {
  const { data, error } = await supabase
    .from('workspace_boards')
    .select('*')
    .eq('id', boardId)
    .maybeSingle(); // Use maybeSingle instead of single to return null if no rows

  if (error) throw error;
  return data as TaskBoard | null;
}

export async function getTaskLists(supabase: SupabaseClient, boardId: string) {
  const { data, error } = await supabase
    .from('task_lists')
    .select('*')
    .eq('board_id', boardId)
    .eq('deleted', false)
    .order('position')
    .order('created_at');

  if (error) throw error;
  return data as TaskList[];
}

export async function getTasks(supabase: SupabaseClient, boardId: string) {
  try {
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

    if (error) {
      console.error('Error fetching tasks:', error);
      throw error;
    }

    // Transform the nested assignees data and ensure tags field exists
    const transformedTasks = data.map((task) => ({
      ...task,
      tags: task.tags || [], // Ensure tags field exists
      assignees: transformAssignees(
        task.assignees as (TaskAssignee & { user: User })[]
      ),
    }));

    return transformedTasks as Task[];
  } catch (error) {
    console.error('Error in getTasks:', error);
    throw error;
  }
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
  // Validate required fields
  if (!task.name || task.name.trim().length === 0) {
    throw new Error('Task name is required');
  }

  if (!listId) {
    throw new Error('List ID is required');
  }

  // First, check if user is authenticated
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    console.error('Authentication error:', authError);
    throw new Error('User not authenticated');
  }

  // Then, verify that the list exists and user has access to it
  const { data: listCheck, error: listError } = await supabase
    .from('task_lists')
    .select('id, name')
    .eq('id', listId)
    .single();

  if (listError) {
    throw new Error(
      `List not found or access denied: ${listError.message || 'Unknown error'}`
    );
  }

  if (!listCheck) {
    throw new Error('List not found');
  }

  // Prepare task data with only the fields that exist in the database
  const taskData: {
    name: string;
    description: string | null;
    list_id: string;
    priority: TaskPriority | null;
    start_date: string | null;
    end_date: string | null;
    archived: boolean;
    created_at: string;
    tags?: string[];
  } = {
    name: task.name.trim(),
    description: task.description || null,
    list_id: listId,
    priority: task.priority || null,
    start_date: task.start_date || null,
    end_date: task.end_date || null,
    archived: false,
    created_at: new Date().toISOString(),
  };

  // Handle tags separately to ensure proper formatting
  if (task.tags && Array.isArray(task.tags)) {
    // Filter out empty tags and trim whitespace
    const filteredTags = task.tags
      .filter((tag) => tag && typeof tag === 'string' && tag.trim().length > 0)
      .map((tag) => tag.trim());

    if (filteredTags.length > 0) {
      taskData.tags = filteredTags;
    }
  }

  // Now try the normal insert with the fixed database
  const { data, error } = await supabase
    .from('tasks')
    .insert(taskData)
    .select()
    .single();

  if (error) {
    // Create a more descriptive error message
    let errorMessage = 'Failed to create task';

    // Try to extract error information from various possible structures
    const errorObj = error as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
      error?: string;
    };

    if (errorObj?.message) {
      errorMessage = errorObj.message;
    } else if (errorObj?.details) {
      errorMessage = errorObj.details;
    } else if (errorObj?.hint) {
      errorMessage = errorObj.hint;
    } else if (errorObj?.code) {
      errorMessage = `Database error (${errorObj.code}): ${errorObj.message || 'Unknown database error'}`;
    } else if (errorObj?.error) {
      errorMessage = errorObj.error;
    } else if (typeof errorObj === 'string') {
      errorMessage = errorObj;
    } else {
      // If we can't extract a meaningful message, create one based on the error structure
      errorMessage = `Database operation failed: ${JSON.stringify(errorObj)}`;
    }

    // Create a new Error object with the descriptive message
    const enhancedError = new Error(errorMessage);
    enhancedError.name = 'TaskCreationError';
    (enhancedError as { originalError?: unknown }).originalError = error;

    throw enhancedError;
  }

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

  if (error) {
    throw error;
  }

  return data as Task;
}

// Utility function to transform and deduplicate assignees
export function transformAssignees(
  assignees: (TaskAssignee & { user: User })[]
): User[] {
  return (
    assignees
      ?.map((a) => a.user)
      .filter(
        (user: User, index: number, self: User[]) =>
          user?.id && self.findIndex((u: User) => u.id === user.id) === index
      ) || []
  );
}

// Utility function to invalidate all task-related caches consistently
export function invalidateTaskCaches(
  queryClient: QueryClient,
  boardId?: string
) {
  if (boardId) {
    queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
    queryClient.invalidateQueries({ queryKey: ['task_lists', boardId] });
  }
  // Always invalidate time tracker since task availability affects it
  queryClient.invalidateQueries({ queryKey: ['time-tracking-data'] });
}

// Utility function to sync task archived status with list status
export async function syncTaskArchivedStatus(
  supabase: SupabaseClient,
  taskId: string,
  listId: string
) {
  // Get the list status
  const { data: list, error: listError } = await supabase
    .from('task_lists')
    .select('status')
    .eq('id', listId)
    .single();

  if (listError) {
    console.error('Error fetching list status:', listError);
    return;
  }

  // Determine if task should be archived based on list status
  const shouldArchive = list.status === 'done' || list.status === 'closed';

  // Get current task status
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('archived')
    .eq('id', taskId)
    .single();

  if (taskError) {
    console.error('Error fetching task status:', taskError);
    return;
  }

  // Only update if there's a mismatch
  if (task.archived !== shouldArchive) {
    const { error: updateError } = await supabase
      .from('tasks')
      .update({ archived: shouldArchive })
      .eq('id', taskId);

    if (updateError) {
      console.error('Error syncing task archived status:', updateError);
    }
  }
}

export async function moveTask(
  supabase: SupabaseClient,
  taskId: string,
  newListId: string
) {
  console.log('🗄️ moveTask function called');
  console.log('📋 Task ID:', taskId);
  console.log('🎯 New List ID:', newListId);

  // First, get the target list to check its status
  console.log('🔍 Fetching target list details...');
  const { data: targetList, error: listError } = await supabase
    .from('task_lists')
    .select('status, name')
    .eq('id', newListId)
    .single();

  if (listError) {
    console.log('❌ Error fetching target list:', listError);
    throw listError;
  }

  console.log('📊 Target list details:', targetList);

  // Determine task completion status based on list status
  // - not_started, active: task is available for work (archived = false)
  // - done, closed: task is completed/archived (archived = true)
  const shouldArchive =
    targetList.status === 'done' || targetList.status === 'closed';

  console.log('📦 Should archive task:', shouldArchive);
  console.log('📊 Target list status:', targetList.status);

  console.log('🔄 Updating task in database...');
  const { data, error } = await supabase
    .from('tasks')
    .update({
      list_id: newListId,
      archived: shouldArchive,
    })
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
    console.log('❌ Error updating task:', error);
    throw error;
  }

  console.log('✅ Task updated successfully in database');
  console.log('📊 Updated task data:', data);

  // Transform the nested assignees data
  const transformedTask = {
    ...data,
    assignees: transformAssignees(
      data.assignees as (TaskAssignee & { user: User })[]
    ),
  };

  console.log('🔄 Task data transformed');
  console.log('📊 Final transformed task:', transformedTask);

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
      return await updateTask(supabase, taskId, updates);
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
          return old.map((task) => {
            if (task.id === updatedTask.id) {
              return updatedTask;
            }
            return task;
          });
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
      console.log('🚀 Starting moveTask mutation');
      console.log('📋 Task ID:', taskId);
      console.log('🎯 New List ID:', newListId);

      const supabase = createClient();
      const result = await moveTask(supabase, taskId, newListId);

      console.log('✅ moveTask completed successfully');
      console.log('📊 Result:', result);

      return result;
    },
    onMutate: async ({ taskId, newListId }) => {
      console.log('🎭 onMutate triggered - optimistic update');
      console.log('📋 Task ID:', taskId);
      console.log('🎯 New List ID:', newListId);

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

      // Snapshot the previous value
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);
      console.log('📸 Previous tasks snapshot saved');

      // Optimistically update the task's list_id and archived status
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((task) => {
            if (task.id === taskId) {
              // Get the target list to determine archived status
              const targetList = queryClient.getQueryData([
                'task-lists',
                boardId,
              ]) as TaskList[] | undefined;
              const list = targetList?.find((l) => l.id === newListId);
              const shouldArchive =
                list?.status === 'done' || list?.status === 'closed';

              console.log('🔄 Optimistically updating task:', taskId);
              console.log('📊 Target list:', list);
              console.log('📦 Should archive:', shouldArchive);

              return {
                ...task,
                list_id: newListId,
                archived: shouldArchive || false,
              };
            }
            return task;
          });
        }
      );

      console.log('✅ Optimistic update completed');
      return { previousTasks };
    },
    onError: (err, variables, context) => {
      console.log('❌ onError triggered - rollback optimistic update');
      console.log('📋 Error details:', err);
      console.log('📊 Variables:', variables);

      // Rollback optimistic update on error
      if (context?.previousTasks) {
        console.log('🔄 Rolling back to previous state');
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
      console.log(
        '✅ onSuccess triggered - updating cache with server response'
      );
      console.log('📊 Updated task from server:', updatedTask);

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

      console.log('✅ Cache updated with server response');
    },
    // Removed onSettled to prevent cache invalidation conflicts with optimistic updates
  });
}

// Status Template Functions
export async function getStatusTemplates(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('task_board_status_templates')
    .select('*')
    .order('is_default', { ascending: false })
    .order('name');

  if (error) throw error;
  return data as unknown as TaskBoardStatusTemplate[];
}

export async function createBoardWithTemplate(
  supabase: SupabaseClient,
  wsId: string,
  name: string,
  templateId?: string,
  tags?: string[]
) {
  const { data, error } = await supabase
    .from('workspace_boards')
    .insert({
      ws_id: wsId,
      name,
      template_id: templateId,
      tags: tags || [],
    })
    .select()
    .single();

  if (error) throw error;
  return data as TaskBoard;
}

export async function updateTaskListStatus(
  supabase: SupabaseClient,
  listId: string,
  status: TaskBoardStatus,
  color: SupportedColor
) {
  // Check if trying to set status to closed
  if (status === 'closed') {
    // Get the board_id first
    const { data: listData, error: listError } = await supabase
      .from('task_lists')
      .select('board_id')
      .eq('id', listId)
      .single();

    if (listError) throw listError;

    // Check if there's already a closed list
    const { data: existingClosed, error: checkError } = await supabase
      .from('task_lists')
      .select('id')
      .eq('board_id', listData.board_id)
      .eq('status', 'closed')
      .eq('deleted', false)
      .neq('id', listId);

    if (checkError) throw checkError;

    if (existingClosed && existingClosed.length > 0) {
      throw new Error('Only one closed list is allowed per board');
    }
  }

  const { data, error } = await supabase
    .from('task_lists')
    .update({ status, color })
    .eq('id', listId)
    .select()
    .single();

  if (error) throw error;
  return data as TaskList;
}

export async function reorderTaskLists(
  supabase: SupabaseClient,
  boardId: string,
  listIds: string[]
) {
  const updates = listIds.map((listId, index) => ({
    id: listId,
    position: index,
  }));

  const { error } = await supabase
    .from('task_lists')
    .upsert(updates.map((update) => ({ ...update, board_id: boardId })));

  if (error) throw error;
}

export async function getTaskListsByStatus(
  supabase: SupabaseClient,
  boardId: string
) {
  const { data, error } = await supabase
    .from('task_lists')
    .select('*')
    .eq('board_id', boardId)
    .eq('deleted', false)
    .order('position')
    .order('created_at');

  if (error) throw error;

  // Group by status
  const grouped = (data as TaskList[]).reduce(
    (acc, list) => {
      if (!acc[list.status]) {
        acc[list.status] = [];
      }
      acc[list.status].push(list);
      return acc;
    },
    {} as Record<TaskBoardStatus, TaskList[]>
  );

  return grouped;
}

// React hooks for status management
export function useStatusTemplates() {
  return useQuery({
    queryKey: ['status-templates'],
    queryFn: async () => {
      const supabase = createClient();
      return getStatusTemplates(supabase);
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useCreateBoardWithTemplate(wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      name,
      templateId,
      tags,
    }: {
      name: string;
      templateId?: string;
      tags?: string[];
    }) => {
      const supabase = createClient();
      return createBoardWithTemplate(supabase, wsId, name, templateId, tags);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-boards', wsId] });
      toast({
        title: 'Success',
        description: 'Task board created successfully',
      });
    },
    onError: (error) => {
      console.error('Error creating board:', error);
      toast({
        title: 'Error',
        description: 'Failed to create task board',
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateTaskListStatus(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      listId,
      status,
      color,
    }: {
      listId: string;
      status: TaskBoardStatus;
      color: SupportedColor;
    }) => {
      const supabase = createClient();
      return updateTaskListStatus(supabase, listId, status, color);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-lists', boardId] });
      toast({
        title: 'Success',
        description: 'List status updated successfully',
      });
    },
    onError: (error) => {
      console.error('Error updating list status:', error);
      toast({
        title: 'Error',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to update list status',
        variant: 'destructive',
      });
    },
  });
}

// Tag-related helper functions
export async function getBoardTaskTags(
  supabase: SupabaseClient,
  boardId: string
) {
  try {
    const { data, error } = await (
      supabase as SupabaseClient & {
        rpc: (
          functionName: string,
          params: Record<string, unknown>
        ) => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      }
    ).rpc('get_board_task_tags', {
      board_id: boardId,
    });

    if (error) {
      // If the RPC function doesn't exist (migration not applied), return empty array
      if (
        error.message.includes('function "get_board_task_tags" does not exist')
      ) {
        console.warn(
          'Tags migration not applied yet, returning empty tags array'
        );
        return [];
      }
      throw error;
    }
    return data || [];
  } catch (err) {
    console.warn('Error getting board task tags:', err);
    return [];
  }
}

export async function searchTasksByTags(
  supabase: SupabaseClient,
  searchTags: string[]
) {
  try {
    const { data, error } = await (
      supabase as SupabaseClient & {
        rpc: (
          functionName: string,
          params: Record<string, unknown>
        ) => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      }
    ).rpc('search_tasks_by_tags', {
      search_tags: searchTags,
    });

    if (error) {
      // If the RPC function doesn't exist (migration not applied), return empty array
      if (
        error.message.includes('function "search_tasks_by_tags" does not exist')
      ) {
        console.warn(
          'Tags migration not applied yet, returning empty search results'
        );
        return [];
      }
      throw error;
    }
    return data || [];
  } catch (err) {
    console.warn('Error searching tasks by tags:', err);
    return [];
  }
}

export async function getTasksWithTagFilter(
  supabase: SupabaseClient,
  boardId: string,
  tags: string[]
) {
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
    .overlaps('tags', tags) // Filter tasks that have any of the specified tags
    .order('created_at');

  if (error) throw error;

  // Transform the nested assignees data
  const transformedTasks = data.map((task) => ({
    ...task,
    assignees: task.assignees
      ?.map((a) => a.user)
      .filter(
        (user: User, index: number, self: User[]) =>
          user?.id && self.findIndex((u: User) => u.id === user.id) === index
      ),
  }));

  return transformedTasks as Task[];
}

// React hooks for tag management
export function useBoardTaskTags(boardId: string) {
  return useQuery({
    queryKey: ['board-task-tags', boardId],
    queryFn: async () => {
      const supabase = createClient();
      return getBoardTaskTags(supabase, boardId);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function priorityCompare(
  priorityA: TaskPriority | null,
  priorityB: TaskPriority | null
) {
  const priorityOrder = {
    critical: 4,
    high: 3,
    normal: 2,
    low: 1,
  };

  if (!priorityA || !priorityB) return 0;
  if (!priorityA) return -priorityOrder[priorityB];
  if (!priorityB) return priorityOrder[priorityA];

  return priorityOrder[priorityA] - priorityOrder[priorityB];
}

