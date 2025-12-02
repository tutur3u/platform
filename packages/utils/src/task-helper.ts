import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { isTaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { Task, TaskAssignee } from '@tuturuuu/types/primitives/Task';
import type {
  TaskBoardStatus,
  TaskBoardStatusTemplate,
} from '@tuturuuu/types/primitives/TaskBoard';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type {
  CreateTaskRelationshipInput,
  CreateTaskWithRelationshipInput,
  CreateTaskWithRelationshipResult,
  RelatedTaskInfo,
  TaskRelationship,
  TaskRelationshipsResponse,
  TaskRelationshipType,
} from '@tuturuuu/types/primitives/TaskRelationship';
import type { User } from '@tuturuuu/types/primitives/User';
/**
 * Generate a human-readable ticket identifier from prefix and display number
 * @param prefix - Board's ticket prefix (e.g., "DEV", "BUG")
 * @param displayNumber - Task's sequential display number
 * @returns Formatted ticket identifier (e.g., "DEV-42", "TASK-1")
 */
export function getTicketIdentifier(
  prefix: string | null | undefined,
  displayNumber: number
): string {
  const effectivePrefix = prefix?.trim() || 'TASK';
  return `${effectivePrefix}-${displayNumber}`.toUpperCase();
}

export async function getTaskBoard(
  supabase: TypedSupabaseClient,
  boardId: string
) {
  const { data, error } = await supabase
    .from('workspace_boards')
    .select('*')
    .eq('id', boardId)
    .maybeSingle(); // Use maybeSingle instead of single to return null if no rows

  if (error) throw error;
  return data as WorkspaceTaskBoard | null;
}

export async function getTaskLists(
  supabase: TypedSupabaseClient,
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
  return data as TaskList[];
}

export async function getTasks(supabase: TypedSupabaseClient, boardId: string) {
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
          ),
          labels:task_labels(
            label:workspace_task_labels(
              id,
              name,
              color,
              created_at
            )
          ),
          projects:task_project_tasks(
            project:task_projects(
              id,
              name,
              status
            )
          )
        `
      )
      .in(
        'list_id',
        lists.map((list) => list.id)
      )
      .is('deleted_at', null)
      .order('sort_key', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching tasks:', error);
      throw error;
    }

    return data.map((task) => transformTaskRecord(task));
  } catch (error) {
    console.error('Error in getTasks:', error);
    throw error;
  }
}

export async function getTaskAssignees(
  supabase: TypedSupabaseClient,
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
  supabase: TypedSupabaseClient,
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
  supabase: TypedSupabaseClient,
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

  // Get the highest sort_key in the list to place new task at the end
  const { data: existingTasks, error: tasksError } = await supabase
    .from('tasks')
    .select('sort_key')
    .eq('list_id', listId)
    .is('deleted_at', null)
    .order('sort_key', { ascending: false })
    .limit(1);

  if (tasksError) {
    console.error('Error fetching existing tasks for sort key:', tasksError);
  }

  // Calculate the sort key for the new task (placed at the end of the list)
  const highestSortKey = existingTasks?.[0]?.sort_key ?? null;
  const newSortKey = calculateSortKey(highestSortKey, null);

  // Prepare task data with only the fields that exist in the database
  // Note: display_number and board_id are auto-assigned by database trigger
  const taskData = {
    name: task.name.trim(),
    description: task.description || null,
    list_id: listId,
    priority: task.priority || null,
    start_date: task.start_date || null,
    end_date: task.end_date || null,
    estimation_points: task.estimation_points ?? null,
    sort_key: newSortKey,
    created_at: new Date().toISOString(),
    // Scheduling fields
    total_duration: task.total_duration ?? null,
    is_splittable: task.is_splittable ?? false,
    min_split_duration_minutes: task.min_split_duration_minutes ?? null,
    max_split_duration_minutes: task.max_split_duration_minutes ?? null,
    calendar_hours: task.calendar_hours ?? null,
    auto_schedule: task.auto_schedule ?? false,
  };

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

  // Generate embedding in development mode (client-side)
  // Note: We always call the endpoint - it will check DEV_MODE and API key availability server-side
  if (typeof window !== 'undefined' && data) {
    // Get workspace ID from URL (format: /[locale]/[wsId]/...)
    const pathParts = window.location.pathname.split('/');
    const wsId = pathParts[2]; // Assuming format /[locale]/[wsId]/...

    if (wsId) {
      // Call the embedding generation endpoint asynchronously (non-blocking)
      // The endpoint will only generate embeddings if in dev mode with API key
      fetch(`/api/v1/workspaces/${wsId}/tasks/${data.id}/embedding`, {
        method: 'POST',
      }).catch((err) => {
        console.error('Failed to generate embedding:', err);
      });
    }
  }

  return data as Task;
}

export async function updateTask(
  supabase: TypedSupabaseClient,
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

  // If name or description was updated, regenerate embedding
  // Note: We always call the endpoint - it will check DEV_MODE and API key availability server-side
  if (
    (task.name !== undefined || task.description !== undefined) &&
    typeof window !== 'undefined' &&
    data
  ) {
    // Get workspace ID from URL (format: /[wsId]/...)
    const pathParts = window.location.pathname.split('/');
    const wsId = pathParts[1]; // Assuming format /[wsId]/...

    if (wsId) {
      // Call the embedding generation endpoint asynchronously (non-blocking)
      // The endpoint will only generate embeddings if in dev mode with API key
      fetch(`/api/v1/workspaces/${wsId}/tasks/${taskId}/embedding`, {
        method: 'POST',
      }).catch((err) => {
        console.error('Failed to regenerate embedding:', err);
      });
    }
  }

  return data as Task;
}

// Utility function to transform and deduplicate assignees
// Returns user objects with user_id included for consistency with workspace members
export function transformAssignees(
  assignees: (TaskAssignee & { user: User })[]
): (User & { user_id: string })[] {
  return (
    assignees
      ?.map((a) => ({
        ...a.user,
        user_id: a.user?.id || '', // Include user_id for consistency with workspace members structure
      }))
      .filter(
        (user, index: number, self) =>
          user?.id && self.findIndex((u) => u.id === user.id) === index
      ) || []
  );
}

type TaskLabelEntry = {
  label?: NonNullable<Task['labels']>[number] | null;
};

type TaskProjectEntry = {
  project?: NonNullable<Task['projects']>[number] | null;
};

function transformTaskRecord(task: any): Task {
  const normalizedLabels =
    (task.labels as TaskLabelEntry[] | null | undefined)
      ?.map((entry) => entry.label)
      .filter((label): label is NonNullable<Task['labels']>[number] =>
        Boolean(label)
      ) ?? [];

  const normalizedProjects =
    (task.projects as TaskProjectEntry[] | null | undefined)
      ?.map((entry) => entry.project)
      .filter((project): project is NonNullable<Task['projects']>[number] =>
        Boolean(project)
      ) ?? [];

  return {
    ...task,
    assignees: transformAssignees(
      task.assignees as (TaskAssignee & { user: User })[]
    ),
    labels: normalizedLabels,
    projects: normalizedProjects,
  } as Task;
}

// Utility function to invalidate all task-related caches consistently
export async function invalidateTaskCaches(
  queryClient: QueryClient,
  boardId?: string
) {
  const promises: Promise<void>[] = [];

  if (boardId) {
    promises.push(
      queryClient.invalidateQueries({ queryKey: ['tasks', boardId] })
    );
    promises.push(
      queryClient.invalidateQueries({ queryKey: ['task_lists', boardId] })
    );
  }
  // Always invalidate time tracker since task availability affects it
  promises.push(
    queryClient.invalidateQueries({ queryKey: ['time-tracking-data'] })
  );

  await Promise.all(promises);
}

// Utility function to sync task archived status with list status
export async function syncTaskArchivedStatus(
  supabase: TypedSupabaseClient,
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
    .select('closed_at')
    .eq('id', taskId)
    .single();

  if (taskError) {
    console.error('Error fetching task status:', taskError);
    return;
  }

  // Only update if there's a mismatch
  if (!!task.closed_at !== shouldArchive) {
    const { error: updateError } = await supabase
      .from('tasks')
      .update({ closed_at: shouldArchive ? new Date().toISOString() : null })
      .eq('id', taskId);

    if (updateError) {
      console.error('Error syncing task archived status:', updateError);
    }
  }
}

export async function moveTask(
  supabase: TypedSupabaseClient,
  taskId: string,
  newListId: string
) {
  console.log('🗄️ moveTask function called');
  console.log('📋 Task ID:', taskId);
  console.log('🎯 New List ID:', newListId);

  // First, get the current task details including its current archived status and source list
  console.log('🔍 Fetching current task details...');
  const { data: currentTask, error: taskError } = await supabase
    .from('tasks')
    .select(`
      id,
      list_id,
      closed_at,
      task_lists!inner(status, name)
    `)
    .eq('id', taskId)
    .single();

  if (taskError) {
    console.log('❌ Error fetching current task:', taskError);
    throw taskError;
  }

  console.log('📊 Current task details:', currentTask);

  // Get the target list to check its status
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

  // Determine task completion status based on improved logic:
  // 1. If moving TO a "done"/"closed" list: archive the task
  // 2. If moving FROM a "done"/"closed" list to any other list: unarchive the task
  // 3. If moving between non-done lists: preserve current archived status
  const sourceListStatus = currentTask.task_lists.status;
  const targetListStatus = targetList.status;
  const currentlyArchived = !!currentTask.closed_at;

  let shouldArchive: boolean;

  if (targetListStatus === 'done' || targetListStatus === 'closed') {
    // Moving TO a completion list - always archive
    shouldArchive = true;
    console.log('📦 Moving to completion list, will archive task');
  } else if (sourceListStatus === 'done' || sourceListStatus === 'closed') {
    // Moving FROM a completion list to a non-completion list - always unarchive
    shouldArchive = false;
    console.log('📦 Moving from completion list, will unarchive task');
  } else {
    // Moving between non-completion lists - preserve current status
    shouldArchive = currentlyArchived || false;
    console.log(
      '📦 Moving between non-completion lists, preserving current status:',
      currentlyArchived
    );
  }

  console.log('📊 Source list status:', sourceListStatus);
  console.log('📊 Target list status:', targetListStatus);
  console.log('📊 Currently archived:', currentlyArchived);
  console.log('📦 Will archive:', shouldArchive);

  console.log('🔄 Updating task in database...');
  const { data, error } = await supabase
    .from('tasks')
    .update({
      list_id: newListId,
      closed_at: shouldArchive ? new Date().toISOString() : null,
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
        ),
        labels:task_labels(
          label:workspace_task_labels(
            id,
            name,
            color,
            created_at
          )
        ),
        projects:task_project_tasks(
          project:task_projects(
            id,
            name,
            status
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
  const transformedTask = transformTaskRecord(data);

  console.log('🔄 Task data transformed');
  console.log('📊 Final transformed task:', transformedTask);

  return transformedTask as Task;
}

export async function moveTaskToBoard(
  supabase: TypedSupabaseClient,
  taskId: string,
  newListId: string,
  targetBoardId?: string
) {
  console.log('🗄️ moveTaskToBoard function called');
  console.log('📋 Task ID:', taskId);
  console.log('🎯 New List ID:', newListId);
  console.log('📊 Target Board ID:', targetBoardId);

  // First, get the current task details including its current archived status and source list
  console.log('🔍 Fetching current task details...');
  const { data: currentTask, error: taskError } = await supabase
    .from('tasks')
    .select(`
      id,
      list_id,
      closed_at,
      task_lists!inner(status, name, board_id)
    `)
    .eq('id', taskId)
    .single();

  if (taskError) {
    console.log('❌ Error fetching current task:', taskError);
    throw taskError;
  }

  console.log('📊 Current task details:', currentTask);

  // Get the target list to check its status and board
  console.log('🔍 Fetching target list details...');
  const { data: targetList, error: listError } = await supabase
    .from('task_lists')
    .select('status, name, board_id')
    .eq('id', newListId)
    .single();

  if (listError) {
    console.log('❌ Error fetching target list:', listError);
    throw listError;
  }

  console.log('📊 Target list details:', targetList);

  // Check if we're moving to a different board
  const currentBoardId = currentTask.task_lists.board_id;
  const isMovingToNewBoard = targetList.board_id !== currentBoardId;

  console.log('🏠 Current board ID:', currentBoardId);
  console.log('🏠 Target board ID:', targetList.board_id);
  console.log('🔄 Moving to new board:', isMovingToNewBoard);

  // Determine task completion status based on improved logic:
  // 1. If moving TO a "done"/"closed" list: archive the task
  // 2. If moving FROM a "done"/"closed" list to any other list: unarchive the task
  // 3. If moving between non-done lists: preserve current archived status
  const sourceListStatus = currentTask.task_lists.status;
  const targetListStatus = targetList.status;
  const currentlyArchived = !!currentTask.closed_at;

  let shouldArchive: boolean;

  if (targetListStatus === 'done' || targetListStatus === 'closed') {
    // Moving TO a completion list - always archive
    shouldArchive = true;
    console.log('📦 Moving to completion list, will archive task');
  } else if (sourceListStatus === 'done' || sourceListStatus === 'closed') {
    // Moving FROM a completion list to a non-completion list - always unarchive
    shouldArchive = false;
    console.log('📦 Moving from completion list, will unarchive task');
  } else {
    // Moving between non-completion lists - preserve current status
    shouldArchive = currentlyArchived || false;
    console.log(
      '📦 Moving between non-completion lists, preserving current status:',
      currentlyArchived
    );
  }

  console.log('📊 Source list status:', sourceListStatus);
  console.log('📊 Target list status:', targetListStatus);
  console.log('📊 Currently archived:', currentlyArchived);
  console.log('📦 Will archive:', shouldArchive);

  console.log('🔄 Updating task in database...');
  const { data, error } = await supabase
    .from('tasks')
    .update({
      list_id: newListId,
      closed_at: shouldArchive ? new Date().toISOString() : null,
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
        ),
        labels:task_labels(
          label:workspace_task_labels(
            id,
            name,
            color,
            created_at
          )
        ),
        projects:task_project_tasks(
          project:task_projects(
            id,
            name,
            status
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
  const transformedTask = transformTaskRecord(data);

  console.log('🔄 Task data transformed');
  console.log('📊 Final transformed task:', transformedTask);

  return {
    task: transformedTask as Task,
    movedToDifferentBoard: isMovingToNewBoard,
    sourceBoardId: currentBoardId,
    targetBoardId: targetList.board_id,
  };
}

export async function assignTask(
  supabase: TypedSupabaseClient,
  taskId: string,
  userId: string
) {
  const { error } = await supabase
    .from('task_assignees')
    .insert({ task_id: taskId, user_id: userId });

  if (error) throw error;
}

export async function unassignTask(
  supabase: TypedSupabaseClient,
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

export async function deleteTask(
  supabase: TypedSupabaseClient,
  taskId: string
) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', taskId)
    .select()
    .single();

  if (error) throw error;
  return data as Task;
}

export async function deleteTaskList(
  supabase: TypedSupabaseClient,
  listId: string
) {
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
    },
    onSuccess: (updatedTask) => {
      // Update the cache with the server response
      // Preserve joined data (assignees, labels, projects) from cache since updateTask doesn't fetch them
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((task) => {
            if (task.id === updatedTask.id) {
              return {
                ...updatedTask,
                // Preserve joined data from cache
                assignees: task.assignees,
                labels: task.labels,
                projects: task.projects,
              };
            }
            return task;
          });
        }
      );
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
        closed_at: null,
        deleted_at: null,
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
      const previousTasks = queryClient.getQueryData(['tasks', boardId]) as
        | Task[]
        | undefined;

      // Find the task being deleted to store it for potential undo
      const deletedTask = previousTasks?.find((task) => task.id === taskId);

      // Optimistically remove the task from the cache
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.filter((task) => task.id !== taskId);
        }
      );

      return { previousTasks, deletedTask };
    },
    onError: (err, _, context) => {
      // Rollback optimistic update on error
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }

      console.error('Failed to delete task:', err);
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
                closed_at: shouldArchive ? new Date().toISOString() : null,
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

export function useMoveTaskToBoard(currentBoardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      newListId,
      targetBoardId,
    }: {
      taskId: string;
      newListId: string;
      targetBoardId?: string;
    }) => {
      console.log('🚀 Starting moveTaskToBoard mutation');
      console.log('📋 Task ID:', taskId);
      console.log('🎯 New List ID:', newListId);
      console.log('📊 Target Board ID:', targetBoardId);

      const supabase = createClient();
      const result = await moveTaskToBoard(
        supabase,
        taskId,
        newListId,
        targetBoardId
      );

      console.log('✅ moveTaskToBoard completed successfully');
      console.log('📊 Result:', result);

      return result;
    },
    onMutate: async ({ taskId, newListId, targetBoardId }) => {
      console.log('🎭 onMutate triggered - optimistic update');
      console.log('📋 Task ID:', taskId);
      console.log('🎯 New List ID:', newListId);
      console.log('📊 Target Board ID:', targetBoardId);

      // Cancel any outgoing refetches for both boards
      await queryClient.cancelQueries({ queryKey: ['tasks', currentBoardId] });
      if (targetBoardId && targetBoardId !== currentBoardId) {
        await queryClient.cancelQueries({ queryKey: ['tasks', targetBoardId] });
      }

      // Snapshot the previous values
      const previousCurrentBoardTasks = queryClient.getQueryData([
        'tasks',
        currentBoardId,
      ]);
      const previousTargetBoardTasks =
        targetBoardId && targetBoardId !== currentBoardId
          ? queryClient.getQueryData(['tasks', targetBoardId])
          : null;

      console.log('📸 Previous tasks snapshots saved');

      // If moving to a different board, remove task from current board's cache
      if (targetBoardId && targetBoardId !== currentBoardId) {
        console.log('🔄 Removing task from current board cache');
        queryClient.setQueryData(
          ['tasks', currentBoardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.filter((task) => task.id !== taskId);
          }
        );

        // Add task to target board's cache if it exists
        queryClient.setQueryData(
          ['tasks', targetBoardId],
          (old: Task[] | undefined) => {
            if (!old) return old;

            // Find the task in the current board to add to target board
            const currentBoardTasks = previousCurrentBoardTasks as
              | Task[]
              | undefined;
            const taskToMove = currentBoardTasks?.find((t) => t.id === taskId);

            if (!taskToMove) return old;

            // Get the target list to determine archived status
            const targetList = queryClient.getQueryData([
              'task_lists',
              targetBoardId,
            ]) as TaskList[] | undefined;
            const list = targetList?.find((l) => l.id === newListId);
            const shouldArchive =
              list?.status === 'done' || list?.status === 'closed';

            const updatedTask = {
              ...taskToMove,
              list_id: newListId,
              closed_at: shouldArchive ? new Date().toISOString() : null,
            };

            console.log('🔄 Adding task to target board cache:', updatedTask);
            return [...old, updatedTask];
          }
        );
      } else {
        // Same board move - just update list_id
        console.log('🔄 Updating task within same board');
        queryClient.setQueryData(
          ['tasks', currentBoardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.map((task) => {
              if (task.id === taskId) {
                // Get the target list to determine archived status
                const targetList = queryClient.getQueryData([
                  'task_lists',
                  currentBoardId,
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
                  closed_at: shouldArchive ? new Date().toISOString() : null,
                };
              }
              return task;
            });
          }
        );
      }

      console.log('✅ Optimistic update completed');
      return {
        previousCurrentBoardTasks,
        previousTargetBoardTasks,
        targetBoardId: targetBoardId || currentBoardId,
      };
    },
    onError: (err, variables, context) => {
      console.log('❌ onError triggered - rollback optimistic update');
      console.log('📋 Error details:', err);
      console.log('📊 Variables:', variables);

      // Rollback optimistic updates on error
      if (context?.previousCurrentBoardTasks) {
        console.log('🔄 Rolling back current board state');
        queryClient.setQueryData(
          ['tasks', currentBoardId],
          context.previousCurrentBoardTasks
        );
      }

      if (
        context?.previousTargetBoardTasks &&
        context.targetBoardId !== currentBoardId
      ) {
        console.log('🔄 Rolling back target board state');
        queryClient.setQueryData(
          ['tasks', context.targetBoardId],
          context.previousTargetBoardTasks
        );
      }

      console.error('Failed to move task to board:', err);
    },
    onSuccess: (result) => {
      console.log(
        '✅ onSuccess triggered - updating caches with server response'
      );
      console.log('📊 Updated task from server:', result.task);
      console.log('📊 Moved to different board:', result.movedToDifferentBoard);

      if (result.movedToDifferentBoard) {
        // Remove from source board cache
        queryClient.setQueryData(
          ['tasks', result.sourceBoardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.filter((task) => task.id !== result.task.id);
          }
        );

        // Update target board cache
        queryClient.setQueryData(
          ['tasks', result.targetBoardId],
          (old: Task[] | undefined) => {
            if (!old) return [result.task];

            // Check if task is already in the target board cache, update or add
            const existingIndex = old.findIndex(
              (task) => task.id === result.task.id
            );
            if (existingIndex >= 0) {
              const updated = [...old];
              updated[existingIndex] = result.task;
              return updated;
            } else {
              return [...old, result.task];
            }
          }
        );

        // Note: We intentionally do NOT invalidate queries here.
        // setQueryData handles immediate UI feedback, and realtime
        // subscription handles cross-user sync. Invalidating would cause
        // tasks to flicker (disappear then reappear).
      } else {
        // Same board - just update the task
        queryClient.setQueryData(
          ['tasks', currentBoardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.map((task) =>
              task.id === result.task.id ? result.task : task
            );
          }
        );
      }

      console.log('✅ Cache updated with server response');
    },
  });
}

// Status Template Functions
export async function getStatusTemplates(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase
    .from('task_board_status_templates')
    .select('*')
    .order('is_default', { ascending: false })
    .order('name');

  if (error) throw error;
  return data as unknown as TaskBoardStatusTemplate[];
}

export async function createBoardWithTemplate(
  supabase: TypedSupabaseClient,
  wsId: string,
  name: string,
  templateId?: string
) {
  const { data, error } = await supabase
    .from('workspace_boards')
    .insert({
      ws_id: wsId,
      name,
      template_id: templateId,
    })
    .select()
    .single();

  if (error) throw error;
  return data as WorkspaceTaskBoard;
}

export async function updateTaskListStatus(
  supabase: TypedSupabaseClient,
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
  supabase: TypedSupabaseClient,
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
  supabase: TypedSupabaseClient,
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
    }: {
      name: string;
      templateId?: string;
    }) => {
      const supabase = createClient();
      return createBoardWithTemplate(supabase, wsId, name, templateId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-boards', wsId] });
    },
    onError: (error) => {
      console.error('Error creating board:', error);
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
    },
    onError: (error) => {
      console.error('Error updating list status:', error);
    },
  });
}

export function priorityCompare(
  priorityA: TaskPriority | null | undefined,
  priorityB: TaskPriority | null | undefined
) {
  // Priority order: No priority first (highest value), then critical, high, normal, low
  const priorityOrder = {
    critical: 4,
    high: 3,
    normal: 2,
    low: 1,
  };

  // No priority gets the highest value (5) so it sorts first
  const getOrderValue = (priority: TaskPriority | null | undefined): number => {
    return priority ? priorityOrder[priority] : 5;
  };

  const valueA = getOrderValue(priorityA);
  const valueB = getOrderValue(priorityB);

  // Higher values come first (descending order)
  return valueB - valueA;
}

// Bulk operations for moving all tasks from a list
export async function moveAllTasksFromList(
  supabase: TypedSupabaseClient,
  sourceListId: string,
  targetListId: string,
  targetBoardId?: string
) {
  console.log('🗄️ moveAllTasksFromList function called');
  console.log('📋 Source List ID:', sourceListId);
  console.log('🎯 Target List ID:', targetListId);
  console.log('📊 Target Board ID:', targetBoardId);

  // First, get all tasks in the source list
  const { data: tasksToMove, error: fetchError } = await supabase
    .from('tasks')
    .select('id, list_id, task_lists!inner(board_id)')
    .eq('list_id', sourceListId)
    .is('deleted_at', null);

  if (fetchError) {
    console.log('❌ Error fetching tasks from source list:', fetchError);
    throw new Error(`Failed to fetch tasks: ${fetchError.message}`);
  }

  if (!tasksToMove || tasksToMove.length === 0) {
    console.log('ℹ️ No tasks to move from source list');
    return { success: true, movedCount: 0 };
  }

  console.log('📋 Found tasks to move:', tasksToMove.length);

  // Move all tasks in parallel for better performance
  const movePromises = tasksToMove.map(async (task) => {
    try {
      await moveTaskToBoard(supabase, task.id, targetListId, targetBoardId);
      return { success: true, taskId: task.id };
    } catch (error) {
      console.error('❌ Failed to move task:', task.id, error);
      return { success: false, taskId: task.id, error };
    }
  });

  const results = await Promise.allSettled(movePromises);

  const successful = results.filter(
    (result) => result.status === 'fulfilled' && result.value.success
  ).length;

  const failed = results.length - successful;

  console.log(
    `✅ Bulk list move completed: ${successful} successful, ${failed} failed`
  );

  if (failed > 0) {
    throw new Error(`Failed to move ${failed} out of ${results.length} tasks`);
  }

  return { success: true, movedCount: successful };
}

export function useMoveAllTasksFromList(currentBoardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sourceListId,
      targetListId,
      targetBoardId,
    }: {
      sourceListId: string;
      targetListId: string;
      targetBoardId?: string;
    }) => {
      console.log('🚀 Starting bulk list move mutation');
      console.log('📋 Source List ID:', sourceListId);
      console.log('🎯 Target List ID:', targetListId);
      console.log('📊 Target Board ID:', targetBoardId);

      const supabase = createClient();
      const result = await moveAllTasksFromList(
        supabase,
        sourceListId,
        targetListId,
        targetBoardId
      );

      console.log('✅ Bulk list move completed successfully');
      return result;
    },
    onMutate: async ({ sourceListId, targetListId, targetBoardId }) => {
      console.log('🔄 Optimistic update for bulk list move');

      // Cancel any outgoing refetches to avoid conflicts
      await queryClient.cancelQueries({ queryKey: ['tasks', currentBoardId] });
      if (targetBoardId && targetBoardId !== currentBoardId) {
        await queryClient.cancelQueries({ queryKey: ['tasks', targetBoardId] });
      }

      // Snapshot the previous values
      const previousSourceTasks = queryClient.getQueryData([
        'tasks',
        currentBoardId,
      ]);
      const previousTargetTasks =
        targetBoardId && targetBoardId !== currentBoardId
          ? queryClient.getQueryData(['tasks', targetBoardId])
          : null;

      // Get tasks to move from source list
      const sourceTasks = previousSourceTasks as Task[] | undefined;
      const tasksToMove =
        sourceTasks?.filter((task) => task.list_id === sourceListId) || [];

      if (tasksToMove.length === 0) {
        return { previousSourceTasks, previousTargetTasks, targetBoardId };
      }

      // If moving to a different board
      if (targetBoardId && targetBoardId !== currentBoardId) {
        // Remove tasks from source board
        queryClient.setQueryData(
          ['tasks', currentBoardId],
          (oldData: Task[] | undefined) => {
            if (!oldData) return oldData;
            return oldData.filter((task) => task.list_id !== sourceListId);
          }
        );

        // Add tasks to target board
        queryClient.setQueryData(
          ['tasks', targetBoardId],
          (oldData: Task[] | undefined) => {
            const updatedTasks = tasksToMove.map((task) => ({
              ...task,
              list_id: targetListId,
            }));

            if (!oldData) return updatedTasks;

            // Remove any existing tasks with same IDs, then add updated versions
            const filteredOldData = oldData.filter(
              (task) =>
                !tasksToMove.some((movingTask) => movingTask.id === task.id)
            );
            return [...filteredOldData, ...updatedTasks];
          }
        );
      } else {
        // Same board move - just update list_id for all tasks
        queryClient.setQueryData(
          ['tasks', currentBoardId],
          (oldData: Task[] | undefined) => {
            if (!oldData) return oldData;
            return oldData.map((task) =>
              task.list_id === sourceListId
                ? { ...task, list_id: targetListId }
                : task
            );
          }
        );
      }

      return { previousSourceTasks, previousTargetTasks, targetBoardId };
    },
    onError: (err, _variables, context) => {
      // Rollback optimistic updates on error
      if (context?.previousSourceTasks) {
        queryClient.setQueryData(
          ['tasks', currentBoardId],
          context.previousSourceTasks
        );
      }
      if (
        context?.previousTargetTasks &&
        context.targetBoardId &&
        context.targetBoardId !== currentBoardId
      ) {
        queryClient.setQueryData(
          ['tasks', context.targetBoardId],
          context.previousTargetTasks
        );
      }

      console.error('❌ Bulk list move failed:', err);
    },
    onSuccess: (data, variables) => {
      console.log('✅ Bulk list move mutation succeeded');
      console.log('📊 Moved task count:', data.movedCount);

      // Invalidate affected queries to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['tasks', currentBoardId] });
      if (
        variables.targetBoardId &&
        variables.targetBoardId !== currentBoardId
      ) {
        queryClient.invalidateQueries({
          queryKey: ['tasks', variables.targetBoardId],
        });
      }

      // Invalidate task lists in case task counts changed
      queryClient.invalidateQueries({
        queryKey: ['task_lists', currentBoardId],
      });
      if (
        variables.targetBoardId &&
        variables.targetBoardId !== currentBoardId
      ) {
        queryClient.invalidateQueries({
          queryKey: ['task_lists', variables.targetBoardId],
        });
      }
    },
  });
}

// Workspace Labels Hook
export interface WorkspaceLabel {
  id: string;
  name: string;
  color: string;
  created_at: string;
  ws_id: string;
}

export function useWorkspaceLabels(wsId: string | null | undefined) {
  return useQuery({
    queryKey: ['workspace-labels', wsId],
    queryFn: async () => {
      if (!wsId) return [];

      const supabase = createClient();
      const { data: labels, error } = await supabase
        .from('workspace_task_labels')
        .select('id, name, color, created_at, ws_id')
        .eq('ws_id', wsId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Sort alphabetically by name
      return (labels || []).sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      ) as WorkspaceLabel[];
    },
    enabled: Boolean(wsId),
    staleTime: 5 * 60 * 1000, // 5 minutes - labels don't change often
    refetchOnWindowFocus: false,
  });
}

// Board Config Hook
export interface BoardConfig {
  id: string;
  estimation_type: string | null;
  extended_estimation: boolean;
  allow_zero_estimates: boolean;
  ws_id: string;
  ticket_prefix: string | null;
}

export function useBoardConfig(boardId: string | null | undefined) {
  return useQuery({
    queryKey: ['board-config', boardId],
    queryFn: async () => {
      if (!boardId) return null;

      const supabase = createClient();
      const { data: board, error } = await supabase
        .from('workspace_boards')
        .select(
          'id, estimation_type, extended_estimation, allow_zero_estimates, ws_id, ticket_prefix'
        )
        .eq('id', boardId)
        .single();

      if (error) throw error;
      return board as BoardConfig;
    },
    enabled: Boolean(boardId),
    staleTime: 10 * 60 * 1000, // 10 minutes - board config rarely changes
    refetchOnWindowFocus: false,
  });
}

// BIGINT Sort Key System
// Uses integer arithmetic for exact precision without floating-point errors
// Base unit: 1,000,000 (1 million) - provides ample space for reordering
// Sequence offset: 1-999 for uniqueness in rapid operations

const SORT_KEY_BASE_UNIT = 1000000; // 1 million - spacing between tasks
const SORT_KEY_DEFAULT = SORT_KEY_BASE_UNIT * 1000; // Default for new tasks
const SORT_KEY_MIN_GAP = 1000; // Minimum gap to consider safe

let sortKeySequence = 0;

/**
 * Error thrown when sort keys cannot be calculated without creating duplicates
 * Upstream callers should catch this, run normalizeListSortKeys, and retry
 */
export class SortKeyGapExhaustedError extends Error {
  constructor(
    public readonly prevSortKey: number | null | undefined,
    public readonly nextSortKey: number | null | undefined,
    message: string
  ) {
    super(message);
    this.name = 'SortKeyGapExhaustedError';
  }
}

/**
 * Calculate a new BIGINT sort_key between two tasks
 * Handles all scenarios: beginning, end, middle, and cross-list movements
 *
 * @param prevSortKey - Sort key of the task before the insertion point (null if at beginning)
 * @param nextSortKey - Sort key of the task after the insertion point (null if at end)
 * @returns A new BIGINT sort_key that positions the task correctly
 * @throws {SortKeyGapExhaustedError} When there's no room to insert without creating duplicates
 *
 * **Important**: Callers should catch SortKeyGapExhaustedError, run normalizeListSortKeys(),
 * and retry the operation. This ensures sort keys are respaced and the operation can succeed.
 */
export function calculateSortKey(
  prevSortKey: number | null | undefined,
  nextSortKey: number | null | undefined
): number {
  // Increment sequence counter (1-999) for uniqueness in rapid operations
  sortKeySequence = (sortKeySequence % 999) + 1;

  // Case 1: No previous task - inserting at the beginning
  if (prevSortKey === null || prevSortKey === undefined) {
    if (nextSortKey === null || nextSortKey === undefined) {
      // Empty list - use default position
      return SORT_KEY_DEFAULT + sortKeySequence;
    }

    // Cannot insert before sort key 1 without creating a duplicate (can't go to 0 or negative)
    if (nextSortKey <= 1) {
      throw new SortKeyGapExhaustedError(
        null,
        nextSortKey,
        `Cannot insert before sort key ${nextSortKey}. No positive integer exists strictly less than it. Normalization required.`
      );
    }

    // Place before the next task
    // For small gaps, use midpoint between 0 and nextSortKey (effectively nextSortKey / 2)
    const halfNext = Math.floor(nextSortKey / 2);

    if (nextSortKey <= SORT_KEY_MIN_GAP) {
      // nextSortKey is small - use half of it, ensuring result is in range [1, nextSortKey - 1]
      const result = Math.max(1, Math.min(halfNext, nextSortKey - 1));
      return result;
    } else {
      // Good spacing available - try to maintain ideal positioning
      const baseKey = Math.max(
        halfNext,
        Math.min(SORT_KEY_BASE_UNIT, nextSortKey - SORT_KEY_MIN_GAP)
      );
      // Add sequence but ensure we don't reach or exceed nextSortKey
      const maxSequence = nextSortKey - baseKey - 1;
      const safeSequence = Math.min(sortKeySequence, Math.max(0, maxSequence));
      return baseKey + safeSequence;
    }
  }

  // Case 2: No next task - inserting at the end
  if (nextSortKey === null || nextSortKey === undefined) {
    // Place after the previous task with good spacing
    return prevSortKey + SORT_KEY_BASE_UNIT + sortKeySequence;
  }

  // Case 3: Inserting between two tasks
  const gap = nextSortKey - prevSortKey;

  // Check for inverted sort keys (e.g., in "done" lists sorted by completed_at)
  // This happens when visual order (by completion date) differs from sort_key order
  if (gap <= 0) {
    throw new SortKeyGapExhaustedError(
      prevSortKey,
      nextSortKey,
      `Cannot insert between inverted sort keys ${prevSortKey} and ${nextSortKey}. Gap (${gap}) is inverted or zero. Normalization required.`
    );
  }

  // Gap exhausted - cannot fit another integer between them
  if (gap <= 1) {
    throw new SortKeyGapExhaustedError(
      prevSortKey,
      nextSortKey,
      `Cannot insert between sort keys ${prevSortKey} and ${nextSortKey}. Gap (${gap}) is too small. Normalization required.`
    );
  }

  // Calculate midpoint, ensuring it's strictly between prevSortKey and nextSortKey
  const midpoint = Math.floor((prevSortKey + nextSortKey) / 2);

  // Verify midpoint is valid (strictly between neighbors)
  // This check handles edge cases where floor() might produce prevSortKey
  if (midpoint <= prevSortKey || midpoint >= nextSortKey) {
    throw new SortKeyGapExhaustedError(
      prevSortKey,
      nextSortKey,
      `Calculated midpoint ${midpoint} is not strictly between ${prevSortKey} and ${nextSortKey}. Gap exhausted. Normalization required.`
    );
  }

  // For very small gaps, just use the midpoint without offset
  if (gap <= sortKeySequence) {
    console.warn(
      '⚠️ Gap too small for sequence offset, using midpoint - normalization recommended',
      { prevSortKey, nextSortKey, gap, sortKeySequence, midpoint }
    );
    return midpoint;
  }

  // For gaps smaller than MIN_GAP but larger than sequence, warn but continue
  if (gap <= SORT_KEY_MIN_GAP) {
    console.warn(
      '⚠️ Sort key gap small, task ordering may need renormalization',
      { prevSortKey, nextSortKey, gap, threshold: SORT_KEY_MIN_GAP }
    );

    // Calculate max safe offset to ensure we stay strictly within bounds
    // We can offset in range [prevSortKey + 1, nextSortKey - 1]
    // From midpoint, we can go up to (nextSortKey - 1 - midpoint) or down to (midpoint - prevSortKey - 1)
    const maxOffsetUp = nextSortKey - 1 - midpoint;
    const maxOffsetDown = midpoint - prevSortKey - 1;
    const maxSafeOffset = Math.min(maxOffsetUp, maxOffsetDown);
    const safeOffset = Math.min(sortKeySequence, Math.max(0, maxSafeOffset));

    const result = midpoint + safeOffset;

    // Final safety check
    if (result <= prevSortKey || result >= nextSortKey) {
      throw new SortKeyGapExhaustedError(
        prevSortKey,
        nextSortKey,
        `Calculated result ${result} with offset is not strictly between ${prevSortKey} and ${nextSortKey}. Normalization required.`
      );
    }

    return result;
  }

  // Good gap - calculate midpoint with sequence offset
  // Add sequence offset, ensuring we stay within bounds
  const halfGap = Math.floor(gap / 2);
  const offset = Math.min(sortKeySequence, halfGap - 1);

  const result = midpoint + offset;

  // Final safety check (should never fail for good gaps, but defensive programming)
  if (result <= prevSortKey || result >= nextSortKey) {
    throw new SortKeyGapExhaustedError(
      prevSortKey,
      nextSortKey,
      `Calculated result ${result} with offset is not strictly between ${prevSortKey} and ${nextSortKey}. Normalization required.`
    );
  }

  return result;
}

/**
 * Reset the sequence counter
 * Useful for testing or when starting a fresh session
 */
export function resetSortKeySequence(): void {
  sortKeySequence = 0;
}

/**
 * Get the current sort key configuration constants
 */
export function getSortKeyConfig(): {
  BASE_UNIT: number;
  DEFAULT: number;
  MIN_GAP: number;
} {
  return {
    BASE_UNIT: SORT_KEY_BASE_UNIT,
    DEFAULT: SORT_KEY_DEFAULT,
    MIN_GAP: SORT_KEY_MIN_GAP,
  };
}

/**
 * Detect if tasks have duplicate or too-close sort keys (BIGINT version)
 * Checks for gaps smaller than MIN_GAP (1000)
 */
export function hasSortKeyCollisions(tasks: Task[]): boolean {
  const sortKeys = tasks
    .map((t) => t.sort_key)
    .filter((key): key is number => key !== null && key !== undefined);

  if (sortKeys.length === 0) return false;

  // Sort the keys
  const sorted = [...sortKeys].sort((a, b) => a - b);

  // Check for duplicates or gaps smaller than MIN_GAP
  for (let i = 1; i < sorted.length; i++) {
    const prevKey = sorted[i - 1];
    const currKey = sorted[i];
    if (prevKey !== undefined && currKey !== undefined) {
      const gap = currKey - prevKey;
      if (gap < SORT_KEY_MIN_GAP) {
        return true; // Collision detected
      }
    }
  }

  return false;
}

/**
 * Normalize sort keys for a list of tasks (BIGINT version)
 * Ensures proper spacing using BASE_UNIT (1,000,000) between tasks
 */
export function normalizeSortKeys(tasks: Task[]): Task[] {
  // Sort by current sort_key (nulls last) and created_at as fallback
  const sorted = [...tasks].sort((a, b) => {
    const sortA = a.sort_key ?? Number.MAX_SAFE_INTEGER;
    const sortB = b.sort_key ?? Number.MAX_SAFE_INTEGER;
    if (sortA !== sortB) return sortA - sortB;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  // Reassign sort keys with proper spacing (BASE_UNIT apart)
  return sorted.map((task, index) => ({
    ...task,
    sort_key: (index + 1) * SORT_KEY_BASE_UNIT,
  }));
}

/**
 * Batch normalize sort keys in the database for a specific list (BIGINT version)
 * Uses BASE_UNIT (1,000,000) spacing between tasks
 *
 * @param supabase - Supabase client for database operations
 * @param listId - ID of the list to normalize
 * @param visualOrderTasks - Optional array of tasks in their current visual order (respects active filters)
 *                           If provided, sort keys will be assigned based on this order instead of database order
 */
export async function normalizeListSortKeys(
  supabase: TypedSupabaseClient,
  listId: string,
  visualOrderTasks?: Pick<Task, 'id' | 'sort_key' | 'created_at'>[]
): Promise<void> {
  console.log('🔧 Normalizing sort keys for list:', listId);

  let tasks: Pick<Task, 'id' | 'sort_key' | 'created_at'>[];

  if (visualOrderTasks && visualOrderTasks.length > 0) {
    // Use the provided visual order (respects active filters/sorting)
    console.log(
      '✨ Using provided visual order for normalization (respects active filters)'
    );
    tasks = visualOrderTasks;
  } else {
    // Fetch all tasks in the list from database
    const { data: fetchedTasks, error: fetchError } = await supabase
      .from('tasks')
      .select('id, sort_key, created_at')
      .eq('list_id', listId)
      .is('deleted_at', null)
      .order('sort_key', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('Failed to fetch tasks for normalization:', fetchError);
      throw fetchError;
    }

    if (!fetchedTasks || fetchedTasks.length === 0) {
      console.log('No tasks to normalize');
      return;
    }

    tasks = fetchedTasks as Pick<Task, 'id' | 'sort_key' | 'created_at'>[];
  }

  if (tasks.length === 0) {
    console.log('No tasks to normalize');
    return;
  }

  // Check if normalization is needed (skip check if visual order provided, as it likely needs update)
  if (!visualOrderTasks) {
    const needsNormalization = hasSortKeyCollisions(tasks as unknown as Task[]);

    if (!needsNormalization) {
      console.log('✅ Sort keys are already properly spaced');
      return;
    }
  }

  console.log(
    visualOrderTasks
      ? '✨ Normalizing with visual order (preserving filtered/sorted view)'
      : '⚠️ Collisions detected, normalizing...'
  );

  // Normalize and update in batch
  // Use BASE_UNIT spacing (1,000,000) between tasks
  // Tasks array is already in the desired order (either visual or database)
  const updates = tasks.map((task, index) => ({
    id: task.id,
    sort_key: (index + 1) * SORT_KEY_BASE_UNIT,
  }));

  // Update all tasks with new sort keys
  // Use update instead of upsert to avoid requiring full row data
  const updatePromises = updates.map((update) =>
    supabase
      .from('tasks')
      .update({ sort_key: update.sort_key })
      .eq('id', update.id)
  );

  const results = await Promise.all(updatePromises);
  const updateError = results.find((result) => result.error)?.error;

  if (updateError) {
    console.error('Failed to update sort keys:', updateError);
    throw updateError;
  }

  console.log('✅ Sort keys normalized successfully');
}

// Reorder task within the same list or move to a different list with specific position
export async function reorderTask(
  supabase: TypedSupabaseClient,
  taskId: string,
  newListId: string,
  newSortKey: number
): Promise<Task> {
  console.log('🗄️ reorderTask function called');
  console.log('📋 Task ID:', taskId);
  console.log('🎯 New List ID:', newListId);
  console.log('🔢 New Sort Key:', newSortKey);

  // Get the target list to check its status
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

  // Determine archived status based on list status
  const shouldArchive =
    targetList.status === 'done' || targetList.status === 'closed';

  console.log('📦 Will archive:', shouldArchive);
  console.log('🔄 Updating task in database...');

  const { data, error } = await supabase
    .from('tasks')
    .update({
      list_id: newListId,
      sort_key: newSortKey,
      closed_at: shouldArchive ? new Date().toISOString() : null,
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
        ),
        labels:task_labels(
          label:workspace_task_labels(
            id,
            name,
            color,
            created_at
          )
        ),
        projects:task_project_tasks(
          project:task_projects(
            id,
            name,
            status
          )
        )
      `
    )
    .single();

  if (error) {
    console.log('❌ Error updating task:', error);
    throw error;
  }

  console.log('✅ Task reordered successfully');
  return transformTaskRecord(data) as Task;
}

