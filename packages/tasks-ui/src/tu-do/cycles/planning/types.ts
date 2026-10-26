/** Task list status as stored on `task_lists.status`. */
export type CycleTaskStatus =
  | 'not_started'
  | 'active'
  | 'review'
  | 'done'
  | 'closed'
  | 'documents';

export type CycleTaskPriority = 'critical' | 'high' | 'normal' | 'low';

export type CyclePlanningScope = 'current' | 'next' | 'backlog';

export interface CyclePlanningPerson {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface CyclePlanningTag {
  id: string;
  name: string;
}

/**
 * One row of the cycle view. Mirrors the task payload of the cycle-task and
 * backlog endpoints (see `cycle-planning-api.ts`).
 */
export interface CyclePlanningTask {
  id: string;
  name: string;
  display_number: number | null;
  ticket_prefix: string | null;
  priority: CycleTaskPriority | null;
  status: CycleTaskStatus;
  board_id: string;
  cycle_id: string | null;
  assignees: CyclePlanningPerson[];
  projects: CyclePlanningTag[];
  labels: CyclePlanningTag[];
}

export interface CyclePlanningCycle {
  id: string;
  name: string;
  status: 'planned' | 'active' | 'completed' | 'cancelled' | null;
  start_date: string | null;
  end_date: string | null;
}

/** Sentinels mixed into `assigneeIds` next to real user ids. */
export const ASSIGNEE_ME = '@me';
export const ASSIGNEE_UNASSIGNED = '@unassigned';
/** Sentinel mixed into `projectIds` for tasks without a project. */
export const PROJECT_NONE = '@none';

/**
 * The cycle view's filter state. Coordination point: this is deliberately
 * separate from the board `TaskFilters` until both sides agree on one shared
 * filter type.
 */
export interface CyclePlanningFilters {
  assigneeIds: string[];
  projectIds: string[];
  query: string;
  priorities: CycleTaskPriority[];
  labelIds: string[];
}

export const EMPTY_CYCLE_PLANNING_FILTERS: CyclePlanningFilters = {
  assigneeIds: [],
  projectIds: [],
  query: '',
  priorities: [],
  labelIds: [],
};
