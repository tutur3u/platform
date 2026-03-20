import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  moveWorkspaceTask,
  updateWorkspaceTask,
} from '@tuturuuu/internal-api/tasks';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Task } from '@tuturuuu/types/primitives/Task';

import { getBrowserApiOptions, listAllActiveTasksForList } from './shared';
import { moveTaskToBoard } from './task-operations';

export function useMoveAllTasksFromList(
  currentBoardId: string,
  wsId?: string,
  broadcast?: ((event: string, payload: Record<string, unknown>) => void) | null
) {
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
      if (!wsId) {
        throw new Error('Workspace ID is required to move tasks');
      }

      const tasksToMove = await listAllActiveTasksForList(wsId, sourceListId);
      if (tasksToMove.length === 0) {
        return { success: true, movedCount: 0, movedTaskIds: [] as string[] };
      }

      const results = [] as {
        status: 'fulfilled' | 'rejected';
        taskId: string;
      }[];

      for (const task of tasksToMove) {
        try {
          await moveWorkspaceTask(
            wsId,
            task.id,
            {
              list_id: targetListId,
              target_board_id: targetBoardId,
            },
            getBrowserApiOptions()
          );
          results.push({ status: 'fulfilled', taskId: task.id });
        } catch (error) {
          console.error('Failed to move task:', task.id, error);
          results.push({ status: 'rejected', taskId: task.id });
        }
      }

      const movedTaskIds = results
        .filter((result) => result.status === 'fulfilled')
        .map((result) => result.taskId);

      if (movedTaskIds.length !== tasksToMove.length) {
        throw new Error(
          `Failed to move ${tasksToMove.length - movedTaskIds.length} out of ${tasksToMove.length} tasks`
        );
      }

      return {
        success: true,
        movedCount: movedTaskIds.length,
        movedTaskIds,
      };
    },
    onMutate: async ({ sourceListId, targetListId, targetBoardId }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', currentBoardId] });
      if (targetBoardId && targetBoardId !== currentBoardId) {
        await queryClient.cancelQueries({ queryKey: ['tasks', targetBoardId] });
      }

      const previousSourceTasks = queryClient.getQueryData([
        'tasks',
        currentBoardId,
      ]);
      const previousTargetTasks =
        targetBoardId && targetBoardId !== currentBoardId
          ? queryClient.getQueryData(['tasks', targetBoardId])
          : null;

      const sourceTasks = previousSourceTasks as Task[] | undefined;
      const tasksToMove =
        sourceTasks?.filter((task) => task.list_id === sourceListId) || [];

      if (tasksToMove.length === 0) {
        return { previousSourceTasks, previousTargetTasks, targetBoardId };
      }

      if (targetBoardId && targetBoardId !== currentBoardId) {
        queryClient.setQueryData(
          ['tasks', currentBoardId],
          (oldData: Task[] | undefined) => {
            if (!oldData) return oldData;
            return oldData.filter((task) => task.list_id !== sourceListId);
          }
        );

        queryClient.setQueryData(
          ['tasks', targetBoardId],
          (oldData: Task[] | undefined) => {
            const updatedTasks = tasksToMove.map((task) => ({
              ...task,
              list_id: targetListId,
            }));

            if (!oldData) return updatedTasks;

            const filteredOldData = oldData.filter(
              (task) =>
                !tasksToMove.some((movingTask) => movingTask.id === task.id)
            );
            return [...filteredOldData, ...updatedTasks];
          }
        );
      } else {
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

      console.error('Bulk list move failed:', err);
    },
    onSuccess: (data, variables) => {
      const movedTaskIds = data.movedTaskIds ?? [];

      if (
        variables.targetBoardId &&
        variables.targetBoardId !== currentBoardId
      ) {
        for (const taskId of movedTaskIds) {
          broadcast?.('task:delete', { taskId });
        }
      } else {
        for (const taskId of movedTaskIds) {
          broadcast?.('task:upsert', {
            task: { id: taskId, list_id: variables.targetListId },
          });
        }
      }

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

export async function moveAllTasksFromList(
  supabase: TypedSupabaseClient,
  sourceListId: string,
  targetListId: string,
  targetBoardId?: string
) {
  const { data: tasksToMove, error: fetchError } = await supabase
    .from('tasks')
    .select('id, list_id, task_lists!inner(board_id)')
    .eq('list_id', sourceListId)
    .is('deleted_at', null);

  if (fetchError) {
    throw new Error(`Failed to fetch tasks: ${fetchError.message}`);
  }

  if (!tasksToMove || tasksToMove.length === 0) {
    return { success: true, movedCount: 0, movedTaskIds: [] as string[] };
  }

  const results: {
    status: 'fulfilled' | 'rejected';
    value?: { success: boolean; taskId: string };
    reason?: unknown;
  }[] = [];

  for (const task of tasksToMove) {
    try {
      await moveTaskToBoard(supabase, task.id, targetListId, targetBoardId);
      results.push({
        status: 'fulfilled',
        value: { success: true, taskId: task.id },
      });
    } catch (error) {
      results.push({ status: 'rejected', reason: error });
    }
  }

  const successful = results.filter(
    (result) => result.status === 'fulfilled' && result.value?.success
  ).length;

  const failed = results.length - successful;

  if (failed > 0) {
    throw new Error(`Failed to move ${failed} out of ${results.length} tasks`);
  }

  const movedTaskIds = results
    .filter((result) => result.status === 'fulfilled' && result.value)
    .map((result) => result.value!.taskId);

  return { success: true, movedCount: successful, movedTaskIds };
}

export function useClearAllAssigneesFromList(boardId: string, wsId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (listId: string) => {
      if (!wsId) {
        throw new Error('Workspace ID is required to clear assignees');
      }
      const tasks = await listAllActiveTasksForList(wsId, listId);
      let count = 0;

      for (const task of tasks) {
        try {
          await updateWorkspaceTask(
            wsId,
            task.id,
            { assignee_ids: [] },
            getBrowserApiOptions()
          );
          count++;
        } catch (error) {
          console.error(
            `Failed to clear assignees for task ${task.id}:`,
            error
          );
        }
      }

      return { count };
    },
    onMutate: async (listId) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((task) =>
            task.list_id === listId ? { ...task, assignees: [] } : task
          );
        }
      );

      return { previousTasks };
    },
    onError: (err, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Failed to clear all assignees:', err);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
    },
  });
}