// React Query hook for reordering tasks
export function useReorderTask(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      newListId,
      newSortKey,
    }: {
      taskId: string;
      newListId: string;
      newSortKey: number;
    }) => {
      console.log('🚀 Starting reorderTask mutation');
      const supabase = createClient();
      return await reorderTask(supabase, taskId, newListId, newSortKey);
    },
    onMutate: async ({ taskId, newListId, newSortKey }) => {
      console.log('🎭 onMutate triggered - optimistic update for reorder');

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

      // Snapshot the previous value
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      // Optimistically update the task
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((task) => {
            if (task.id === taskId) {
              const targetList = queryClient.getQueryData([
                'task_lists',
                boardId,
              ]) as TaskList[] | undefined;
              const list = targetList?.find((l) => l.id === newListId);
              const shouldArchive =
                list?.status === 'done' || list?.status === 'closed';

              return {
                ...task,
                list_id: newListId,
                sort_key: newSortKey,
                closed_at: shouldArchive ? new Date().toISOString() : null,
              };
            }
            return task;
          });
        }
      );

      return { previousTasks };
    },
    onError: (err, _, context) => {
      console.log('❌ onError triggered - rollback optimistic update');
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }

      console.error('Failed to reorder task:', err);
    },
    onSuccess: (updatedTask) => {
      console.log(
        '✅ onSuccess triggered - updating cache with server response'
      );

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
  });
}

