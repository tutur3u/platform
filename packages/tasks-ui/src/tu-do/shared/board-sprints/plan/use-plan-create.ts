'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  moveTasksOutOfWorkspaceTaskBoardSprints,
  moveTasksToWorkspaceTaskBoardSprint,
} from '@tuturuuu/internal-api/task-sprints';
import {
  createWorkspaceTask,
  updateWorkspaceTask,
} from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { getBoardSprintsQueryKey } from '../use-board-sprints';
import { getSprintTasksQueryKey } from './use-sprint-plan-data';

/**
 * Creates a backlog task and places it: in the target sprint, or in no sprint
 * when the target is null. Undefined means there is nowhere to create.
 */
export function usePlanCreate({
  boardId,
  createListId,
  joinsSprintId,
  target,
  wsId,
}: {
  boardId: string;
  createListId?: string;
  /** The sprint the database puts a new task in. */
  joinsSprintId: string | null;
  target: string | null | undefined;
  wsId: string;
}) {
  const t = useTranslations('ws-task-boards.sprints');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      if (!createListId || target === undefined)
        throw new Error('No list to create in');
      const { task } = await createWorkspaceTask(wsId, {
        name,
        listId: createListId,
      });
      if (target !== joinsSprintId) {
        const place = () =>
          target
            ? moveTasksToWorkspaceTaskBoardSprint(wsId, boardId, target, [
                task.id,
              ])
            : moveTasksOutOfWorkspaceTaskBoardSprints(wsId, boardId, [task.id]);
        try {
          await place().catch(place);
        } catch (error) {
          // Undo the create by moving it to the trash; the composer then
          // keeps the name to retry.
          const trashed = await updateWorkspaceTask(wsId, task.id, {
            deleted: true,
          }).then(
            () => true,
            () => false
          );
          if (trashed) throw error;
          // It stays in the sprint it joined: say so, and let the composer
          // clear the name so a retry cannot add a duplicate.
          toast.error(t('backlog_move_failed'));
        }
      }
      return task as Task;
    },
    onSuccess: (task) => {
      queryClient.setQueryData<Task[]>(
        getSprintTasksQueryKey(boardId),
        (current) => (current ? [...current, task] : current)
      );
    },
    onError: () => toast.error(t('create_failed')),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: getBoardSprintsQueryKey(boardId),
      }),
  });
}
