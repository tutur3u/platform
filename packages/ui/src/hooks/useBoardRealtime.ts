import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useEffect } from 'react';
import { useCallbackRef } from './use-callback-ref';
import { useStableArray } from './use-stable-array';

export function useBoardRealtime(
  boardId: string,
  taskIds: string[],
  listIds: string[],
  options?: {
    onTaskChange?: (
      task: Task,
      eventType: 'INSERT' | 'UPDATE' | 'DELETE'
    ) => void;
    onListChange?: (
      list: TaskList,
      eventType: 'INSERT' | 'UPDATE' | 'DELETE'
    ) => void;
  }
) {
  const queryClient = useQueryClient();

  const stableTaskIds = useStableArray(taskIds);
  const stableListIds = useStableArray(listIds);

  // Create stable callback functions
  const handleTaskChange = useCallbackRef(
    (task: Task, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => {
      options?.onTaskChange?.(task, eventType);
    }
  );

  const handleListChange = useCallbackRef(
    (list: TaskList, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => {
      options?.onListChange?.(list, eventType);
    }
  );

  useEffect(() => {
    if (!boardId) return;

    const supabase = createClient();
    const channel = supabase.channel(`board-realtime-${boardId}`);

    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'task_lists',
        filter: `board_id=eq.${boardId}`,
      },
      (payload) => {
        const { eventType, old: oldRecord, new: newRecord } = payload;

        if (oldRecord || newRecord) {
          handleListChange((oldRecord || newRecord) as TaskList, eventType);
        }

        queryClient.invalidateQueries({
          queryKey: ['task_lists', boardId],
        });
        queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
      }
    );

    if (stableListIds.length > 0) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `list_id=in.(${stableListIds.join(',')})`,
        },
        async (payload) => {
          const { eventType, old: oldRecord, new: newRecord } = payload;

          // Call custom callback if provided
          if (oldRecord || newRecord) {
            handleTaskChange((oldRecord || newRecord) as Task, eventType);
          }

          // Handle realtime events with care to preserve joined data
          switch (eventType) {
            case 'INSERT':
              queryClient.setQueryData(
                ['tasks', boardId],
                (old: Task[] | undefined) => {
                  if (!old) return [newRecord as Task];
                  const exists = old.some((t) => t.id === newRecord.id);
                  return exists ? old : [...old, newRecord as Task];
                }
              );
              break;

            case 'UPDATE':
              // Update scalar fields from DB
              queryClient.setQueryData(
                ['tasks', boardId],
                (old: Task[] | undefined) => {
                  if (!old) return old;
                  return old.map((task) => {
                    if (task.id !== newRecord.id) return task;
                    return { ...task, ...newRecord } as Task;
                  });
                }
              );
              break;

            case 'DELETE':
              queryClient.setQueryData(
                ['tasks', boardId],
                (old: Task[] | undefined) => {
                  if (!old) return old;
                  return old.filter((task) => task.id !== oldRecord.id);
                }
              );
              break;
          }
        }
      );
    }
    // Listen for changes to task assignees (no filter - catches all tasks including newly created ones)
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'task_assignees',
      },
      async (payload) => {
        // Only process if the task belongs to one of our lists
        const newRecord = payload.new as { task_id?: string } | undefined;
        const oldRecord = payload.old as { task_id?: string } | undefined;
        const taskId = newRecord?.task_id || oldRecord?.task_id;
        if (taskId && stableTaskIds.includes(taskId)) {
          queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
        }
      }
    );

    // Listen for changes to task labels (no filter - catches all tasks including newly created ones)
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'task_labels',
      },
      async (payload) => {
        // Only process if the task belongs to one of our lists
        const newRecord = payload.new as { task_id?: string } | undefined;
        const oldRecord = payload.old as { task_id?: string } | undefined;
        const taskId = newRecord?.task_id || oldRecord?.task_id;
        if (taskId && stableTaskIds.includes(taskId)) {
          queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
        }
      }
    );

    // Listen for changes to workspace labels (affects all tasks in the workspace)
    // Note: workspace_task_labels has ws_id, not task_id
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'workspace_task_labels',
      },
      async (payload) => {
        const newRecord = payload.new as { id?: string } | undefined;
        const oldRecord = payload.old as { id?: string } | undefined;
        const labelId = newRecord?.id || oldRecord?.id;

        if (!labelId) return;

        const { data: linkedTasks, error } = await supabase
          .from('task_labels')
          .select('task_id')
          .eq('label_id', labelId);

        if (error) {
          console.error(
            'Failed to fetch task_labels for workspace label:',
            error
          );
          return;
        }

        if (
          linkedTasks?.some(
            ({ task_id }) => task_id && stableTaskIds.includes(task_id)
          )
        ) {
          queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
        }
      }
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    boardId,
    stableTaskIds,
    stableListIds,
    queryClient,
    handleTaskChange,
    handleListChange,
  ]);
}
