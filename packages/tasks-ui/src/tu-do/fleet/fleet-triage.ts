/**
 * Triage and grouping for the Fleet view. Pure: callers pass parsed tasks and
 * list statuses; nothing here touches React or the network.
 */
import {
  type FleetPriority,
  type FleetTaskMeta,
  getFleetStaleness,
} from './fleet-task-meta';

export type FleetBucket = 'needs_me' | 'live' | 'blocked';
export type FleetGroupBy = 'triage' | 'product' | 'priority' | 'owner';
export const FLEET_BUCKETS: FleetBucket[] = ['needs_me', 'live', 'blocked'];

export interface FleetItem<T> {
  task: T;
  meta: FleetTaskMeta;
  /** The task list's board status: not_started, active, review, done, closed, documents. */
  listStatus: string | null;
}

const LIVE_STATUSES = new Set(['running', 'waiting_review', 'waiting_ci']);
const TERMINAL_LISTS = new Set(['done', 'closed']);

/**
 * Default triage bucket, or null when the card stays out of the default view
 * (queued, done, archived). Needs-you wins over blocked, which wins over live.
 */
export function getFleetBucket(item: FleetItem<unknown>): FleetBucket | null {
  const { meta, listStatus } = item;
  if (meta.status === 'done' || (listStatus && TERMINAL_LISTS.has(listStatus)))
    return null;
  if (meta.needsUser) return 'needs_me';
  if (meta.blocked) return 'blocked';
  if (LIVE_STATUSES.has(meta.status)) return 'live';
  if (listStatus === 'active' || listStatus === 'review') return 'live';
  return null;
}

export interface FleetSummary {
  needsMe: number;
  live: number;
  blocked: number;
  stale: number;
  queued: number;
  done: number;
  open: number;
}

export function summarizeFleet(
  items: FleetItem<unknown>[],
  now: number = Date.now()
): FleetSummary {
  const s: FleetSummary = {
    needsMe: 0,
    live: 0,
    blocked: 0,
    stale: 0,
    queued: 0,
    done: 0,
    open: 0,
  };
  for (const item of items) {
    const terminal =
      item.meta.status === 'done' ||
      (item.listStatus !== null && TERMINAL_LISTS.has(item.listStatus));
    if (terminal) {
      if (item.listStatus !== 'closed') s.done += 1;
      continue;
    }
    s.open += 1;
    const bucket = getFleetBucket(item);
    if (bucket === 'needs_me') s.needsMe += 1;
    else if (bucket === 'blocked') s.blocked += 1;
    else if (bucket === 'live') s.live += 1;
    else s.queued += 1;
    if (getFleetStaleness(item.meta.lastUpdate, now) === 'stale') s.stale += 1;
  }
  return s;
}

const PRIORITY_RANK: Record<FleetPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

/** Within a group: needs-you first, then priority, then the oldest update. */
export function compareFleetItems(
  a: FleetItem<unknown>,
  b: FleetItem<unknown>
): number {
  if (a.meta.needsUser !== b.meta.needsUser) return a.meta.needsUser ? -1 : 1;
  const pa = a.meta.priority ? PRIORITY_RANK[a.meta.priority] : 4;
  const pb = b.meta.priority ? PRIORITY_RANK[b.meta.priority] : 4;
  if (pa !== pb) return pa - pb;
  const ta = a.meta.lastUpdate
    ? Date.parse(a.meta.lastUpdate)
    : Number.POSITIVE_INFINITY;
  const tb = b.meta.lastUpdate
    ? Date.parse(b.meta.lastUpdate)
    : Number.POSITIVE_INFINITY;
  return (
    (Number.isFinite(ta) ? ta : Infinity) -
    (Number.isFinite(tb) ? tb : Infinity)
  );
}

export interface FleetGroup<T> {
  key: string;
  items: FleetItem<T>[];
  needsMe: number;
  blocked: number;
}

/**
 * Groups the open cards. Triage keeps the fixed bucket order; other groupings
 * rank groups by attention (needs-you, then blocked), then size. Empty groups drop.
 */
export function groupFleetItems<T>(
  items: FleetItem<T>[],
  groupBy: FleetGroupBy
): FleetGroup<T>[] {
  const map = new Map<string, FleetItem<T>[]>();
  for (const item of items) {
    const bucket = getFleetBucket(item);
    if (!bucket) continue;
    const key =
      groupBy === 'triage'
        ? bucket
        : groupBy === 'product'
          ? (item.meta.product ?? '')
          : groupBy === 'priority'
            ? (item.meta.priority ?? '')
            : (item.meta.owner ?? '');
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  const groups = [...map.entries()].map(([key, list]) => ({
    key,
    items: list.sort(compareFleetItems),
    needsMe: list.filter((i) => i.meta.needsUser).length,
    blocked: list.filter((i) => getFleetBucket(i) === 'blocked').length,
  }));
  if (groupBy === 'triage') {
    return FLEET_BUCKETS.map(
      (b) =>
        groups.find((g) => g.key === b) ?? {
          key: b,
          items: [],
          needsMe: 0,
          blocked: 0,
        }
    );
  }
  const rank = (g: FleetGroup<T>) => (g.needsMe ? 0 : g.blocked ? 1 : 2);
  return groups.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (groupBy === 'priority') {
      const pa = a.key ? PRIORITY_RANK[a.key as FleetPriority] : 4;
      const pb = b.key ? PRIORITY_RANK[b.key as FleetPriority] : 4;
      return pa - pb;
    }
    if (!a.key !== !b.key) return a.key ? -1 : 1;
    return b.items.length - a.items.length;
  });
}
