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
import { toast } from '@tuturuuu/ui/sonner';

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
      .eq('deleted', false)
      .order('created_at');

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

  // First, get the current task details including its current archived status and source list
  console.log('🔍 Fetching current task details...');
  const { data: currentTask, error: taskError } = await supabase
    .from('tasks')
    .select(`
      id,
      list_id,
      archived,
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
  const currentlyArchived = currentTask.archived;

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
  supabase: SupabaseClient,
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
      archived,
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
  const currentlyArchived = currentTask.archived;

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
      toast.error('Failed to update task', {
        description: 'Please try again.',
      });
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
      toast.error('Failed to create task', {
        description: 'Please try again.',
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
      toast.error('Failed to delete task', {
        description: 'Please try again.',
      });
    },
    onSuccess: (_, taskId, context) => {
      const deletedTask = context?.deletedTask;

      // Task is already removed from cache optimistically
      // Show toast with undo action
      toast.success('Task deleted', {
        description: deletedTask?.name || 'Task has been removed',
        action: deletedTask
          ? {
              label: 'Undo',
              onClick: async () => {
                // Restore the task by setting deleted to false
                const supabase = createClient();
                try {
                  const { error } = await supabase
                    .from('tasks')
                    .update({ deleted: false })
                    .eq('id', taskId);

                  if (error) throw error;

                  // Add the task back to the cache
                  queryClient.setQueryData(
                    ['tasks', boardId],
                    (old: Task[] | undefined) => {
                      if (!old) return [deletedTask];
                      // Check if task is already in cache (shouldn't be, but safety check)
                      const exists = old.some((task) => task.id === taskId);
                      if (exists) return old;
                      return [...old, deletedTask];
                    }
                  );

                  toast.success('Task restored', {
                    description: `"${deletedTask.name}" has been restored`,
                  });
                } catch (error) {
                  console.error('Failed to restore task:', error);
                  toast.error('Failed to restore task', {
                    description: 'Please try again or refresh the page.',
                  });
                }
              },
            }
          : undefined,
      });
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
      toast.error('Failed to move task', {
        description: 'Please try again.',
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
              archived: shouldArchive || false,
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
                  archived: shouldArchive || false,
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
      toast.error('Failed to move task to board', {
        description: 'Please try again.',
      });
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

        // Invalidate both boards to ensure consistency
        queryClient.invalidateQueries({
          queryKey: ['tasks', result.sourceBoardId],
        });
        queryClient.invalidateQueries({
          queryKey: ['tasks', result.targetBoardId],
        });
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

      toast.success(
        result.movedToDifferentBoard
          ? 'Task moved to different board'
          : 'Task moved successfully'
      );
    },
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
    }: {
      name: string;
      templateId?: string;
    }) => {
      const supabase = createClient();
      return createBoardWithTemplate(supabase, wsId, name, templateId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-boards', wsId] });
      toast.success('Task board created successfully');
    },
    onError: (error) => {
      console.error('Error creating board:', error);
      toast.error('Failed to create task board');
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
      toast.success('List status updated successfully');
    },
    onError: (error) => {
      console.error('Error updating list status:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to update list status'
      );
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
  supabase: SupabaseClient,
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
    .eq('deleted', false);

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
      toast.error('Failed to move all tasks from list', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
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

      toast.success(
        `Moved ${data.movedCount} task${data.movedCount !== 1 ? 's' : ''} successfully`
      );
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
          'id, estimation_type, extended_estimation, allow_zero_estimates, ws_id'
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
