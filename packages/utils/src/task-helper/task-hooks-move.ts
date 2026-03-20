import { useMutation, useQueryClient } from '@tanstack/react-query';
import { moveWorkspaceTask } from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';

import { getBrowserApiOptions } from './shared';
import { moveTask } from './task-operations';

export function useMoveTask(boardId: string, wsId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      newListId,
    }: {
      taskId: string;
      newListId: string;
    }) => {
      if (!wsId) {
        console.error('Workspace ID missing for moveTask');
        throw new Error('Workspace ID is required to move tasks');
      }

      const baseUrl =
        typeof window !== 'undefined' ? window.location.origin : undefined;
      const result = await moveTask(wsId, taskId, newListId, {
        baseUrl: baseUrl ?? undefined,
      });

      return result;
    },
    onMutate: async ({ taskId, newListId }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

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
                closed_at: shouldArchive ? new Date().toISOString() : null,
              };
            }
            return task;
          });
        }
      );

      return { previousTasks };
    },
    onError: (err, _variables, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }

      console.error('Failed to move task:', err);
    },
    onSuccess: (updatedTask) => {
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

export function useMoveTaskToBoard(currentBoardId: string, wsId?: string) {
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
      if (!wsId) {
        throw new Error('Workspace ID is required to move tasks');
      }

      const result = await moveWorkspaceTask(
        wsId,
        taskId,
        {
          list_id: newListId,
          target_board_id: targetBoardId,
        },
        getBrowserApiOptions()
      );

      return result;
    },
    onMutate: async ({ taskId, newListId, targetBoardId }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', currentBoardId] });
      if (targetBoardId && targetBoardId !== currentBoardId) {
        await queryClient.cancelQueries({ queryKey: ['tasks', targetBoardId] });
      }

      const previousCurrentBoardTasks = queryClient.getQueryData([
        'tasks',
        currentBoardId,
      ]);
      const previousTargetBoardTasks =
        targetBoardId && targetBoardId !== currentBoardId
          ? queryClient.getQueryData(['tasks', targetBoardId])
          : null;

      if (targetBoardId && targetBoardId !== currentBoardId) {
        queryClient.setQueryData(
          ['tasks', currentBoardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.filter((task) => task.id !== taskId);
          }
        );

        queryClient.setQueryData(
          ['tasks', targetBoardId],
          (old: Task[] | undefined) => {
            if (!old) return old;

            const currentBoardTasks = previousCurrentBoardTasks as
              | Task[]
              | undefined;
            const taskToMove = currentBoardTasks?.find((t) => t.id === taskId);

            if (!taskToMove) return old;

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

            return [...old, updatedTask];
          }
        );
      } else {
        queryClient.setQueryData(
          ['tasks', currentBoardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.map((task) => {
              if (task.id === taskId) {
                const targetList = queryClient.getQueryData([
                  'task_lists',
                  currentBoardId,
                ]) as TaskList[] | undefined;
                const list = targetList?.find((l) => l.id === newListId);
                const shouldArchive =
                  list?.status === 'done' || list?.status === 'closed';

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

      return {
        previousCurrentBoardTasks,
        previousTargetBoardTasks,
        targetBoardId: targetBoardId || currentBoardId,
      };
    },
    onError: (err, _variables, context) => {
      if (context?.previousCurrentBoardTasks) {
        queryClient.setQueryData(
          ['tasks', currentBoardId],
          context.previousCurrentBoardTasks
        );
      }

      if (
        context?.previousTargetBoardTasks &&
        context.targetBoardId !== currentBoardId
      ) {
        queryClient.setQueryData(
          ['tasks', context.targetBoardId],
          context.previousTargetBoardTasks
        );
      }

      console.error('Failed to move task to board:', err);
    },
    onSuccess: (result) => {
      if (result.movedToDifferentBoard) {
        queryClient.setQueryData(
          ['tasks', result.sourceBoardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.filter((task) => task.id !== result.task.id);
          }
        );

        queryClient.setQueryData(
          ['tasks', result.targetBoardId],
          (old: Task[] | undefined) => {
            if (!old) return [result.task];

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
      } else {
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
    },
  });
}
