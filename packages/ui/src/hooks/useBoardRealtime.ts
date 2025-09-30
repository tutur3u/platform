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
    if (!boardId || taskIds.length === 0 || listIds.length === 0) return;

    let mounted = true;
    const supabase = createClient();

    const channel = supabase
      .channel(`board-realtime-${boardId}`)
      .on(
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
      )
      .on(
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
            options.onListChange(
              (oldRecord || newRecord) as TaskList,
              eventType
            );
          }

          queryClient.invalidateQueries({ queryKey: ['task_lists', boardId] });
          queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_assignees',
          filter: `task_id=in.(${taskIds.join(',')})`,
        },
        async (_payload) => {
          if (!mounted) return;

          queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_labels',
          filter: `task_id=in.(${taskIds.join(',')})`,
        },
        async (_payload) => {
          if (!mounted) return;

          queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'workspace_task_labels',
        },
        async (_payload) => {
          if (!mounted) return;

          queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
        }
      )
      .subscribe();

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