// =============================================================================
// TASK RELATIONSHIPS
// =============================================================================

/**
 * Nested task shape returned from relationship queries.
 * Used to replace `as any` with proper typing.
 */
interface NestedRelatedTask {
  id: string;
  name: string;
  display_number: number | null;
  completed: boolean | null;
  priority: string | null;
  board_id: string | null;
  deleted_at: string | null;
  list: {
    board: {
      name: string;
    } | null;
  } | null;
}

/**
 * Fetch all relationships for a given task
 */
export async function getTaskRelationships(
  supabase: TypedSupabaseClient,
  taskId: string
): Promise<TaskRelationshipsResponse> {
  // Fetch relationships where this task is the source
  const { data: sourceRelationships, error: sourceError } = await supabase
    .from('task_relationships')
    .select(
      `
      id,
      source_task_id,
      target_task_id,
      type,
      created_at,
      created_by,
      target_task:tasks!task_relationships_target_task_id_fkey(
        id,
        name,
        display_number,
        completed,
        priority,
        board_id,
        deleted_at,
        list:task_lists(
          board:workspace_boards(
            name
          )
        )
      )
    `
    )
    .eq('source_task_id', taskId);

  if (sourceError) throw sourceError;

  // Fetch relationships where this task is the target
  const { data: targetRelationships, error: targetError } = await supabase
    .from('task_relationships')
    .select(
      `
      id,
      source_task_id,
      target_task_id,
      type,
      created_at,
      created_by,
      source_task:tasks!task_relationships_source_task_id_fkey(
        id,
        name,
        display_number,
        completed,
        priority,
        board_id,
        deleted_at,
        list:task_lists(
          board:workspace_boards(
            name
          )
        )
      )
    `
    )
    .eq('target_task_id', taskId);

  if (targetError) throw targetError;

  // Process relationships into categorized response
  const result: TaskRelationshipsResponse = {
    parentTask: null,
    childTasks: [],
    blockedBy: [],
    blocking: [],
    relatedTasks: [],
  };

  // Process source relationships (this task is the source)
  for (const rel of sourceRelationships || []) {
    const targetTask = rel.target_task as NestedRelatedTask | null;
    // Skip if task is missing or soft-deleted
    if (!targetTask || targetTask.deleted_at !== null) continue;

    const taskInfo: RelatedTaskInfo = {
      id: targetTask.id,
      name: targetTask.name,
      display_number: targetTask.display_number,
      completed: targetTask.completed,
      priority: (isTaskPriority(targetTask.priority)
        ? targetTask.priority
        : null) as 'low' | 'normal' | 'high' | 'critical' | null,
      board_id: targetTask.board_id,
      board_name: targetTask.list?.board?.name,
    };

    switch (rel.type) {
      case 'parent_child':
        // Source is parent, target is child - so this task's children
        result.childTasks.push(taskInfo);
        break;
      case 'blocks':
        // Source blocks target - so this task is blocking the target
        result.blocking.push(taskInfo);
        break;
      case 'related':
        result.relatedTasks.push(taskInfo);
        break;
    }
  }

  // Process target relationships (this task is the target)
  for (const rel of targetRelationships || []) {
    const sourceTask = rel.source_task as NestedRelatedTask | null;
    // Skip if task is missing or soft-deleted
    if (!sourceTask || sourceTask.deleted_at !== null) continue;

    const taskInfo: RelatedTaskInfo = {
      id: sourceTask.id,
      name: sourceTask.name,
      display_number: sourceTask.display_number,
      completed: sourceTask.completed,
      priority: (isTaskPriority(sourceTask.priority)
        ? sourceTask.priority
        : null) as 'low' | 'normal' | 'high' | 'critical' | null,
      board_id: sourceTask.board_id,
      board_name: sourceTask.list?.board?.name,
    };

    switch (rel.type) {
      case 'parent_child':
        // Source is parent, target is child - so this task's parent
        result.parentTask = taskInfo;
        break;
      case 'blocks':
        // Source blocks target - so this task is blocked by source
        result.blockedBy.push(taskInfo);
        break;
      case 'related':
        // Avoid duplicates for bidirectional related relationships
        if (!result.relatedTasks.some((t) => t.id === taskInfo.id)) {
          result.relatedTasks.push(taskInfo);
        }
        break;
    }
  }

  return result;
}

