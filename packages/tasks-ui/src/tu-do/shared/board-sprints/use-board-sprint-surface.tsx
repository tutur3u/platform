'use client';

import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useState } from 'react';
import { BoardSprintPill } from './board-sprint-pill';
import { BoardPlanView } from './plan/board-plan-view';
import { BoardPlanTabs, type BoardTab } from './plan/plan-parts';
import {
  SprintSummaryDialog,
  type SprintSummaryTarget,
} from './summary/sprint-summary-dialog';
import type { useBoardSprints } from './use-board-sprints';

/**
 * Everything a sprint board adds around the Board views: the Plan | Board
 * tabs, the sprint pill, the Plan view and the end-of-sprint summary. Boards
 * with sprints off get nothing back, so the board renders as before.
 */
export function useBoardSprintSurface({
  board,
  canManage,
  canPlan,
  currentUserId,
  lists,
  sprints,
  tasks,
  wsId,
}: {
  board: Pick<WorkspaceTaskBoard, 'id' | 'default_list_id'>;
  canManage: boolean;
  canPlan: boolean;
  currentUserId?: string;
  lists: TaskList[];
  sprints: ReturnType<typeof useBoardSprints>;
  tasks: Task[];
  wsId: string;
}) {
  const [boardTab, setBoardTab] = useState<BoardTab>('board');
  const [summary, setSummary] = useState<SprintSummaryTarget | null>(null);
  const planActive = sprints.sprintsOn && boardTab === 'plan';
  const running = sprints.sprints.find((sprint) => sprint.status === 'active');

  const planTabs = sprints.sprintsOn ? (
    <BoardPlanTabs
      onTabChange={setBoardTab}
      tab={planActive ? 'plan' : 'board'}
    />
  ) : undefined;

  const sprintSlot = sprints.currentSprint ? (
    <BoardSprintPill
      boardId={board.id}
      canManage={canManage}
      onEndSprint={(sprint) =>
        setSummary({ mode: 'live', sprintId: sprint.id })
      }
      onSelectSprint={(sprint) => {
        if (sprint.status === 'completed') {
          setSummary({ mode: 'report', sprintId: sprint.id });
          return;
        }
        setBoardTab(sprint.status === 'planned' ? 'plan' : 'board');
      }}
      sprints={sprints}
      tasks={tasks}
      wsId={wsId}
    />
  ) : undefined;

  const planView = planActive ? (
    <BoardPlanView
      boardId={board.id}
      canManage={canManage}
      canPlan={canPlan}
      currentUserId={currentUserId}
      defaultListId={board.default_list_id}
      lists={lists}
      onEndActive={
        running
          ? () => setSummary({ mode: 'live', sprintId: running.id })
          : undefined
      }
      onStarted={() => setBoardTab('board')}
      sprints={sprints}
      wsId={wsId}
    />
  ) : null;

  const summaryDialog = sprints.sprintsOn ? (
    <SprintSummaryDialog
      boardId={board.id}
      canEnd={canManage}
      lists={lists}
      nextSprint={sprints.planningSprint}
      onEnded={() => setBoardTab('plan')}
      onOpenChange={(open) => {
        if (!open) setSummary(null);
      }}
      sprint={
        sprints.sprints.find((sprint) => sprint.id === summary?.sprintId) ??
        null
      }
      target={summary}
      wsId={wsId}
    />
  ) : null;

  return {
    planActive,
    planTabs,
    planView,
    showBoard: () => setBoardTab('board'),
    sprintSlot,
    summaryDialog,
  };
}
