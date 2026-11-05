'use client';

import { useQuery } from '@tanstack/react-query';
import type { BoardSprint } from '@tuturuuu/internal-api/task-sprints';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { isTaskFinished } from '@tuturuuu/utils/task-helper/sprints';
import { useMemo } from 'react';
import {
  type BoardMember,
  fetchBoardMembers,
  getBoardMembersQueryKey,
} from '../../board-members-query';
import { listBoardTasksForSearch } from '../../board-task-search';

// Every list a sprint task can sit in; Review is open work, so the backlog
// and the end summary must see it.
const SPRINT_LIST_STATUSES = [
  'not_started',
  'active',
  'review',
  'done',
  'closed',
];

/**
 * Starts with 'tasks-full' so the shared optimistic patches (assignees, status,
 * edits from the side panel) reach it like every other board task cache.
 */
export function getSprintTasksQueryKey(boardId: string) {
  return ['tasks-full', boardId, 'sprints'] as const;
}

/**
 * Every task of the board, in any list. The Kanban loads lists lazily, so the
 * plan and the sprint summary load their own copy to see whole sprints.
 */
export function useSprintTasks({
  boardId,
  enabled,
  wsId,
}: {
  boardId: string;
  enabled: boolean;
  wsId: string;
}) {
  return useQuery({
    queryKey: getSprintTasksQueryKey(boardId),
    queryFn: () =>
      listBoardTasksForSearch(wsId, {
        boardId,
        includeRelationshipSummary: false,
        limit: 200,
        listStatuses: SPRINT_LIST_STATUSES,
      }),
    enabled: enabled && Boolean(wsId && boardId),
    staleTime: 60_000,
  });
}

export function useBoardMembers({
  boardId,
  enabled,
  wsId,
}: {
  boardId: string;
  enabled: boolean;
  wsId: string;
}) {
  return useQuery({
    queryKey: getBoardMembersQueryKey(wsId, boardId),
    queryFn: () => fetchBoardMembers(wsId, boardId),
    enabled: enabled && Boolean(wsId && boardId),
    staleTime: 5 * 60 * 1000,
  });
}

export interface PlanOwner {
  member: BoardMember;
  tasks: Task[];
}

/**
 * Splits the shown sprints into the backlog (unassigned, open, plus open tasks
 * parked outside every sprint) and one section per board member. A task with
 * several assignees shows under each.
 */
export function useSprintPlanGroups({
  currentUserId,
  members,
  sprint,
  tasks,
  unfinishedOnly = false,
  unplannedTaskIds,
}: {
  currentUserId?: string;
  members: BoardMember[];
  sprint: Pick<BoardSprint, 'tasks'> | null;
  tasks: Task[];
  /** All sprints at once lists only work still to do. */
  unfinishedOnly?: boolean;
  unplannedTaskIds?: ReadonlySet<string>;
}) {
  return useMemo(() => {
    const ids = new Set(sprint?.tasks.map((task) => task.task_id));
    const sprintTasks = tasks.filter(
      (task) =>
        ids.has(task.id) &&
        !task.deleted_at &&
        !(unfinishedOnly && isTaskFinished(task))
    );
    const ghosts = tasks.filter(
      (task) =>
        unplannedTaskIds?.has(task.id) &&
        !ids.has(task.id) &&
        !task.deleted_at &&
        !isTaskFinished(task)
    );
    const backlog = [
      ...sprintTasks.filter(
        (task) => !task.assignees?.length && !isTaskFinished(task)
      ),
      ...ghosts,
    ];

    const byMember = new Map<string, Task[]>();
    for (const task of sprintTasks) {
      for (const assignee of task.assignees ?? []) {
        byMember.set(assignee.id, [...(byMember.get(assignee.id) ?? []), task]);
      }
    }

    const knownMembers = new Map(members.map((member) => [member.id, member]));
    // Assignees who left the board still own their tasks until reassigned.
    for (const task of sprintTasks) {
      for (const assignee of task.assignees ?? []) {
        if (!knownMembers.has(assignee.id)) {
          knownMembers.set(assignee.id, {
            id: assignee.id,
            display_name: assignee.display_name ?? undefined,
            avatar_url: assignee.avatar_url ?? undefined,
          });
        }
      }
    }

    const owners: PlanOwner[] = [...knownMembers.values()]
      .map((member) => ({ member, tasks: byMember.get(member.id) ?? [] }))
      .sort((a, b) => {
        if (a.member.id === currentUserId) return -1;
        if (b.member.id === currentUserId) return 1;
        if (a.tasks.length !== b.tasks.length) {
          return b.tasks.length - a.tasks.length;
        }
        return (a.member.display_name ?? '').localeCompare(
          b.member.display_name ?? ''
        );
      });

    return { backlog, owners, sprintTasks };
  }, [currentUserId, members, sprint, tasks, unfinishedOnly, unplannedTaskIds]);
}