/**
 * Create a new task relationship
 */
export async function createTaskRelationship(
  supabase: TypedSupabaseClient,
  input: CreateTaskRelationshipInput
): Promise<TaskRelationship> {
  const { data, error } = await supabase
    .from('task_relationships')
    .insert({
      source_task_id: input.source_task_id,
      target_task_id: input.target_task_id,
      type: input.type,
    })
    .select()
    .single();

  if (error) {
    // Handle specific error cases with user-friendly messages
    if (error.code === '23505') {
      throw new Error('This relationship already exists.');
    }
    if (error.message?.includes('single parent')) {
      throw new Error('A task can only have one parent.');
    }
    if (error.message?.includes('circular')) {
      throw new Error(
        'This would create a circular relationship, which is not allowed.'
      );
    }
    throw error;
  }

  return data as TaskRelationship;
}

/**
 * Delete a task relationship
 */
export async function deleteTaskRelationship(
  supabase: TypedSupabaseClient,
  relationshipId: string
): Promise<void> {
  const { error } = await supabase
    .from('task_relationships')
    .delete()
    .eq('id', relationshipId);

  if (error) throw error;
}

/**
 * Delete a task relationship by source, target, and type
 */
export async function deleteTaskRelationshipByDetails(
  supabase: TypedSupabaseClient,
  sourceTaskId: string,
  targetTaskId: string,
  type: TaskRelationshipType
): Promise<void> {
  const { error } = await supabase
    .from('task_relationships')
    .delete()
    .eq('source_task_id', sourceTaskId)
    .eq('target_task_id', targetTaskId)
    .eq('type', type);

  if (error) throw error;
}

