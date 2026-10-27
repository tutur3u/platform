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

type TaskAssignee = NonNullable<Task['assignees']>[number];

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

  const mutation = useMutation({
    mutationFn: ({
      assigneeIds,
      taskId,
    }: {
      assigneeIds: string[];
      previousAssignees: TaskAssignee[];
      taskId: string;
    }) => updateWorkspaceTask(wsId, taskId, { assignee_ids: assigneeIds }),
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
      return { mutationId };
    },
    onError: (_error, { previousAssignees, taskId }, context) => {
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
      toast.error(t('assign_failed'));
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
    },
  });

  const move = (task: Task, plan: PlanMove) => {
    const current = (task.assignees ?? []).map((assignee) => assignee.id);
    const next = getPlanMoveAssigneeIds(current, plan);
    const unchanged =
      next.length === current.length &&
      next.every((id) => current.includes(id));
    if (unchanged) return;
    mutation.mutate({
      assigneeIds: next,
      previousAssignees: task.assignees ?? [],
      taskId: task.id,
    });
  };

  return { move, isPending: mutation.isPending };
}
