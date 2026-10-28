'use client';

import type { BoardSprint } from '@tuturuuu/internal-api/task-sprints';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { getLoadedSprintProgress } from '@tuturuuu/utils/task-helper/sprints';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { useOpenBoardSettings } from '../board-header/use-open-board-settings';
import { SprintPill } from './sprint-pill';
import {
  useBoardSprintMutations,
  type useBoardSprints,
} from './use-board-sprints';

/** Connects the board's sprint data to the breadcrumb pill. */
export function BoardSprintPill({
  boardId,
  canManage,
  sprints,
  tasks,
  wsId,
}: {
  boardId: string;
  canManage: boolean;
  sprints: ReturnType<typeof useBoardSprints>;
  tasks: Task[];
  wsId: string;
}) {
  const t = useTranslations('ws-task-boards.sprints');
  const { start } = useBoardSprintMutations({ boardId, wsId });
  const { openBoardSettings } = useOpenBoardSettings({
    boardId,
    enabled: canManage,
    workspaceId: wsId,
  });
  const loadedTasks = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks]
  );

  if (!sprints.sprintsOn || !sprints.currentSprint) return null;

  const getProgress = (sprint: BoardSprint) =>
    getLoadedSprintProgress(sprint, loadedTasks);

  return (
    <SprintPill
      canManage={canManage}
      currentSprint={sprints.currentSprint}
      getProgress={getProgress}
      onOpenSettings={canManage ? openBoardSettings : undefined}
      onStartSprint={(sprint) =>
        start.mutate(sprint.id, {
          onSuccess: () => toast.success(t('started', { name: sprint.name })),
          onError: () => toast.error(t('start_failed')),
        })
      }
      sprints={sprints.sprints}
      starting={start.isPending}
    />
  );
}
