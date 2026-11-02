'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type BoardSprint,
  type BoardSprintLengthWeeks,
  type BoardSprintsResponse,
  listWorkspaceTaskBoardSprints,
  moveTasksToWorkspaceTaskBoardSprint,
  startWorkspaceTaskBoardSprint,
  updateWorkspaceTaskBoardSprint,
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
      // Board view membership; null shows every task (sprints off).
      showsOnBoard: currentSprint
        ? (task: Task) =>
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

  const updateGoal = useMutation({
    mutationFn: ({ goal, sprintId }: { goal: string; sprintId: string }) =>
      updateWorkspaceTaskBoardSprint(wsId, boardId, sprintId, { goal }),
    onSettled: refresh,
  });

  const moveTasks = useMutation({
    mutationFn: ({
      sprintId,
      taskIds,
    }: {
      sprintId: string;
      taskIds: string[];
    }) => moveTasksToWorkspaceTaskBoardSprint(wsId, boardId, sprintId, taskIds),
    onMutate: async ({ sprintId, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BoardSprintsResponse>(key);
      if (previous) {
        const moving = new Set(taskIds);
        queryClient.setQueryData<BoardSprintsResponse>(key, {
          ...previous,
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

  return { moveTasks, setLength, start, updateGoal };
}