export function useClearAllLabelsFromList(boardId: string, wsId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (listId: string) => {
      if (!wsId) {
        throw new Error('Workspace ID is required to clear labels');
      }
      const tasks = await listAllActiveTasksForList(wsId, listId);
      let count = 0;

      for (const task of tasks) {
        try {
          await updateWorkspaceTask(
            wsId,
            task.id,
            { label_ids: [] },
            getBrowserApiOptions()
          );
          count++;
        } catch (error) {
          console.error(`Failed to clear labels for task ${task.id}:`, error);
        }
      }

      return { count };
    },
    onMutate: async (listId) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((task) =>
            task.list_id === listId ? { ...task, labels: [] } : task
          );
        }
      );

      return { previousTasks };
    },
    onError: (err, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Failed to clear all labels:', err);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
    },
  });
}

export function useClearAllProjectsFromList(boardId: string, wsId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (listId: string) => {
      if (!wsId) {
        throw new Error('Workspace ID is required to clear projects');
      }
      const tasks = await listAllActiveTasksForList(wsId, listId);
      let count = 0;

      for (const task of tasks) {
        try {
          await updateWorkspaceTask(
            wsId,
            task.id,
            { project_ids: [] },
            getBrowserApiOptions()
          );
          count++;
        } catch (error) {
          console.error(`Failed to clear projects for task ${task.id}:`, error);
        }
      }

      return { count };
    },
    onMutate: async (listId) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((task) =>
            task.list_id === listId ? { ...task, projects: [] } : task
          );
        }
      );

      return { previousTasks };
    },
    onError: (err, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Failed to clear all projects:', err);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
    },
  });
}
