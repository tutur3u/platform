import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useEffect } from 'react';

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

        if (options?.onListChange && (oldRecord || newRecord)) {
          options.onListChange((oldRecord || newRecord) as TaskList, eventType);
        }

        queryClient.invalidateQueries({
          queryKey: ['task_lists', boardId],
        });
        queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
      }
    );

    if (listIds.length > 0) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `list_id=in.(${listIds.join(',')})`,
        },
        async (payload) => {
          if (!mounted) return;

          const { eventType, old: oldRecord, new: newRecord } = payload;

          // Call custom callback if provided
          if (options?.onTaskChange && (oldRecord || newRecord)) {
            options.onTaskChange((oldRecord || newRecord) as Task, eventType);
          }

          // Update React Query cache
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
              queryClient.setQueryData(
                ['tasks', boardId],
                (old: Task[] | undefined) => {
                  if (!old) return old;
                  return old.map((task) =>
                    task.id === newRecord.id
                      ? ({ ...task, ...newRecord } as Task)
                      : task
                  );
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

          queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
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

        // Only invalidate if the task belongs to one of our lists
        const newRecord = payload.new as { task_id?: string } | undefined;
        const oldRecord = payload.old as { task_id?: string } | undefined;
        const taskId = newRecord?.task_id || oldRecord?.task_id;
        if (taskId && taskIds.includes(taskId)) {
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
        if (!mounted) return;

        // Only invalidate if the task belongs to one of our lists
        const newRecord = payload.new as { task_id?: string } | undefined;
        const oldRecord = payload.old as { task_id?: string } | undefined;
        const taskId = newRecord?.task_id || oldRecord?.task_id;
        if (taskId && taskIds.includes(taskId)) {
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
    taskIds,
    listIds,
    queryClient,
    options?.onTaskChange,
    options?.onListChange,
  ]);
}
