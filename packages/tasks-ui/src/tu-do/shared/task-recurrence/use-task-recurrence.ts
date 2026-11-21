'use client';

import {
  createWorkspaceTaskRecurrence,
  editWorkspaceTaskRecurrence,
  prepareWorkspaceTaskRecurrence,
  prepareWorkspaceTaskRecurrenceTask,
  readWorkspaceTaskRecurrence,
  setWorkspaceTaskRecurrenceStatus,
  type WorkspaceTaskRecurrenceEntry,
  type WorkspaceTaskRecurrenceSpec,
  type WorkspaceTaskRecurrenceStatusAction,
} from '@tuturuuu/internal-api/task-recurrence';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { loadTaskRecurrenceEntry } from './task-recurrence-read-batcher';

const STALE_MS = 5 * 60_000;
// The API reads persisted tasks only; optimistic ids would fail a batch.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const taskRecurrenceKeys = {
  all: ['task-recurrence'] as const,
  eligibility: (wsId: string, listId: string) =>
    ['task-recurrence', 'eligibility', wsId, listId] as const,
  entry: (wsId: string, taskId: string) =>
    ['task-recurrence', 'entry', wsId, taskId] as const,
  template: (wsId: string, taskId: string) =>
    ['task-recurrence', 'template', wsId, taskId] as const,
};

export class TaskRecurrenceUnavailableError extends Error {
  constructor() {
    super('TASK_RECURRENCE_UNAVAILABLE');
    this.name = 'TaskRecurrenceUnavailableError';
  }
}

/** True only when the API admits the actor to create a series in the list.
 * Dormant workspaces, guests and non-members resolve false without an error. */
export function useTaskRecurrenceEligibility(
  wsId: string | undefined,
  listId: string | undefined,
  enabled = true
) {
  const query = useQuery({
    queryKey: taskRecurrenceKeys.eligibility(wsId ?? '', listId ?? ''),
    queryFn: async () =>
      (await prepareWorkspaceTaskRecurrence(wsId!, listId!)) !== null,
    enabled: enabled && !!wsId && !!listId,
    staleTime: STALE_MS,
    retry: false,
  });
  return query.data === true;
}

/** The series link of one task, read in batches with its neighbors. */
export function useTaskRecurrenceEntry(
  wsId: string | undefined,
  taskId: string | undefined,
  enabled = true
) {
  const query = useQuery({
    queryKey: taskRecurrenceKeys.entry(wsId ?? '', taskId ?? ''),
    queryFn: () => loadTaskRecurrenceEntry(wsId!, taskId!),
    enabled: enabled && !!wsId && !!taskId && UUID.test(taskId),
    staleTime: STALE_MS,
    retry: false,
  });
  return query.data ?? null;
}

/** The series schedule and template; null without manage access. */
export function useTaskRecurrenceTemplate(
  wsId: string,
  taskId: string,
  enabled: boolean
) {
  const query = useQuery({
    queryKey: taskRecurrenceKeys.template(wsId, taskId),
    queryFn: async () =>
      (await readWorkspaceTaskRecurrence(wsId, [taskId], true))[0] ?? null,
    enabled,
    staleTime: STALE_MS,
    retry: false,
  });
  return query.data ?? null;
}

export function useCreateTaskRecurrence(wsId: string, boardId: string) {
  const queryClient = useQueryClient();
  // A retry of the same request reuses its receipt, so an attempt whose
  // response was lost replays instead of creating a second series. A changed
  // request takes a new receipt, since reuse with other input is a conflict.
  const pending = useRef<{ key: string; receipt: string } | null>(null);
  return useMutation({
    mutationFn: async (input: {
      listId: string;
      spec: WorkspaceTaskRecurrenceSpec;
    }) => {
      const key = JSON.stringify([wsId, input]);
      let receipt =
        pending.current?.key === key ? pending.current.receipt : null;
      if (!receipt) {
        receipt = await prepareWorkspaceTaskRecurrence(wsId, input.listId);
        if (!receipt) throw new TaskRecurrenceUnavailableError();
        pending.current = { key, receipt };
      }
      const created = await createWorkspaceTaskRecurrence(wsId, {
        ...input,
        receipt,
      });
      pending.current = null;
      return created;
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tasks', boardId] }),
        queryClient.invalidateQueries({
          queryKey: ['task-list-counts', boardId],
        }),
        queryClient.invalidateQueries({ queryKey: taskRecurrenceKeys.all }),
      ]);
    },
  });
}

export type TaskRecurrenceChange =
  | { kind: 'edit'; spec: WorkspaceTaskRecurrenceSpec }
  | { kind: 'status'; action: WorkspaceTaskRecurrenceStatusAction };

export function useUpdateTaskRecurrence(
  wsId: string,
  entry: WorkspaceTaskRecurrenceEntry | null
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (change: TaskRecurrenceChange) => {
      if (!entry) throw new TaskRecurrenceUnavailableError();
      const receipt = await prepareWorkspaceTaskRecurrenceTask(
        wsId,
        entry.task_id
      );
      if (!receipt) throw new TaskRecurrenceUnavailableError();
      const version = {
        seriesId: entry.series_id,
        taskId: entry.task_id,
        revision: entry.revision,
        progress: entry.progress,
        receipt,
      };
      return change.kind === 'edit'
        ? editWorkspaceTaskRecurrence(wsId, { ...version, spec: change.spec })
        : setWorkspaceTaskRecurrenceStatus(wsId, {
            ...version,
            action: change.action,
          });
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: taskRecurrenceKeys.all }),
  });
}
