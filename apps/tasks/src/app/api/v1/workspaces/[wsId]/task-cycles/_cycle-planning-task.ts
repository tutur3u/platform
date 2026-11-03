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

/** PostgREST select for one planning row; `cycleJoin` picks inner/left. */
export function cyclePlanningTaskSelect(cycleJoin: 'inner' | 'left') {
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
    ),
    cycle_links:task_cycle_tasks!${cycleJoin}(cycle_id, created_at),
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
  cycle_links: Maybe<{ cycle_id: string; created_at?: Maybe<string> }[]>;
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

function linkTime(link: CycleLink) {
  const time = link.created_at ? Date.parse(link.created_at) : Number.NaN;
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/**
 * Links written before one-cycle-per-task may leave a task in several cycles,
 * returned in no particular order. Pick one deterministically: the newest
 * created_at (missing last), then the lowest cycle_id (the table has no id).
 */
export function currentCycleLink(links: Maybe<CycleLink[]>) {
  let current: CycleLink | null = null;
  for (const link of links ?? []) {
    if (
      !current ||
      linkTime(link) > linkTime(current) ||
      (linkTime(link) === linkTime(current) && link.cycle_id < current.cycle_id)
    ) {
      current = link;
    }
  }
  return current;
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
    cycle_id: currentCycleLink(raw.cycle_links)?.cycle_id ?? null,
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
