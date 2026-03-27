import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWorkspaceTaskRelationship,
  createWorkspaceTaskWithRelationship,
  deleteWorkspaceTaskRelationship,
  getWorkspaceTaskRelationships,
  listWorkspaceTasks,
} from '@tuturuuu/internal-api/tasks';
import { isTaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type {
  CreateTaskRelationshipInput,
  CreateTaskWithRelationshipInput,
  RelatedTaskInfo,
  TaskRelationship,
  TaskRelationshipsResponse,
  TaskRelationshipType,
} from '@tuturuuu/types/primitives/TaskRelationship';

import {
  getBrowserApiOptions,
  getMutationApiOptions,
  getTaskIdentifierForSearch,
  isTicketIdentifierLikeQuery,
  normalizeTaskSearchValue,
} from './shared';

export type TaskRelationshipErrorCode =
  | 'already_exists'
  | 'single_parent'
  | 'circular';

export class TaskRelationshipError extends Error {
  constructor(public readonly code: TaskRelationshipErrorCode) {
    super(code);
    this.name = 'TaskRelationshipError';
  }
}

export async function getTaskRelationships(
  wsId: string,
  taskId: string
): Promise<TaskRelationshipsResponse> {
  const payload = await getWorkspaceTaskRelationships(
    wsId,
    taskId,
    getBrowserApiOptions()
  );
  return payload;
}

export async function createTaskRelationship(
  wsId: string,
  input: CreateTaskRelationshipInput
): Promise<TaskRelationship> {
  const options = await getMutationApiOptions();

  try {
    const { relationship } = await createWorkspaceTaskRelationship(
      wsId,
      input.source_task_id,
      input,
      options
    );
    return relationship;
  } catch (error) {
    const typedError = error as Error & { code?: string };
    if (
      typedError.code === '23505' ||
      typedError.message?.includes('already exists')
    ) {
      throw new TaskRelationshipError('already_exists');
    }
    if (typedError.message?.includes('single parent')) {
      throw new TaskRelationshipError('single_parent');
    }
    if (typedError.message?.includes('circular')) {
      throw new TaskRelationshipError('circular');
    }
    throw error;
  }
}

export async function deleteTaskRelationship(
  wsId: string,
  relationship?: Pick<
    TaskRelationship,
    'source_task_id' | 'target_task_id' | 'type'
  >
): Promise<void> {
  if (!relationship) {
    throw new Error(
      'deleteTaskRelationship requires source_task_id, target_task_id, and type.'
    );
  }

  const options = await getMutationApiOptions();
  await deleteWorkspaceTaskRelationship(
    wsId,
    relationship.source_task_id,
    {
      source_task_id: relationship.source_task_id,
      target_task_id: relationship.target_task_id,
      type: relationship.type,
    },
    options
  );
}

export function useTaskRelationships(
  taskId: string | undefined,
  wsId?: string
) {
  return useQuery({
    queryKey: ['task-relationships', taskId, wsId],
    queryFn: async () => {
      if (!taskId || !wsId) return null;
      const relationships = await getWorkspaceTaskRelationships(
        wsId,
        taskId,
        getBrowserApiOptions()
      );
      return relationships;
    },
    enabled: !!taskId && !!wsId,
    staleTime: 30000,
  });
}

export function useCreateTaskRelationship(wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTaskRelationshipInput) =>
      createTaskRelationship(wsId, input),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['task-relationships', variables.source_task_id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['task-relationships', variables.target_task_id],
        }),
      ]);
    },
  });
}

export function useDeleteTaskRelationship(wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sourceTaskId,
      targetTaskId,
      type,
    }: {
      sourceTaskId: string;
      targetTaskId: string;
      type: TaskRelationshipType;
    }) => {
      return deleteTaskRelationship(wsId, {
        source_task_id: sourceTaskId,
        target_task_id: targetTaskId,
        type,
      });
    },
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['task-relationships', variables.sourceTaskId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['task-relationships', variables.targetTaskId],
        }),
      ]);
    },
  });
}

