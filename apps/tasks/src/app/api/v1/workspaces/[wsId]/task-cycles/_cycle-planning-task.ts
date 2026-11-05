import {
  currentCycleLink,
  isWorkspaceCycle,
} from '@tuturuuu/tasks-ui/tu-do/cycles/task-cycles-page-model';

/**
 * Row shape shared by the cycle-task and backlog endpoints. Mirrors
 * `CyclePlanningTask` in `@tuturuuu/tasks-ui/tu-do/cycles/planning/types`.
 */
export interface CyclePlanningTaskRow {
  id: string;
  name: string;
  display_number: number | null;
  ticket_prefix: string | null;
  priority: string | null;
  status: string;
  board_id: string;
  cycle_id: string | null;
  assignees: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  }[];
  projects: { id: string; name: string }[];
  labels: { id: string; name: string }[];
}

/**
 * PostgREST select for one planning row.
 *
 * `cycle_links` lists the task's links to live workspace cycles only: callers
 * filter `cycle_links.cycle.board_id` IS NULL and `cycle_links.cycle.deleted`
 * IS NOT TRUE, and the nested `!inner` cycle then drops board-sprint rows
 * (history and open sprint) and deleted cycles from the list.
 * `scope: 'cycle'` adds `in_cycle`, which callers filter to the requested
 * cycle so only that cycle's tasks are fetched.
 */
export function cyclePlanningTaskSelect(scope: 'cycle' | 'backlog') {
  return `
    id,
    name,
    display_number,
    priority,
    created_at,
    list:task_lists!inner(
      status,
      deleted,
      archived,
      board:workspace_boards!inner(id, ws_id, ticket_prefix, deleted_at, archived_at)
    ),${scope === 'cycle' ? '\n    in_cycle:task_cycle_tasks!inner(cycle_id),' : ''}
    cycle_links:task_cycle_tasks!left(cycle_id, created_at, cycle:task_cycles!inner(board_id, deleted)),
    assignees:task_assignees(user:users(id, display_name, avatar_url)),
    projects:task_project_tasks(project:task_projects(id, name)),
    labels:task_labels(label:workspace_task_labels(id, name))
  `;
}

type Maybe<T> = T | null | undefined;

export interface RawPlanningTask {
  id: string;
  name: string;
  display_number: Maybe<number>;
  priority: Maybe<string>;
  list: Maybe<{
    status: Maybe<string>;
    board: Maybe<{ id: string; ticket_prefix: Maybe<string> }>;
  }>;
  cycle_links: Maybe<
    {
      cycle_id: string;
      created_at?: Maybe<string>;
      cycle?: Maybe<{ board_id?: Maybe<string>; deleted?: Maybe<boolean> }>;
    }[]
  >;
  assignees: Maybe<
    {
      user: Maybe<{
        id: string;
        display_name: Maybe<string>;
        avatar_url: Maybe<string>;
      }>;
    }[]
  >;
  projects: Maybe<{ project: Maybe<{ id: string; name: string }> }[]>;
  labels: Maybe<{ label: Maybe<{ id: string; name: string }> }[]>;
}

function present<T>(value: T | null | undefined): value is T {
  return value != null;
}

type CycleLink = NonNullable<RawPlanningTask['cycle_links']>[number];

/**
 * The task's current workspace cycle link: the newest link to a live
 * workspace cycle (see `currentCycleLink` in the cycles page model).
 * Board-sprint and deleted-cycle links never count, even if a caller forgot
 * the database filters.
 */
export function currentWorkspaceCycleLink(links: Maybe<CycleLink[]>) {
  return currentCycleLink(
    (links ?? []).filter((link) => !link.cycle || isWorkspaceCycle(link.cycle))
  );
}

/** True when `cycleId` is the task's current workspace cycle. */
export function isCurrentlyInCycle(raw: RawPlanningTask, cycleId: string) {
  return currentWorkspaceCycleLink(raw.cycle_links)?.cycle_id === cycleId;
}

/** True when the task is in no live workspace cycle (the backlog). */
export function isInNoWorkspaceCycle(raw: RawPlanningTask) {
  return currentWorkspaceCycleLink(raw.cycle_links) === null;
}

export function toCyclePlanningTask(
  raw: RawPlanningTask
): CyclePlanningTaskRow {
  return {
    id: raw.id,
    name: raw.name,
    display_number: raw.display_number ?? null,
    ticket_prefix: raw.list?.board?.ticket_prefix ?? null,
    priority: raw.priority ?? null,
    status: raw.list?.status ?? 'not_started',
    board_id: raw.list?.board?.id ?? '',
    cycle_id: currentWorkspaceCycleLink(raw.cycle_links)?.cycle_id ?? null,
    assignees: (raw.assignees ?? [])
      .map((entry) => entry.user)
      .filter(present)
      .map((user) => ({
        id: user.id,
        display_name: user.display_name ?? null,
        avatar_url: user.avatar_url ?? null,
      })),
    projects: (raw.projects ?? [])
      .map((entry) => entry.project)
      .filter(present),
    labels: (raw.labels ?? []).map((entry) => entry.label).filter(present),
  };
}