/**
 * React Query hook for fetching task relationships
 */
export function useTaskRelationships(taskId: string | undefined) {
  return useQuery({
    queryKey: ['task-relationships', taskId],
    queryFn: async () => {
      if (!taskId) return null;
      const supabase = createClient();
      return getTaskRelationships(supabase, taskId);
    },
    enabled: !!taskId,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * React Query mutation hook for creating task relationships
 */
export function useCreateTaskRelationship(_boardId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTaskRelationshipInput) => {
      const supabase = createClient();
      return createTaskRelationship(supabase, input);
    },
    onSuccess: async (_, variables) => {
      // Invalidate relationships for both tasks involved
      // Note: We intentionally do NOT invalidate the tasks cache here to avoid
      // conflicts with realtime sync and unnecessary full-board refetches.
      // The task card badges read from ['task-relationships', taskId] cache directly.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['task-relationships', variables.source_task_id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['task-relationships', variables.target_task_id],
        }),
      ]);
    },
  });
}

/**
 * React Query mutation hook for deleting task relationships
 */
export function useDeleteTaskRelationship(_boardId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sourceTaskId,
      targetTaskId,
      type,
    }: {
      sourceTaskId: string;
      targetTaskId: string;
      type: TaskRelationshipType;
    }) => {
      const supabase = createClient();
      return deleteTaskRelationshipByDetails(
        supabase,
        sourceTaskId,
        targetTaskId,
        type
      );
    },
    onSuccess: async (_, variables) => {
      // Invalidate relationships for both tasks involved
      // Note: We intentionally do NOT invalidate the tasks cache here to avoid
      // conflicts with realtime sync and unnecessary full-board refetches.
      // The task card badges read from ['task-relationships', taskId] cache directly.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['task-relationships', variables.sourceTaskId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['task-relationships', variables.targetTaskId],
        }),
      ]);
    },
  });
}

