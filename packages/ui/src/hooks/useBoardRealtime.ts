import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useCallback, useEffect, useRef } from 'react';

// Custom hook to create stable array references
function useStableArray<T>(array: T[]): T[] {
  const ref = useRef<T[]>(array);
  const prevArrayRef = useRef<T[]>(array);

  if (
    array.length !== prevArrayRef.current.length ||
    array.some((item, index) => item !== prevArrayRef.current[index])
  ) {
    ref.current = array;
    prevArrayRef.current = array;
  }

  return ref.current;
}

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

  // Create stable array references to prevent unnecessary re-subscriptions
  const stableTaskIds = useStableArray(taskIds);
  const stableListIds = useStableArray(listIds);

  // Memoize callbacks to prevent unnecessary re-subscriptions
  const onTaskChangeRef = useRef(options?.onTaskChange);
  const onListChangeRef = useRef(options?.onListChange);

  // Update refs when callbacks change
  useEffect(() => {
    onTaskChangeRef.current = options?.onTaskChange;
    onListChangeRef.current = options?.onListChange;
  }, [options?.onTaskChange, options?.onListChange]);

  // Create stable callback functions
  const handleTaskChange = useCallback(
    (task: Task, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => {
      onTaskChangeRef.current?.(task, eventType);
    },
    []
  );

  const handleListChange = useCallback(
    (list: TaskList, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => {
      onListChangeRef.current?.(list, eventType);
    },
    []
  );

  useEffect(() => {
    if (!boardId) return;

    let mounted = true;
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
        if (!mounted) return;

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
          if (!mounted) return;

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
              // Update scalar fields from DB but preserve joined data from cache
              queryClient.setQueryData(
                ['tasks', boardId],
                (old: Task[] | undefined) => {
                  if (!old) return old;
                  return old.map((task) => {
                    if (task.id !== newRecord.id) return task;
                    // Merge DB update with cached joined data
                    return {
                      ...task,
                      ...newRecord,
                      // Always preserve joined data from cache
                      assignees: task.assignees,
                      labels: task.labels,
                    } as Task;
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
        if (!mounted) return;

        // Only process if the task belongs to one of our lists
        const newRecord = payload.new as { task_id?: string } | undefined;
        const oldRecord = payload.old as { task_id?: string } | undefined;
        const taskId = newRecord?.task_id || oldRecord?.task_id;
        if (taskId && stableTaskIds.includes(taskId)) {
          // Skip refetch - optimistic updates handle this
          // Realtime is only for other users' changes
          // The delay allows us to detect if this is our own change
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
        if (!mounted) return;

        // Only process if the task belongs to one of our lists
        const newRecord = payload.new as { task_id?: string } | undefined;
        const oldRecord = payload.old as { task_id?: string } | undefined;
        const taskId = newRecord?.task_id || oldRecord?.task_id;
        if (taskId && stableTaskIds.includes(taskId)) {
          // Skip refetch - optimistic updates handle this
          // Realtime is only for other users' changes
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
      async (_payload) => {
        if (!mounted) return;

        // Invalidate all tasks since label definitions changed
        queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
      }
    );

    channel.subscribe();

    return () => {
      mounted = false;
      channel.unsubscribe();
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
