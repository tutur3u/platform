import { getTicketIdentifier } from '@tuturuuu/utils/task-helper';
import {
  ASSIGNEE_ME,
  ASSIGNEE_UNASSIGNED,
  type CyclePlanningCycle,
  type CyclePlanningFilters,
  type CyclePlanningPerson,
  type CyclePlanningScope,
  type CyclePlanningTag,
  type CyclePlanningTask,
  type CycleTaskStatus,
  PROJECT_NONE,
} from './types';

/** Section order of the status-grouped list. `documents` lists are omitted. */
export const CYCLE_STATUS_ORDER = [
  'active',
  'review',
  'not_started',
  'done',
  'closed',
] as const satisfies readonly CycleTaskStatus[];

export type CycleGroupStatus = (typeof CYCLE_STATUS_ORDER)[number];

export const DEFAULT_COLLAPSED_STATUSES: readonly CycleGroupStatus[] = [
  'closed',
];

export interface CycleStatusGroup {
  status: CycleGroupStatus;
  tasks: CyclePlanningTask[];
}

/** Calendar day in the viewer's local timezone (cycle dates are local days). */
export function localDay(now: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function toDay(value: string | null) {
  return value ? value.slice(0, 10) : null;
}

function startsBefore(a: CyclePlanningCycle, b: CyclePlanningCycle) {
  return (toDay(a.start_date) ?? '9999') < (toDay(b.start_date) ?? '9999');
}

/**
 * The cycles behind the Current and Next scopes. Current is the active
 * cycle (the latest started, if several), else a planned cycle whose dates
 * include today. Next is the earliest planned cycle after it.
 */
export function resolveScopeCycles(
  cycles: CyclePlanningCycle[],
  now: Date = new Date()
) {
  const today = localDay(now);
  const active = cycles
    .filter((cycle) => cycle.status === 'active')
    .sort((a, b) => (startsBefore(a, b) ? 1 : -1));
  const running = cycles.find(
    (cycle) =>
      cycle.status === 'planned' &&
      (toDay(cycle.start_date) ?? '9999') <= today &&
      (toDay(cycle.end_date) ?? '0000') >= today
  );
  const current = active[0] ?? running ?? null;
  const next =
    cycles
      .filter(
        (cycle) =>
          cycle.status === 'planned' &&
          cycle.id !== current?.id &&
          (toDay(cycle.start_date) ?? '9999') >= today
      )
      .sort((a, b) => (startsBefore(a, b) ? -1 : 1))[0] ?? null;

  return { current, next };
}

export function scopeCycleId(
  scope: CyclePlanningScope,
  cycles: ReturnType<typeof resolveScopeCycles>
) {
  if (scope === 'backlog') return null;
  return cycles[scope]?.id ?? null;
}

/** The backlog lists open tasks only, so finished tasks cannot move there. */
export function canMoveToScope(
  task: CyclePlanningTask,
  target: CyclePlanningScope
) {
  return (
    target !== 'backlog' || (task.status !== 'done' && task.status !== 'closed')
  );
}

/** The API returns at most this many tasks per scope (no pagination yet). */
export const CYCLE_TASK_LIST_CAP = 500;

export function groupTasksByStatus(
  tasks: CyclePlanningTask[]
): CycleStatusGroup[] {
  return CYCLE_STATUS_ORDER.map((status) => ({
    status,
    tasks: tasks.filter((task) => task.status === status),
  })).filter((group) => group.tasks.length > 0);
}

export function taskTicket(task: CyclePlanningTask) {
  return getTicketIdentifier(task.ticket_prefix, task.display_number);
}

export function hasActiveFilters(filters: CyclePlanningFilters) {
  return (
    filters.assigneeIds.length > 0 ||
    filters.projectIds.length > 0 ||
    filters.priorities.length > 0 ||
    filters.labelIds.length > 0 ||
    filters.query.trim().length > 0
  );
}

function matchesAssignee(
  task: CyclePlanningTask,
  ids: string[],
  currentUserId: string
) {
  if (ids.length === 0) return true;
  if (ids.includes(ASSIGNEE_UNASSIGNED) && task.assignees.length === 0)
    return true;
  return task.assignees.some(
    (person) =>
      ids.includes(person.id) ||
      (ids.includes(ASSIGNEE_ME) && person.id === currentUserId)
  );
}

function matchesProject(task: CyclePlanningTask, ids: string[]) {
  if (ids.length === 0) return true;
  if (ids.includes(PROJECT_NONE) && task.projects.length === 0) return true;
  return task.projects.some((project) => ids.includes(project.id));
}

function matchesQuery(task: CyclePlanningTask, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    task.name.toLowerCase().includes(needle) ||
    taskTicket(task).toLowerCase().includes(needle)
  );
}

export function filterCycleTasks(
  tasks: CyclePlanningTask[],
  filters: CyclePlanningFilters,
  currentUserId: string
) {
  return tasks.filter(
    (task) =>
      matchesAssignee(task, filters.assigneeIds, currentUserId) &&
      matchesProject(task, filters.projectIds) &&
      matchesQuery(task, filters.query) &&
      (filters.priorities.length === 0 ||
        (task.priority !== null &&
          filters.priorities.includes(task.priority))) &&
      (filters.labelIds.length === 0 ||
        task.labels.some((label) => filters.labelIds.includes(label.id)))
  );
}

function uniqueById<T extends { id: string }>(items: T[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

/** Filter choices drawn from the loaded tasks; no extra requests. */
export function collectFilterOptions(
  tasks: CyclePlanningTask[],
  currentUserId: string
) {
  const byName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name);
  const people: CyclePlanningPerson[] = uniqueById(
    tasks.flatMap((task) => task.assignees)
  )
    .filter((person) => person.id !== currentUserId)
    .sort((a, b) => (a.display_name ?? '').localeCompare(b.display_name ?? ''));
  const projects: CyclePlanningTag[] = uniqueById(
    tasks.flatMap((task) => task.projects)
  ).sort(byName);
  const labels: CyclePlanningTag[] = uniqueById(
    tasks.flatMap((task) => task.labels)
  ).sort(byName);
  return { people, projects, labels };
}

/**
 * Drops filter values with no option in the loaded scope, so a filter from
 * another scope cannot silently hide every row. Sentinels and priorities are
 * always offered and are kept.
 */
export function pruneFilters(
  filters: CyclePlanningFilters,
  options: ReturnType<typeof collectFilterOptions>
): CyclePlanningFilters {
  const keep = (
    ids: string[],
    available: { id: string }[],
    sentinels: string[]
  ) => {
    const allowed = new Set([
      ...available.map((item) => item.id),
      ...sentinels,
    ]);
    const kept = ids.filter((id) => allowed.has(id));
    return kept.length === ids.length ? ids : kept;
  };
  const assigneeIds = keep(filters.assigneeIds, options.people, [
    ASSIGNEE_ME,
    ASSIGNEE_UNASSIGNED,
  ]);
  const projectIds = keep(filters.projectIds, options.projects, [PROJECT_NONE]);
  const labelIds = keep(filters.labelIds, options.labels, []);
  if (
    assigneeIds === filters.assigneeIds &&
    projectIds === filters.projectIds &&
    labelIds === filters.labelIds
  ) {
    return filters;
  }
  return { ...filters, assigneeIds, projectIds, labelIds };
}
