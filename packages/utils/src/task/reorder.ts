import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { transformTaskRecord } from './transformers';

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

      // Check if moving to a done or closed list
      const targetList = queryClient.getQueryData(['task_lists', boardId]) as
        | TaskList[]
        | undefined;
      const list = targetList?.find((l) => l.id === newListId);
      const isCompletionList =
        list?.status === 'done' || list?.status === 'closed';

      // If moving to completion list, start fetching blocked task IDs asynchronously
      // Don't await here to avoid blocking the optimistic update
      let blockedTaskIdsPromise: Promise<string[]> | null = null;
      if (isCompletionList) {
        const supabase = createClient();
        blockedTaskIdsPromise = Promise.resolve(
          supabase
            .from('task_relationships')
            .select('target_task_id')
            .eq('source_task_id', taskId)
            .eq('type', 'blocks')
        )
          .then(({ data }) => data?.map((r) => r.target_task_id) || [])
          .catch((err: unknown) => {
            console.error('Failed to fetch blocked task IDs:', err);
            return []; // Return empty array on error to prevent breaking the flow
          });
      }

      // Optimistically update the task immediately (not blocked by the fetch above)
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((task) => {
            if (task.id === taskId) {
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

      return { previousTasks, blockedTaskIdsPromise };
    },
    onError: (err, _, context) => {
      console.log('❌ onError triggered - rollback optimistic update');
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }

      console.error('Failed to reorder task:', err);
    },
    onSuccess: async (updatedTask, variables, context) => {
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

      // If task was moved to done/closed list (has completed_at or closed_at set),
      // invalidate task relationships to reflect removed blocking relationships
      if (updatedTask.completed_at || updatedTask.closed_at) {
        // Invalidate the completed/closed task's relationships
        await queryClient.invalidateQueries({
          queryKey: ['task-relationships', variables.taskId],
        });

        // Await the blockedTaskIdsPromise to get the list of blocked tasks
        // Then invalidate all blocked tasks' relationships (they're now unblocked)
        if (context?.blockedTaskIdsPromise) {
          const blockedTaskIds = await context.blockedTaskIdsPromise;
          if (blockedTaskIds.length > 0) {
            await Promise.all(
              blockedTaskIds.map((blockedTaskId) =>
                queryClient.invalidateQueries({
                  queryKey: ['task-relationships', blockedTaskId],
                })
              )
            );
          }
        }
      }
    },
  });
}
