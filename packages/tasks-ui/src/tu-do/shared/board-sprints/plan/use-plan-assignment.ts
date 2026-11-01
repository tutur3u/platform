'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateWorkspaceTask } from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { useBoardBroadcast } from '../../board-broadcast-context';
import type { BoardMember } from '../../board-members-query';
import {
  applyOptimisticTaskPatch,
  patchTaskInVisibleCaches,
  settleOptimisticTaskPatch,
} from '../../task-cache-patches';
import { getSprintTasksQueryKey } from './use-sprint-plan-data';

type TaskAssignee = NonNullable<Task['assignees']>[number];

/** The move the owner waited for failed; its own toast already said so. */
class PlanMoveFailed extends Error {}

/** Where a dragged or picked task comes from and goes to; null is the backlog. */
export interface PlanMove {
  from: string | null;
  to: string | null;
}

/**
 * Assignees after a plan move. Into the backlog clears every owner; between
 * people swaps the source owner for the target and keeps co-owners.
 */
export function getPlanMoveAssigneeIds(
  current: readonly string[],
  { from, to }: PlanMove
): string[] {
  if (to === null) return [];
  const kept = from === null ? current : current.filter((id) => id !== from);
  return Array.from(new Set([...kept, to]));
}

export function usePlanAssignment({
  boardId,
  members,
  wsId,
}: {
  boardId: string;
  members: BoardMember[];
  wsId: string;
}) {
  const t = useTranslations('ws-task-boards.sprints');
  const queryClient = useQueryClient();
  const broadcast = useBoardBroadcast();

  // The latest move per task; an older failure must not undo a newer move.
  const latestMutationByTask = useRef(new Map<string, string>());
  // Moves still in flight on any task, and whether any of them failed. A
  // reread overwrites every pending optimistic owner, so it waits for all.
  const inFlight = useRef({ pending: 0, failed: false });
  // Each request replaces the task's whole owner set, so moves of one task
  // are sent one after another: the user's last move is the last write.
  const requestChain = useRef(new Map<string, Promise<unknown>>());

  const mutation = useMutation({
    mutationFn: ({
      after,
      assigneeIds,
      taskId,
    }: {
      /** A sprint move that must land first; the owner shows meanwhile. */
      after?: Promise<unknown>;
      assigneeIds: string[];
      previousAssignees: TaskAssignee[];
      taskId: string;
    }) => {
      const previous = requestChain.current.get(taskId) ?? Promise.resolve();
      const request = previous
        .catch(() => undefined)
        .then(() =>
          after?.catch(() => {
            throw new PlanMoveFailed();
          })
        )
        .then(() =>
          updateWorkspaceTask(wsId, taskId, { assignee_ids: assigneeIds })
        );
      requestChain.current.set(taskId, request);
      return request.finally(() => {
        if (requestChain.current.get(taskId) === request)
          requestChain.current.delete(taskId);
      });
    },
    onMutate: ({ assigneeIds, taskId }) => {
      const mutationId = applyOptimisticTaskPatch({
        queryClient,
        boardId,
        taskIds: [taskId],
        updater: (task) => ({
          ...task,
          assignees: assigneeIds.flatMap((id) => {
            const known =
              task.assignees?.find((assignee) => assignee.id === id) ??
              members.find((member) => member.id === id);
            return known
              ? [
                  {
                    id,
                    display_name: known.display_name,
                    avatar_url: known.avatar_url,
                  },
                ]
              : [];
          }),
        }),
      });
      latestMutationByTask.current.set(taskId, mutationId);
      inFlight.current.pending += 1;
      return { mutationId };
    },
    onError: (error, { previousAssignees, taskId }, context) => {
      inFlight.current.failed = true;
      // Roll back only this task's owners, and only if no newer move replaced them.
      if (
        context &&
        latestMutationByTask.current.get(taskId) === context.mutationId
      ) {
        patchTaskInVisibleCaches({
          queryClient,
          boardId,
          taskId,
          updater: (task) => ({ ...task, assignees: previousAssignees }),
        });
      }
      if (!(error instanceof PlanMoveFailed)) toast.error(t('assign_failed'));
    },
    onSuccess: (_data, { taskId }) => {
      broadcast?.('task:relations-changed', { taskId });
    },
    onSettled: (_data, _error, { taskId }, context) => {
      if (!context) return;
      settleOptimisticTaskPatch({
        queryClient,
        boardId,
        taskIds: [taskId],
        mutationId: context.mutationId,
      });
      if (latestMutationByTask.current.get(taskId) === context.mutationId) {
        latestMutationByTask.current.delete(taskId);
      }
      inFlight.current.pending -= 1;
      if (inFlight.current.pending > 0 || !inFlight.current.failed) return;
      // Overlapping moves that failed can leave a rolled-back guess on screen,
      // so once every move settles, read the owners from the server again.
      inFlight.current.failed = false;
      void queryClient.invalidateQueries({
        queryKey: getSprintTasksQueryKey(boardId),
      });
      void queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
    },
  });

  const move = (task: Task, plan: PlanMove, after?: Promise<unknown>) => {
    const current = (task.assignees ?? []).map((assignee) => assignee.id);
    const next = getPlanMoveAssigneeIds(current, plan);
    const unchanged =
      next.length === current.length &&
      next.every((id) => current.includes(id));
    if (unchanged) return;
    mutation.mutate({
      after,
      assigneeIds: next,
      previousAssignees: task.assignees ?? [],
      taskId: task.id,
    });
  };

  return { move, isPending: mutation.isPending };
}
