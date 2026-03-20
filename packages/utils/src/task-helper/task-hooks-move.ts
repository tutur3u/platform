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
      console.log('🚀 Starting moveTask mutation');
      console.log('📋 Task ID:', taskId);
      console.log('🎯 New List ID:', newListId);

      if (!wsId) {
        console.error('Workspace ID missing for moveTask');
        throw new Error('Workspace ID is required to move tasks');
      }

      const baseUrl =
        typeof window !== 'undefined' ? window.location.origin : undefined;
      const result = await moveTask(wsId, taskId, newListId, {
        baseUrl: baseUrl ?? undefined,
      });

      console.log('✅ moveTask completed successfully via workspace API');
      console.log('📊 Result:', result);

      return result;
    },
    onMutate: async ({ taskId, newListId }) => {
      console.log('🎭 onMutate triggered - optimistic update');
      console.log('📋 Task ID:', taskId);
      console.log('🎯 New List ID:', newListId);

      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

      const previousTasks = queryClient.getQueryData(['tasks', boardId]);
      console.log('📸 Previous tasks snapshot saved');

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((task) => {
            if (task.id === taskId) {
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
      console.log('🚀 Starting moveTaskToBoard mutation');
      console.log('📋 Task ID:', taskId);
      console.log('🎯 New List ID:', newListId);
      console.log('📊 Target Board ID:', targetBoardId);

      const result = await moveWorkspaceTask(
        wsId,
        taskId,
        {
          list_id: newListId,
          target_board_id: targetBoardId,
        },
        getBrowserApiOptions()
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

      console.log('📸 Previous tasks snapshots saved');

      if (targetBoardId && targetBoardId !== currentBoardId) {
        console.log('🔄 Removing task from current board cache');
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

            console.log('🔄 Adding task to target board cache:', updatedTask);
            return [...old, updatedTask];
          }
        );
      } else {
        console.log('🔄 Updating task within same board');
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

      console.log('✅ Cache updated with server response');
    },
  });
}
