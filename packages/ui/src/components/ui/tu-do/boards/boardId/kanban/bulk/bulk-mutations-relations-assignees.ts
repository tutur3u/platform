'use client';

import { type QueryClient, useMutation } from '@tanstack/react-query';
import { bulkWorkspaceTasks } from '@tuturuuu/internal-api/tasks';
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
      const apiOptions = getInternalApiOptions();
      const taskRecordsById = new Map<string, Task>();
      const updatedAssigneesByTaskId = new Map<string, Task['assignees']>();

      for (const taskId of taskIds) {
        try {
          const taskRecord = await getTaskForRelationMutation(
            queryClient,
            boardId,
            wsId,
            taskId
          );

          if (!taskRecord) {
            continue;
          }

          taskRecordsById.set(taskId, taskRecord);

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

          updatedAssigneesByTaskId.set(taskId, fallbackAssignees);
        } catch {
          // Continue; optimistic state still covers UI.
        }
      }

      const result = await bulkWorkspaceTasks(
        wsId,
        {
          taskIds,
          operation: {
            type: 'add_assignee',
            assigneeId,
          },
        },
        apiOptions
      );

      if (result.successCount === 0) {
        throw new Error(
          `Failed to add assignee to all ${taskIds.length} tasks`
        );
      }

      for (const taskId of result.succeededTaskIds) {
        const taskRecord = taskRecordsById.get(taskId);
        if (!taskRecord) {
          continue;
        }

        const fallbackAssignees =
          updatedAssigneesByTaskId.get(taskId) ?? taskRecord.assignees ?? [];
        updatedAssigneesByTaskId.set(taskId, fallbackAssignees);
      }

      return {
        count: result.successCount,
        assigneeId,
        taskIds,
        failures: result.failures,
        succeededTaskIds: result.succeededTaskIds,
        failedTaskIds: result.failures.map((failure) => failure.taskId),
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
      const apiOptions = getInternalApiOptions();

      const result = await bulkWorkspaceTasks(
        wsId,
        {
          taskIds,
          operation: {
            type: 'remove_assignee',
            assigneeId,
          },
        },
        apiOptions
      );

      const successCount = result.successCount;
      const succeededTaskIds = [...result.succeededTaskIds];
      const failures = [...result.failures];
      const failedTaskIds = failures.map((failure) => failure.taskId);

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
