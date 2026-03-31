'use client';

import { type QueryClient, useMutation } from '@tanstack/react-query';
import { updateWorkspaceTask } from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { toast } from '@tuturuuu/ui/sonner';
import type { BoardBroadcastFn } from '../../../../shared/board-broadcast-context';
import type { BulkOperationI18n } from './bulk-operation-i18n';
import type { WorkspaceMember } from './bulk-operation-types';
import {
  getInternalApiOptions,
  getTaskForRelationMutation,
} from './bulk-operation-utils';

export function useBulkAddAssignee(
  queryClient: QueryClient,
  wsId: string,
  boardId: string,
  workspaceMembers: WorkspaceMember[] = [],
  broadcast?: BoardBroadcastFn | null,
  i18n?: BulkOperationI18n
) {
  const cachedMembers =
    (queryClient.getQueryData(['workspace-members', wsId]) as
      | WorkspaceMember[]
      | undefined) ?? [];
  const allWorkspaceMembers = [...workspaceMembers, ...cachedMembers];
  const resolveMember = (assigneeId: string) =>
    allWorkspaceMembers.find(
      (member) => member.id === assigneeId || member.user_id === assigneeId
    );

  return useMutation({
    mutationFn: async ({
      assigneeId,
      taskIds,
    }: {
      assigneeId: string;
      taskIds: string[];
    }) => {
      let successCount = 0;
      const succeededTaskIds: string[] = [];
      const failedTaskIds: string[] = [];
      const failures: Array<{ taskId: string; error: string }> = [];
      const updatedAssigneesByTaskId = new Map<string, Task['assignees']>();
      const apiOptions = getInternalApiOptions();

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

          const currentAssigneeIds = (taskRecord.assignees || [])
            .map((assignee) => assignee.id)
            .filter((id): id is string => !!id);

          const nextAssigneeIds = [
            ...new Set([...currentAssigneeIds, assigneeId]),
          ];

          const resolvedMember = resolveMember(assigneeId);
          const optimisticAssignee = {
            id: assigneeId,
            display_name:
              resolvedMember?.display_name ||
              resolvedMember?.email ||
              assigneeId,
            email: resolvedMember?.email || '',
            avatar_url: resolvedMember?.avatar_url ?? undefined,
          };
          const fallbackAssignees = taskRecord.assignees?.some(
            (assignee) => assignee.id === assigneeId
          )
            ? (taskRecord.assignees ?? [])
            : [...(taskRecord.assignees ?? []), optimisticAssignee];

          const { task: updatedTask } = await updateWorkspaceTask(
            wsId,
            taskId,
            { assignee_ids: nextAssigneeIds },
            apiOptions
          );
          updatedAssigneesByTaskId.set(
            taskId,
            updatedTask?.assignees ?? fallbackAssignees
          );
          succeededTaskIds.push(taskId);
          successCount++;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          if (!message.toLowerCase().includes('duplicate')) {
            failedTaskIds.push(taskId);
            failures.push({ taskId, error: message });
          } else {
            succeededTaskIds.push(taskId);
            successCount++;
          }
        }
      }

      if (successCount === 0) {
        throw new Error(
          `Failed to add assignee to all ${taskIds.length} tasks`
        );
      }

      return {
        count: successCount,
        assigneeId,
        taskIds,
        failures,
        succeededTaskIds,
        failedTaskIds,
        updatedAssigneesByTaskId,
      };
    },
    onMutate: async ({ assigneeId, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);
      const current = (previousTasks as Task[] | undefined) || [];

      const missingTaskIds = taskIds.filter((id) => {
        const task = current.find((ct) => ct.id === id);
        return !task?.assignees?.some((a) => a.id === assigneeId);
      });

      const member = resolveMember(assigneeId);
      const assigneeData = member || {
        id: assigneeId,
        display_name: assigneeId,
        email: '',
        avatar_url: undefined,
      };

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((task) => {
            if (!missingTaskIds.includes(task.id)) return task;
            return {
              ...task,
              assignees: [...(task.assignees || []), assigneeData],
            } as Task;
          });
        }
      );

      return { previousTasks, modifiedTaskIds: missingTaskIds };
    },
    onError: (error, variables, context) => {
      if (context?.previousTasks) {
        const previousTaskMap = new Map(
          ((context.previousTasks as Task[] | undefined) ?? []).map((task) => [
            task.id,
            task,
          ])
        );
        const requestedTaskIdSet = new Set(variables.taskIds);

        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.map((task) => {
              if (!requestedTaskIdSet.has(task.id)) return task;
              return previousTaskMap.get(task.id) ?? task;
            });
          }
        );
      }
      console.error('Bulk add assignee failed', error);
      toast.error(
        i18n?.failedAddAssignee() ?? 'Failed to add assignee to selected tasks'
      );
    },
    onSuccess: (data, _variables, context) => {
      if (
        data.failedTaskIds.length > 0 &&
        Array.isArray(context?.previousTasks)
      ) {
        const previousTaskMap = new Map(
          (context.previousTasks as Task[]).map((task) => [task.id, task])
        );

        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            const failedIdSet = new Set(data.failedTaskIds);
            return old.map((task) => {
              if (!failedIdSet.has(task.id)) return task;
              return previousTaskMap.get(task.id) ?? task;
            });
          }
        );
      }

      const modifiedTaskIdSet = new Set(
        context?.modifiedTaskIds ?? data.succeededTaskIds
      );
      const succeededModifiedTaskIds = data.succeededTaskIds.filter((taskId) =>
        modifiedTaskIdSet.has(taskId)
      );

      if (data.updatedAssigneesByTaskId.size > 0) {
        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.map((task) => {
              const updatedAssignees = data.updatedAssigneesByTaskId.get(
                task.id
              );
              if (!updatedAssignees) return task;
              return {
                ...task,
                assignees: updatedAssignees,
              };
            });
          }
        );
      }

      for (const tid of succeededModifiedTaskIds) {
        broadcast?.('task:relations-changed', { taskId: tid });
      }

      if (data.failures.length > 0) {
        toast.warning(
          i18n?.partialAssigneeAdditionCompletedTitle() ??
            'Partial assignee addition completed',
          {
            description:
              i18n?.assigneeAddedPartialDescription(
                data.count,
                data.failures.length
              ) ??
              `Added assignee to ${data.count} task${data.count === 1 ? '' : 's'}, ${data.failures.length} failed`,
          }
        );
      } else {
        toast.success(i18n?.assigneeAddedTitle() ?? 'Assignee added', {
          description:
            i18n?.assigneeAddedDescription(data.count) ??
            `Added assignee to ${data.count} task${data.count === 1 ? '' : 's'}`,
        });
      }
    },
  });
}

