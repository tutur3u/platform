import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

type Maybe<T> = T | null | undefined;

/** One task_cycle_tasks row, as far as the current-cycle rule needs it. */
export interface CycleLinkLike {
  cycle_id: string;
  created_at?: Maybe<string>;
}

function linkTime(link: CycleLinkLike) {
  const time = link.created_at ? Date.parse(link.created_at) : Number.NaN;
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

function isNewerLink(link: CycleLinkLike, than: CycleLinkLike) {
  return (
    linkTime(link) > linkTime(than) ||
    (linkTime(link) === linkTime(than) && link.cycle_id < than.cycle_id)
  );
}

/**
 * One workspace cycle per task: links written before assign_task_cycle may
 * leave a task in several workspace cycles, returned in no particular order.
 * The task's current cycle is the newest link (created_at, missing last),
 * then the lowest cycle_id (the table has no id). Callers pass links to live
 * workspace cycles only; board sprints keep one row per sprint on purpose.
 */
export function currentCycleLink<T extends CycleLinkLike>(
  links: Maybe<readonly T[]>
): T | null {
  let current: T | null = null;
  for (const link of links ?? []) {
    if (!current || isNewerLink(link, current)) current = link;
  }
  return current;
}

/** Board sprints and deleted cycles are outside the one-cycle-per-task rule. */
export function isWorkspaceCycle(cycle: {
  board_id?: Maybe<string>;
  deleted?: Maybe<boolean>;
}) {
  return cycle.board_id == null && cycle.deleted !== true;
}

export interface CountableCycle {
  id: string;
  board_id?: Maybe<string>;
  deleted?: Maybe<boolean>;
  task_cycle_tasks: Maybe<{ task_id: string; created_at?: Maybe<string> }[]>;
}

/**
 * Task counts for a workspace's cycles. A task linked to several live
 * workspace cycles counts only in its current (newest) one. Board sprints
 * and deleted cycles count all their rows: sprint rows are per-sprint
 * membership and history, not competing links.
 */
export function countCurrentCycleTasks(cycles: readonly CountableCycle[]) {
  const counts = new Map<string, number>();
  const current = new Map<string, CycleLinkLike>();
  for (const cycle of cycles) {
    const links = cycle.task_cycle_tasks ?? [];
    if (!isWorkspaceCycle(cycle)) {
      counts.set(cycle.id, new Set(links.map((link) => link.task_id)).size);
      continue;
    }
    counts.set(cycle.id, 0);
    for (const link of links) {
      const candidate = { cycle_id: cycle.id, created_at: link.created_at };
      const existing = current.get(link.task_id);
      if (!existing || isNewerLink(candidate, existing)) {
        current.set(link.task_id, candidate);
      }
    }
  }
  for (const link of current.values()) {
    counts.set(link.cycle_id, (counts.get(link.cycle_id) ?? 0) + 1);
  }
  return counts;
}

type CycleRow = {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  board_id?: string | null;
  deleted?: boolean | null;
  creator: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  task_cycle_tasks: { task_id: string; created_at?: string | null }[] | null;
};

const CYCLE_STATUSES = ['planned', 'active', 'completed', 'cancelled'] as const;

function toCycleStatus(value: string | null) {
  if (!value) return null;
  return CYCLE_STATUSES.includes(value as (typeof CYCLE_STATUSES)[number])
    ? (value as (typeof CYCLE_STATUSES)[number])
    : null;
}

/**
 * A workspace's task cycles for the cycles page, newest first. Returns
 * `null` when the query fails. Framework-free: the caller supplies the
 * request-scoped Supabase client and has already checked permissions.
 */
export async function loadTaskCycles(
  supabase: TypedSupabaseClient,
  wsId: string
) {
  const { data, error } = await supabase
    .from('task_cycles')
    .select(
      `
        *,
        creator:users!task_cycles_creator_id_fkey(
          id, display_name, avatar_url
        ),
        task_cycle_tasks(task_id, created_at)
      `
    )
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching task cycles:', error);
    return null;
  }

  const cycles = (data as CycleRow[] | null) ?? [];
  const counts = countCurrentCycleTasks(cycles);
  return cycles.map((cycle) => ({
    id: cycle.id,
    name: cycle.name,
    description: cycle.description,
    status: toCycleStatus(cycle.status),
    start_date: cycle.start_date,
    end_date: cycle.end_date,
    created_at: cycle.created_at,
    creator: cycle.creator,
    tasksCount: counts.get(cycle.id) ?? 0,
  }));
}
