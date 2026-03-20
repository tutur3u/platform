import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createWorkspaceTask,
  getWorkspaceTaskRelationships,
  updateWorkspaceTask,
} from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';

import { getBrowserApiOptions, toWorkspaceTaskUpdatePayload } from './shared';

export function useUpdateTask(boardId: string, wsId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      updates,
    }: {
      taskId: string;
      updates: Partial<Task>;
    }) => {
      if (!wsId) {
        throw new Error('Workspace ID is required to update tasks');
      }
      const { task } = await updateWorkspaceTask(
        wsId,
        taskId,
        toWorkspaceTaskUpdatePayload(updates),
        getBrowserApiOptions()
      );
      return task as Task;
    },
    onMutate: async ({ taskId, updates }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      let blockedTaskIdsPromise: Promise<string[]> | null = null;
      if (
        updates.completed_at !== undefined ||
        updates.closed_at !== undefined
      ) {
        if (wsId) {
          blockedTaskIdsPromise = Promise.resolve(
            getWorkspaceTaskRelationships(wsId, taskId, getBrowserApiOptions())
          )
            .then((relationships) =>
              (relationships.blocking ?? []).map((task) => task.id)
            )
            .catch((err: unknown) => {
              console.error('Failed to fetch blocked task IDs:', err);
              return [];
            });
        }
      }

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((task) =>
            task.id === taskId ? { ...task, ...updates } : task
          );
        }
      );

      return { previousTasks, blockedTaskIdsPromise };
    },
    onError: (err, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }

      console.error('Failed to update task:', err);
    },
    onSuccess: async (updatedTask, variables, context) => {
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((task) => {
            if (task.id === updatedTask.id) {
              return {
                ...updatedTask,
                assignees: task.assignees,
                labels: task.labels,
                projects: task.projects,
              };
            }
            return task;
          });
        }
      );

      if (
        variables.updates.completed_at !== undefined ||
        variables.updates.closed_at !== undefined
      ) {
        await queryClient.invalidateQueries({
          queryKey: ['task-relationships', variables.taskId],
        });

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

export function useCreateTask(boardId: string, wsId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      listId,
      task,
    }: {
      listId: string;
      task: Partial<Task> & {
        description_yjs_state?: number[];
        label_ids?: string[];
        assignee_ids?: string[];
        project_ids?: string[];
      };
    }) => {
      if (!wsId) {
        throw new Error('Workspace ID is required to create tasks');
      }
      if (!task.name || !task.name.trim()) {
        throw new Error('Task name is required');
      }

      const { task: createdTask } = await createWorkspaceTask(
        wsId,
        {
          name: task.name.trim(),
          description: task.description || null,
          description_yjs_state: task.description_yjs_state ?? null,
          listId,
          priority: task.priority || null,
          start_date: task.start_date || null,
          end_date: task.end_date || null,
          estimation_points: task.estimation_points ?? null,
          label_ids: task.label_ids ?? [],
          assignee_ids: task.assignee_ids ?? [],
          project_ids: task.project_ids ?? [],
          total_duration: task.total_duration ?? null,
          is_splittable: task.is_splittable ?? null,
          min_split_duration_minutes: task.min_split_duration_minutes ?? null,
          max_split_duration_minutes: task.max_split_duration_minutes ?? null,
          calendar_hours: task.calendar_hours ?? null,
          auto_schedule: task.auto_schedule ?? null,
        },
        getBrowserApiOptions()
      );

      return createdTask as Task;
    },
    onMutate: async ({ listId, task }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      const optimisticTask: Task = {
        id: `temp-${Date.now()}`,
        name: task.name || 'New Task',
        description: task.description,
        list_id: listId,
        start_date: task.start_date,
        end_date: task.end_date,
        priority: task.priority,
        closed_at: null,
        deleted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        assignees: [],
        ...task,
      } as Task;

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
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }

      console.error('Failed to create task:', err);
    },
    onSuccess: (newTask, _, context) => {
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

export function useDeleteTask(boardId: string, wsId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      if (!wsId) {
        throw new Error('Workspace ID is required to delete tasks');
      }
      const { task } = await updateWorkspaceTask(
        wsId,
        taskId,
        { deleted: true },
        getBrowserApiOptions()
      );
      return task as Task;
    },
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      await queryClient.cancelQueries({ queryKey: ['deleted-tasks', boardId] });

      const previousTasks = queryClient.getQueryData(['tasks', boardId]) as
        | Task[]
        | undefined;
      const previousDeletedTasks = queryClient.getQueryData([
        'deleted-tasks',
        boardId,
      ]) as Task[] | undefined;

      const deletedTask = previousTasks?.find((task) => task.id === taskId);

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.filter((task) => task.id !== taskId);
        }
      );

      if (deletedTask) {
        queryClient.setQueryData(
          ['deleted-tasks', boardId],
          (old: Task[] | undefined) => {
            const taskWithDeletedAt = {
              ...deletedTask,
              deleted_at: new Date().toISOString(),
            };
            if (!old) return [taskWithDeletedAt];
            return [taskWithDeletedAt, ...old];
          }
        );
      }

      return { previousTasks, previousDeletedTasks, deletedTask };
    },
    onError: (err, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      if (context?.previousDeletedTasks) {
        queryClient.setQueryData(
          ['deleted-tasks', boardId],
          context.previousDeletedTasks
        );
      }

      console.error('Failed to delete task:', err);
    },
  });
}