export function useBulkRemoveAssignee(
  queryClient: QueryClient,
  wsId: string,
  boardId: string,
  broadcast?: BoardBroadcastFn | null,
  i18n?: BulkOperationI18n
) {
  return useMutation({
    mutationFn: async ({
      assigneeId,
      taskIds,
    }: {
      assigneeId: string;
      taskIds: string[];
    }) => {
      let successCount = 0;
      const succeededTaskIds: string[] = [];
      const failedTaskIds: string[] = [];
      const failures: Array<{ taskId: string; error: string }> = [];
      const apiOptions = getInternalApiOptions();

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

          const nextAssigneeIds = (taskRecord.assignees || [])
            .map((assignee) => assignee.id)
            .filter((id): id is string => !!id && id !== assigneeId);

          await updateWorkspaceTask(
            wsId,
            taskId,
            { assignee_ids: nextAssigneeIds },
            apiOptions
          );
          succeededTaskIds.push(taskId);
          successCount++;
        } catch (error) {
          failedTaskIds.push(taskId);
          failures.push({
            taskId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      if (successCount === 0) {
        throw new Error(
          `Failed to remove assignee from all ${taskIds.length} tasks`
        );
      }

      return {
        count: successCount,
        assigneeId,
        taskIds,
        failures,
        succeededTaskIds,
        failedTaskIds,
      };
    },
    onMutate: async ({ assigneeId, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);
      const current = (previousTasks as Task[] | undefined) || [];
      const modifiedTaskIds = taskIds.filter((id) => {
        const task = current.find((ct) => ct.id === id);
        return !!task?.assignees?.some(
          (assignee) => assignee.id === assigneeId
        );
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
                  assignees: (task.assignees || []).filter(
                    (a) => a.id !== assigneeId
                  ),
                }
              : task
          );
        }
      );

      return { previousTasks, modifiedTaskIds };
    },
    onError: (error, variables, context) => {
      if (context?.previousTasks) {
        const previousTaskMap = new Map(
          ((context.previousTasks as Task[] | undefined) ?? []).map((task) => [
            task.id,
            task,
          ])
        );
        const requestedTaskIdSet = new Set(variables.taskIds);

        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.map((task) => {
              if (!requestedTaskIdSet.has(task.id)) return task;
              return previousTaskMap.get(task.id) ?? task;
            });
          }
        );
      }
      console.error('Bulk remove assignee failed', error);
      toast.error(
        i18n?.failedRemoveAssignee() ??
          'Failed to remove assignee from selected tasks'
      );
    },
    onSuccess: (data, _variables, context) => {
      if (
        data.failedTaskIds.length > 0 &&
        Array.isArray(context?.previousTasks)
      ) {
        const previousTaskMap = new Map(
          (context.previousTasks as Task[]).map((task) => [task.id, task])
        );

        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            const failedIdSet = new Set(data.failedTaskIds);
            return old.map((task) => {
              if (!failedIdSet.has(task.id)) return task;
              return previousTaskMap.get(task.id) ?? task;
            });
          }
        );
      }

      const modifiedTaskIdSet = new Set(
        context?.modifiedTaskIds ?? data.succeededTaskIds
      );
      const succeededModifiedTaskIds = data.succeededTaskIds.filter((taskId) =>
        modifiedTaskIdSet.has(taskId)
      );

      for (const tid of succeededModifiedTaskIds) {
        broadcast?.('task:relations-changed', { taskId: tid });
      }

      if (data.failures.length > 0) {
        toast.warning(
          i18n?.partialAssigneeRemovalCompletedTitle() ??
            'Partial assignee removal completed',
          {
            description:
              i18n?.assigneeRemovedPartialDescription(
                data.count,
                data.failures.length
              ) ??
              `Removed assignee from ${data.count} task${data.count === 1 ? '' : 's'}, ${data.failures.length} failed`,
          }
        );
      } else {
        toast.success(i18n?.assigneeRemovedTitle() ?? 'Assignee removed', {
          description:
            i18n?.assigneeRemovedDescription(data.count) ??
            `Removed assignee from ${data.count} task${data.count === 1 ? '' : 's'}`,
        });
      }
    },
  });
}
