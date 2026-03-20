import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteWorkspaceTask,
  listWorkspaceTasks,
  updateWorkspaceTask,
} from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';

import { transformTaskRecord } from '../task/transformers';
import { getBrowserApiOptions } from './shared';

type UseDeletedTasksOptions = {
  enabled?: boolean;
  staleTime?: number;
};

export function useDeletedTasks(
  boardId: string,
  wsId: string,
  options?: UseDeletedTasksOptions
) {
  return useQuery({
    queryKey: ['deleted-tasks', boardId],
    queryFn: async () => {
      const clientOptions = getBrowserApiOptions();
      const { tasks } = await listWorkspaceTasks(
        wsId,
        {
          boardId,
          includeDeleted: 'only',
        },
        clientOptions
      );

      return tasks.map((task) => transformTaskRecord(task));
    },
    enabled: options?.enabled,
    staleTime: options?.staleTime ?? 5 * 60 * 1000,
  });
}

export function useRestoreTasks(boardId: string, wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskIds,
      fallbackListId,
    }: {
      taskIds: string[];
      fallbackListId?: string;
    }) => {
      const restoredTasks: Task[] = [];
      for (const taskId of taskIds) {
        try {
          const { task } = await updateWorkspaceTask(
            wsId,
            taskId,
            { deleted: false },
            getBrowserApiOptions()
          );
          restoredTasks.push(task as Task);
        } catch {
          if (!fallbackListId) {
            continue;
          }

          const { task } = await updateWorkspaceTask(
            wsId,
            taskId,
            { deleted: false, list_id: fallbackListId },
            getBrowserApiOptions()
          );
          restoredTasks.push(task as Task);
        }
      }

      return restoredTasks;
    },
    onMutate: async ({ taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['deleted-tasks', boardId] });
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

      const previousDeletedTasks = queryClient.getQueryData([
        'deleted-tasks',
        boardId,
      ]) as Task[] | undefined;
      const previousTasks = queryClient.getQueryData(['tasks', boardId]) as
        | Task[]
        | undefined;

      const restoringTasks =
        previousDeletedTasks?.filter((t) => taskIds.includes(t.id)) || [];

      queryClient.setQueryData(
        ['deleted-tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.filter((task) => !taskIds.includes(task.id));
        }
      );

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old)
            return restoringTasks.map((t) => ({ ...t, deleted_at: null }));
          return [
            ...old,
            ...restoringTasks.map((t) => ({ ...t, deleted_at: null })),
          ];
        }
      );

      return { previousDeletedTasks, previousTasks };
    },
    onError: (err, _, context) => {
      if (context?.previousDeletedTasks) {
        queryClient.setQueryData(
          ['deleted-tasks', boardId],
          context.previousDeletedTasks
        );
      }
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }

      console.error('Failed to restore tasks:', err);
    },
    onSuccess: (restoredTasks) => {
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return restoredTasks;
          const restoredIds = new Set(restoredTasks.map((t) => t.id));
          const otherTasks = old.filter((t) => !restoredIds.has(t.id));
          return [...otherTasks, ...restoredTasks];
        }
      );
    },
  });
}

export function usePermanentlyDeleteTasks(boardId: string, wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskIds: string[]) => {
      let count = 0;

      for (const taskId of taskIds) {
        try {
          await deleteWorkspaceTask(wsId, taskId, getBrowserApiOptions());
          count++;
        } catch (error) {
          console.error(`Failed to permanently delete task ${taskId}:`, error);
        }
      }

      return { count };
    },
    onMutate: async (taskIds) => {
      await queryClient.cancelQueries({ queryKey: ['deleted-tasks', boardId] });

      const previousDeletedTasks = queryClient.getQueryData([
        'deleted-tasks',
        boardId,
      ]) as Task[] | undefined;

      queryClient.setQueryData(
        ['deleted-tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.filter((task) => !taskIds.includes(task.id));
        }
      );

      return { previousDeletedTasks };
    },
    onError: (err, _, context) => {
      if (context?.previousDeletedTasks) {
        queryClient.setQueryData(
          ['deleted-tasks', boardId],
          context.previousDeletedTasks
        );
      }

      console.error('Failed to permanently delete tasks:', err);
    },
  });
}