/**
 * Fetch tasks for a workspace (for task picker across all boards)
 */
export async function getWorkspaceTasks(
  supabase: TypedSupabaseClient,
  wsId: string,
  options?: {
    excludeTaskIds?: string[];
    searchQuery?: string;
    limit?: number;
  }
): Promise<RelatedTaskInfo[]> {
  let query = supabase
    .from('tasks')
    .select(
      `
      id,
      name,
      display_number,
      completed,
      priority,
      board_id,
      list:task_lists!inner(
        board:workspace_boards!inner(
          id,
          name,
          ws_id
        )
      )
    `
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  // Filter by workspace through the board
  query = query.eq('list.board.ws_id', wsId);

  // Exclude specific task IDs
  if (options?.excludeTaskIds?.length) {
    query = query.filter(
      'id',
      'not.in',
      `(${options.excludeTaskIds.join(',')})`
    );
  }

  // Search by name
  if (options?.searchQuery) {
    query = query.ilike('name', `%${options.searchQuery}%`);
  }

  // Limit results
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).map((task) => ({
    id: task.id,
    name: task.name,
    display_number: task.display_number,
    completed: task.completed,
    priority: task.priority,
    board_id: task.board_id,
    board_name: task.list?.board?.name ?? undefined,
  }));
}

/**
 * React Query hook for fetching workspace tasks (for task picker)
 */
