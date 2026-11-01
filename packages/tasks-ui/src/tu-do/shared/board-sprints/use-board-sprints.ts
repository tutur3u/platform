'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addWorkspaceTaskBoardSprint,
  type BoardSprint,
  type BoardSprintLengthWeeks,
  type BoardSprintsResponse,
  endWorkspaceTaskBoardSprint,
  listWorkspaceTaskBoardSprints,
  moveTasksOutOfWorkspaceTaskBoardSprints,
  moveTasksToWorkspaceTaskBoardSprint,
  removeWorkspaceTaskBoardSprint,
  startWorkspaceTaskBoardSprint,
  updateWorkspaceTaskBoardSprintLength,
} from '@tuturuuu/internal-api/task-sprints';
import type { Task } from '@tuturuuu/types/primitives/Task';
import {
  buildOpenSprintByTaskId,
  getCurrentBoardSprint,
  getPlanningBoardSprint,
  isTaskInCurrentSprintView,
} from '@tuturuuu/utils/task-helper/sprints';
import { useMemo } from 'react';

/** A sprint that does not exist yet: the move adds it after the last one. */
export const NEW_SPRINT = 'new';

/** Where a task goes: an open sprint, a new one, or (null) out of every sprint. */
export type SprintMoveTarget = BoardSprint | typeof NEW_SPRINT | null;

export function getBoardSprintsQueryKey(boardId: string) {
  return ['board-sprints', boardId] as const;
}

/** Sprints of one board; disabled boards and pending migrations read as off. */
export function useBoardSprints({
  boardId,
  enabled = true,
  wsId,
}: {
  boardId: string;
  enabled?: boolean;
  wsId: string;
}) {
  const query = useQuery({
    queryKey: getBoardSprintsQueryKey(boardId),
    queryFn: () => listWorkspaceTaskBoardSprints(wsId, boardId),
    enabled: enabled && Boolean(wsId && boardId),
    staleTime: 30_000,
  });
  const data = query.data;

  const derived = useMemo(() => {
    const sprints: BoardSprint[] = data?.schemaAvailable ? data.sprints : [];
    const sprintsOn = Boolean(
      data?.schemaAvailable && data.sprintLengthWeeks !== null
    );
    const currentSprint = sprintsOn ? getCurrentBoardSprint(sprints) : null;
    const unplannedTaskIds = new Set(data?.unplannedTaskIds ?? []);
    return {
      schemaAvailable: data?.schemaAvailable === true,
      sprints,
      sprintsOn,
      sprintLengthWeeks: data?.sprintLengthWeeks ?? null,
      currentSprint,
      planningSprint: sprintsOn ? getPlanningBoardSprint(sprints) : null,
      openSprintByTaskId: buildOpenSprintByTaskId(sprints),
      currentSprintTaskIds: currentSprint
        ? new Set(currentSprint.tasks.map((task) => task.task_id))
        : null,
      // Open tasks parked outside every sprint wait in Plan's backlog.
      unplannedTaskIds,
      // Board view membership; null shows every task (sprints off).
      showsOnBoard: currentSprint
        ? (task: Task) =>
            !unplannedTaskIds.has(task.id) &&
            isTaskInCurrentSprintView(task, sprints, currentSprint)
        : null,
    };
  }, [data]);

  return { ...derived, isLoading: query.isLoading, isError: query.isError };
}

export function useBoardSprintMutations({
  boardId,
  wsId,
}: {
  boardId: string;
  wsId: string;
}) {
  const queryClient = useQueryClient();
  const key = getBoardSprintsQueryKey(boardId);
  const store = (data: BoardSprintsResponse) =>
    queryClient.setQueryData(key, data);
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const setLength = useMutation({
    mutationFn: (weeks: BoardSprintLengthWeeks | null) =>
      updateWorkspaceTaskBoardSprintLength(wsId, boardId, weeks),
    onSuccess: store,
  });

  const start = useMutation({
    mutationFn: (sprintId: string) =>
      startWorkspaceTaskBoardSprint(wsId, boardId, sprintId),
    onSuccess: store,
  });

  const moveTasks = useMutation({
    mutationFn: async ({
      sprintId,
      taskIds,
    }: {
      // null takes the tasks out of every sprint; NEW_SPRINT adds one first.
      sprintId: string | typeof NEW_SPRINT | null;
      taskIds: string[];
    }): Promise<{ moved?: number; sprintName?: string }> => {
      if (!sprintId)
        return moveTasksOutOfWorkspaceTaskBoardSprints(wsId, boardId, taskIds);
      if (sprintId !== NEW_SPRINT)
        return moveTasksToWorkspaceTaskBoardSprint(
          wsId,
          boardId,
          sprintId,
          taskIds
        );
      const { addedSprintId, sprints: after } =
        await addWorkspaceTaskBoardSprint(wsId, boardId);
      const added = after.find((sprint) => sprint.id === addedSprintId);
      if (!added) throw new Error('SPRINT_NOT_ADDED');
      await moveTasksToWorkspaceTaskBoardSprint(
        wsId,
        boardId,
        added.id,
        taskIds
      );
      return { sprintName: added.name };
    },
    onMutate: async ({ sprintId, taskIds }) => {
      // The new sprint does not exist yet; the tasks stay put until it does.
      if (sprintId === NEW_SPRINT) return { previous: undefined };
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BoardSprintsResponse>(key);
      if (previous) {
        const moving = new Set(taskIds);
        const unplanned = (previous.unplannedTaskIds ?? []).filter(
          (taskId) => !moving.has(taskId)
        );
        queryClient.setQueryData<BoardSprintsResponse>(key, {
          ...previous,
          unplannedTaskIds: sprintId ? unplanned : [...unplanned, ...taskIds],
          sprints: previous.sprints.map((sprint) => {
            const open =
              sprint.status === 'planned' || sprint.status === 'active';
            if (!open) return sprint;
            const kept = sprint.tasks.filter(
              (task) => !moving.has(task.task_id)
            );
            if (sprint.id !== sprintId) return { ...sprint, tasks: kept };
            return {
              ...sprint,
              tasks: [
                ...kept,
                ...taskIds.map((task_id) => ({
                  task_id,
                  added_after_start: sprint.status === 'active',
                  carry_count: 0,
                  end_decision: null,
                })),
              ],
            };
          }),
        });
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: refresh,
  });

  // Every open task moves to the next sprint with its owner.
  const end = useMutation({
    mutationFn: (sprintId: string) =>
      endWorkspaceTaskBoardSprint(wsId, boardId, sprintId, {}),
    onSuccess: (data) => {
      store(data);
      void queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
      void queryClient.invalidateQueries({ queryKey: ['tasks-full', boardId] });
    },
  });

  const addSprint = useMutation({
    mutationFn: () => addWorkspaceTaskBoardSprint(wsId, boardId),
    onSuccess: store,
  });

  // Removes the last planned sprint; its tasks move to the sprint before it.
  const removeSprint = useMutation({
    mutationFn: (sprintId: string) =>
      removeWorkspaceTaskBoardSprint(wsId, boardId, sprintId),
    onSuccess: store,
  });

  return {
    addSprint,
    end,
    moveTasks,
    removeSprint,
    setLength,
    start,
  };
}
