'use client';

import { type QueryClient, useMutation } from '@tanstack/react-query';
import {
  listWorkspaceTasks,
  updateWorkspaceTask,
} from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { toast } from '@tuturuuu/ui/sonner';
import type { BoardBroadcastFn } from '../../../../shared/board-broadcast-context';
import type { BulkOperationI18n } from './bulk-operation-i18n';
import type { WorkspaceProject } from './bulk-operation-types';
import {
  getInternalApiOptions,
  getTaskForRelationMutation,
} from './bulk-operation-utils';

export function useBulkAddProject(
  queryClient: QueryClient,
  wsId: string,
  boardId: string,
  workspaceProjects: WorkspaceProject[],
  broadcast?: BoardBroadcastFn | null,
  i18n?: BulkOperationI18n
) {
  return useMutation({
    mutationFn: async ({
      projectId,
      taskIds,
    }: {
      projectId: string;
      taskIds: string[];
    }) => {
      let successCount = 0;
      const failures: Array<{ taskId: string; error: string }> = [];
      const apiOptions = getInternalApiOptions();

      const cachedTasks =
        (queryClient.getQueryData(['tasks', boardId]) as Task[] | undefined) ??
        [];
      const cachedTaskIds = new Set(cachedTasks.map((task) => task.id));
      const uncachedTaskIds = taskIds.filter(
        (taskId) => !cachedTaskIds.has(taskId)
      );

      if (uncachedTaskIds.length > 0) {
        try {
          const { tasks } = await listWorkspaceTasks(
            wsId,
            { boardId, includeRelationshipSummary: true },
            apiOptions
          );

          if (tasks.length > 0) {
            queryClient.setQueryData(
              ['tasks', boardId],
              (old: Task[] | undefined) => {
                const existing = old ?? [];
                const merged = new Map(existing.map((task) => [task.id, task]));
                for (const fetchedTask of tasks) {
                  merged.set(fetchedTask.id, fetchedTask as Task);
                }
                return Array.from(merged.values());
              }
            );
          }
        } catch {
          // Continue with per-task fallback fetches in getTaskForRelationMutation.
        }
      }

      for (const taskId of taskIds) {
        try {
          const taskRecord = await getTaskForRelationMutation(
            queryClient,
            boardId,
            wsId,
            taskId
          );

          if (!taskRecord) {
            throw new Error('Task not found');
          }

          const currentProjectIds = (taskRecord.projects || [])
            .map((project) => project.id)
            .filter((id): id is string => !!id);

          const nextProjectIds = [
            ...new Set([...currentProjectIds, projectId]),
          ];

          await updateWorkspaceTask(
            wsId,
            taskId,
            { project_ids: nextProjectIds },
            apiOptions
          );
          successCount++;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          if (!message.toLowerCase().includes('duplicate')) {
            failures.push({ taskId, error: message });
          } else {
            successCount++;
          }
        }
      }

      if (successCount === 0) {
        throw new Error(`Failed to add project to all ${taskIds.length} tasks`);
      }

      return { count: successCount, projectId, taskIds, failures };
    },
    onMutate: async ({ projectId, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);
      const current = (previousTasks as Task[] | undefined) || [];
      const projectMeta = workspaceProjects.find((p) => p.id === projectId);

      const missingTaskIds = taskIds.filter((id) => {
        const task = current.find((ct) => ct.id === id);
        return !task?.projects?.some((p) => p.id === projectId);
      });

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((task) => {
            if (!missingTaskIds.includes(task.id)) return task;
            return {
              ...task,
              projects: [
                ...(task.projects || []),
                {
                  id: projectId,
                  name:
                    projectMeta?.name ||
                    i18n?.defaultProjectName() ||
                    'Project',
                  status: projectMeta?.status ?? 'unknown',
                },
              ],
            };
          });
        }
      );

      return { previousTasks, modifiedTaskIds: missingTaskIds };
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk add project failed', error);
      toast.error(
        i18n?.failedAddProject() ?? 'Failed to add project to selected tasks'
      );
    },
    onSuccess: (data, _variables, context) => {
      const failedTaskIds = new Set(
        data.failures.map((failure) => failure.taskId)
      );

      if (failedTaskIds.size > 0 && Array.isArray(context?.previousTasks)) {
        const previousTaskMap = new Map(
          (context.previousTasks as Task[]).map((task) => [task.id, task])
        );

        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.map((task) => {
              if (!failedTaskIds.has(task.id)) return task;
              return previousTaskMap.get(task.id) ?? task;
            });
          }
        );
      }

      const modifiedTaskIds = context?.modifiedTaskIds ?? data.taskIds;
      const succeededModifiedTaskIds = modifiedTaskIds.filter(
        (taskId) => !failedTaskIds.has(taskId)
      );

      for (const tid of succeededModifiedTaskIds) {
        broadcast?.('task:relations-changed', { taskId: tid });
      }

      const projectMeta = workspaceProjects.find(
        (p) => p.id === data.projectId
      );
      const projectName =
        projectMeta?.name || i18n?.defaultProjectName() || 'Project';

      if (data.failures.length > 0) {
        toast.warning(
          i18n?.partialProjectAdditionCompletedTitle() ??
            'Partial project addition completed',
          {
            description:
              i18n?.projectAddedPartialDescription(
                projectName,
                data.count,
                data.failures.length
              ) ??
              `Added "${projectName}" to ${data.count} task${data.count === 1 ? '' : 's'}, ${data.failures.length} failed`,
          }
        );
      } else {
        toast.success(i18n?.projectAddedTitle() ?? 'Project added', {
          description:
            i18n?.projectAddedDescription(projectName, data.count) ??
            `Added "${projectName}" to ${data.count} task${data.count === 1 ? '' : 's'}`,
        });
      }
    },
  });
}