export function useWorkspaceTasks(
  wsId: string | undefined,
  options?: {
    excludeTaskIds?: string[];
    searchQuery?: string;
    limit?: number;
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: [
      'workspace-tasks',
      wsId,
      options?.excludeTaskIds,
      options?.searchQuery,
      options?.limit,
    ],
    queryFn: async () => {
      if (!wsId) return [];
      const supabase = createClient();
      return getWorkspaceTasks(supabase, wsId, options);
    },
    enabled: !!wsId && (options?.enabled ?? true),
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Create a new task and establish a relationship with an existing task in one atomic operation
 * Uses a Supabase RPC to ensure both operations succeed or both fail
 */
export async function createTaskWithRelationship(
  supabase: TypedSupabaseClient,
  input: CreateTaskWithRelationshipInput
): Promise<{ task: Task; relationship: TaskRelationship }> {
  const { name, listId, currentTaskId, relationshipType, currentTaskIsSource } =
    input;

  // Call the RPC for atomic transaction
  const { data, error } = await supabase.rpc('create_task_with_relationship', {
    p_name: name,
    p_list_id: listId,
    p_current_task_id: currentTaskId,
    p_relationship_type: relationshipType,
    p_current_task_is_source: currentTaskIsSource,
  });

  if (error) {
    // Handle specific error cases with user-friendly messages
    if (error.message?.includes('already exists')) {
      throw new Error('This relationship already exists.');
    }
    if (error.message?.includes('single parent')) {
      throw new Error('A task can only have one parent.');
    }
    if (error.message?.includes('circular')) {
      throw new Error(
        'This would create a circular relationship, which is not allowed.'
      );
    }
    if (error.message?.includes('not authenticated')) {
      throw new Error('User not authenticated');
    }
    if (error.message?.includes('List not found')) {
      throw new Error('List not found or access denied');
    }
    if (error.message?.includes('Current task not found')) {
      throw new Error('The task you are trying to relate to was not found');
    }
    throw error;
  }

  // Strongly typed response from RPC
  const result = data as unknown as CreateTaskWithRelationshipResult;

  // Transform task record to match Task type
  const task = transformTaskRecord(result.task) as Task;

  // Relationship is already strongly typed, use directly
  const relationship: TaskRelationship = result.relationship;

  return { task, relationship };
}

/**
 * React Query mutation hook for creating a task with a relationship
 */
export function useCreateTaskWithRelationship(boardId: string, wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTaskWithRelationshipInput) => {
      const supabase = createClient();
      return createTaskWithRelationship(supabase, input);
    },
    onSuccess: async (result, variables) => {
      // Add the new task to the cache directly instead of invalidating
      // This avoids full-board refetch flickering and conflicts with realtime sync
      if (boardId) {
        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return [result.task];
            // Check if task already exists (from realtime), if so don't duplicate
            if (old.some((t) => t.id === result.task.id)) return old;
            return [...old, result.task];
          }
        );
      }

      // Invalidate relationship caches for both tasks involved
      // Note: We do NOT invalidate the tasks cache to avoid conflicts with realtime sync
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['task-relationships', variables.currentTaskId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['task-relationships', result.task.id],
        }),
        // Invalidate workspace tasks (for task picker) - scoped to specific workspace
        queryClient.invalidateQueries({
          queryKey: ['workspace-tasks', wsId],
        }),
      ]);
    },
  });
}
