'use client';

import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { taskMatchesBoardSearch } from '../board-task-search';
import { BoardSprintPill } from './board-sprint-pill';
import { BoardPlanView } from './plan/board-plan-view';
import type { PlanBoardCardProps } from './plan/plan-backlog';
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
  boardCard,
  canManage,
  canPlan,
  currentUserId,
  lists,
  searchQuery,
  searchTasks,
  sprints,
  tasks,
  wsId,
}: {
  board: Pick<WorkspaceTaskBoard, 'id' | 'default_list_id'>;
  /** What the Board passes its cards; the Plan backlog reuses them. */
  boardCard?: PlanBoardCardProps;
  canManage: boolean;
  canPlan: boolean;
  currentUserId?: string;
  lists: TaskList[];
  /** The header search; Plan applies it across every open sprint. */
  searchQuery?: string;
  /** Every task the board search can see, pages not loaded yet included. */
  searchTasks?: Task[];
  sprints: ReturnType<typeof useBoardSprints>;
  tasks: Task[];
  wsId: string;
}) {
  const t = useTranslations('ws-task-boards.sprints');
  const [boardTab, setBoardTab] = useState<BoardTab>('board');
  const [summary, setSummary] = useState<SprintSummaryTarget | null>(null);
  // The sprint Plan shows; null is the next one.
  const [planSprintId, setPlanSprintId] = useState<string | null>(null);
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
        if (sprint.status === 'planned') setPlanSprintId(sprint.id);
        setBoardTab(sprint.status === 'planned' ? 'plan' : 'board');
      }}
      sprints={sprints}
      tasks={tasks}
      wsId={wsId}
    />
  ) : undefined;

  // Board search matches the Board hides: tasks in other sprints or none.
  const showsOnBoard = sprints.showsOnBoard;
  const hiddenMatches = useMemo(
    () =>
      showsOnBoard && searchQuery?.trim()
        ? (searchTasks ?? tasks).filter(
            (task) =>
              !task.deleted_at &&
              !showsOnBoard(task) &&
              (sprints.openSprintByTaskId.has(task.id) ||
                sprints.unplannedTaskIds.has(task.id)) &&
              taskMatchesBoardSearch(task, searchQuery)
          ).length
        : 0,
    [
      searchQuery,
      showsOnBoard,
      sprints.openSprintByTaskId,
      searchTasks,
      sprints.unplannedTaskIds,
      tasks,
    ]
  );
  // In the Board's no-results state, the same matches as its one action.
  const searchEmptyAction = hiddenMatches ? (
    <Button onClick={() => setBoardTab('plan')} size="sm">
      {t('show_in_plan', { count: hiddenMatches })}
    </Button>
  ) : undefined;
  const searchExtra =
    !planActive && hiddenMatches ? (
      <button
        className="h-8 shrink-0 rounded-md px-2 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground"
        onClick={() => setBoardTab('plan')}
        type="button"
      >
        {t('more_in_plan', { count: hiddenMatches })}
      </button>
    ) : undefined;

  const planView = planActive ? (
    <BoardPlanView
      boardCard={boardCard}
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
      onSelectSprint={setPlanSprintId}
      onStarted={() => setBoardTab('board')}
      searchQuery={searchQuery}
      selectedSprintId={planSprintId}
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
    searchEmptyAction,
    searchExtra,
    showBoard: () => setBoardTab('board'),
    sprintSlot,
    summaryDialog,
  };
}