export function useBulkRemoveProject(
  queryClient: QueryClient,
  wsId: string,
  boardId: string,
  workspaceProjects: WorkspaceProject[],
  broadcast?: BoardBroadcastFn | null,
  i18n?: BulkOperationI18n
) {
  return useMutation({
    mutationFn: async ({
      projectId,
      taskIds,
    }: {
      projectId: string;
      taskIds: string[];
    }) => {
      let successCount = 0;
      const succeededTaskIds: string[] = [];
      const failures: Array<{ taskId: string; error: string }> = [];
      const apiOptions = getInternalApiOptions();

      const cachedTasks =
        (queryClient.getQueryData(['tasks', boardId]) as Task[] | undefined) ??
        [];
      const cachedTaskIds = new Set(cachedTasks.map((task) => task.id));
      const uncachedTaskIds = taskIds.filter(
        (taskId) => !cachedTaskIds.has(taskId)
      );

      if (uncachedTaskIds.length > 0) {
        try {
          const { tasks } = await listWorkspaceTasks(
            wsId,
            { boardId, includeRelationshipSummary: true },
            apiOptions
          );

          if (tasks.length > 0) {
            queryClient.setQueryData(
              ['tasks', boardId],
              (old: Task[] | undefined) => {
                const existing = old ?? [];
                const merged = new Map(existing.map((task) => [task.id, task]));
                for (const fetchedTask of tasks) {
                  merged.set(fetchedTask.id, fetchedTask as Task);
                }
                return Array.from(merged.values());
              }
            );
          }
        } catch {
          // Continue with per-task fallback fetches in getTaskForRelationMutation.
        }
      }

      for (const taskId of taskIds) {
        try {
          const taskRecord = await getTaskForRelationMutation(
            queryClient,
            boardId,
            wsId,
            taskId
          );

          if (!taskRecord) {
            throw new Error('Task not found');
          }

          const nextProjectIds = (taskRecord.projects || [])
            .map((project) => project.id)
            .filter((id): id is string => !!id && id !== projectId);

          await updateWorkspaceTask(
            wsId,
            taskId,
            { project_ids: nextProjectIds },
            apiOptions
          );
          succeededTaskIds.push(taskId);
          successCount++;
        } catch (error) {
          failures.push({
            taskId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      if (successCount === 0) {
        throw new Error(
          `Failed to remove project from all ${taskIds.length} tasks`
        );
      }

      return {
        count: successCount,
        projectId,
        taskIds,
        failures,
        succeededTaskIds,
      };
    },
    onMutate: async ({ projectId, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);
      const current = (previousTasks as Task[] | undefined) || [];
      const modifiedTaskIds = taskIds.filter((id) => {
        const task = current.find((ct) => ct.id === id);
        if (!task) {
          return true;
        }

        return !!task.projects?.some((project) => project.id === projectId);
      });
      const taskIdSet = new Set(taskIds);

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((task) =>
            taskIdSet.has(task.id)
              ? {
                  ...task,
                  projects: (task.projects || []).filter(
                    (p) => p.id !== projectId
                  ),
                }
              : task
          );
        }
      );

      return { previousTasks, modifiedTaskIds };
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk remove project failed', error);
      toast.error(
        i18n?.failedRemoveProject() ??
          'Failed to remove project from selected tasks'
      );
    },
    onSuccess: (data, _variables, context) => {
      const failedTaskIds = new Set(
        data.failures.map((failure) => failure.taskId)
      );

      if (failedTaskIds.size > 0 && Array.isArray(context?.previousTasks)) {
        const previousTaskMap = new Map(
          (context.previousTasks as Task[]).map((task) => [task.id, task])
        );

        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.map((task) => {
              if (!failedTaskIds.has(task.id)) return task;
              return previousTaskMap.get(task.id) ?? task;
            });
          }
        );
      }

      const modifiedTaskIds = context?.modifiedTaskIds ?? data.succeededTaskIds;
      const modifiedTaskIdSet = new Set(modifiedTaskIds);
      const succeededModifiedTaskIds = data.succeededTaskIds.filter(
        (taskId) => modifiedTaskIdSet.has(taskId) && !failedTaskIds.has(taskId)
      );

      for (const tid of succeededModifiedTaskIds) {
        broadcast?.('task:relations-changed', { taskId: tid });
      }

      const projectMeta = workspaceProjects.find(
        (p) => p.id === data.projectId
      );
      const projectName =
        projectMeta?.name || i18n?.defaultProjectName() || 'Project';

      if (data.failures.length > 0) {
        toast.warning(
          i18n?.partialProjectRemovalCompletedTitle() ??
            'Partial project removal completed',
          {
            description:
              i18n?.projectRemovedPartialDescription(
                projectName,
                data.count,
                data.failures.length
              ) ??
              `Removed "${projectName}" from ${data.count} task${data.count === 1 ? '' : 's'}, ${data.failures.length} failed`,
          }
        );
      } else {
        toast.success(i18n?.projectRemovedTitle() ?? 'Project removed', {
          description:
            i18n?.projectRemovedDescription(projectName, data.count) ??
            `Removed "${projectName}" from ${data.count} task${data.count === 1 ? '' : 's'}`,
        });
      }
    },
  });
}