export async function getWorkspaceTasks(
  wsId: string,
  options?: {
    excludeTaskIds?: string[];
    searchQuery?: string;
    limit?: number;
  }
): Promise<RelatedTaskInfo[]> {
  const excluded = new Set(options?.excludeTaskIds ?? []);
  const normalizedSearch = options?.searchQuery
    ? normalizeTaskSearchValue(options.searchQuery)
    : '';
  const ticketLikeSearch = normalizedSearch
    ? isTicketIdentifierLikeQuery(normalizedSearch)
    : false;
  const targetLimit = options?.limit ?? 50;
  const requestLimit = Math.max(25, Math.min(targetLimit * 2, 200));
  const collected: RelatedTaskInfo[] = [];
  const seenTaskIds = new Set<string>();

  const clientOptions =
    typeof window !== 'undefined'
      ? {
          baseUrl: window.location.origin,
          fetch: (input: RequestInfo | URL, init?: RequestInit) =>
            fetch(input, { ...init, cache: init?.cache ?? 'no-store' }),
        }
      : undefined;

  let offset = 0;
  while (true) {
    const { tasks } = await listWorkspaceTasks(
      wsId,
      {
        q: ticketLikeSearch ? undefined : options?.searchQuery,
        identifier: ticketLikeSearch ? options?.searchQuery : undefined,
        limit: requestLimit,
        offset,
        includeRelationshipSummary: !ticketLikeSearch,
      },
      clientOptions
    );

    const pageTasks = tasks ?? [];
    if (pageTasks.length === 0) {
      break;
    }

    for (const task of pageTasks) {
      if (excluded.has(task.id) || seenTaskIds.has(task.id)) {
        continue;
      }

      if (normalizedSearch) {
        const taskName = normalizeTaskSearchValue(task.name ?? '');
        const taskIdentifier = normalizeTaskSearchValue(
          getTaskIdentifierForSearch(task) ?? ''
        );

        if (
          !taskName.includes(normalizedSearch) &&
          !taskIdentifier.includes(normalizedSearch)
        ) {
          continue;
        }
      }

      seenTaskIds.add(task.id);
      collected.push({
        id: task.id,
        name: task.name,
        display_number: task.display_number,
        ticket_prefix: task.ticket_prefix ?? null,
        completed: !!task.closed_at || !!task.completed_at,
        priority: isTaskPriority(task.priority) ? task.priority : null,
        board_id: task.board_id ?? null,
        board_name: task.board_name,
      });

      if (collected.length >= targetLimit) {
        return collected;
      }
    }

    if (pageTasks.length < requestLimit) {
      break;
    }

    offset += requestLimit;
  }

  return collected;
}

export function useWorkspaceTasks(
  wsId: string | undefined,
  options?: {
    excludeTaskIds?: string[];
    searchQuery?: string;
    limit?: number;
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: [
      'workspace-tasks',
      wsId,
      options?.excludeTaskIds,
      options?.searchQuery,
      options?.limit,
    ],
    queryFn: async () => {
      if (!wsId) return [];
      return getWorkspaceTasks(wsId, options);
    },
    enabled: !!wsId && (options?.enabled ?? true),
    staleTime: 30000,
  });
}

export function useCreateTaskWithRelationship(boardId: string, wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTaskWithRelationshipInput) => {
      const result = await createWorkspaceTaskWithRelationship(
        wsId,
        input,
        getBrowserApiOptions()
      );
      return {
        task: result.task as Task,
        relationship: result.relationship,
      };
    },
    onSuccess: async (result, variables) => {
      const locallyCreatedTask = {
        ...(result.task as Task & { _localMutationAt?: number }),
        _localMutationAt: Date.now(),
      } as Task;

      if (boardId) {
        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return [locallyCreatedTask];
            if (old.some((t) => t.id === result.task.id)) return old;
            return [...old, locallyCreatedTask];
          }
        );
      }

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['task-relationships', variables.currentTaskId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['task-relationships', result.task.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['workspace-tasks', wsId],
        }),
      ]);
    },
  });
}
