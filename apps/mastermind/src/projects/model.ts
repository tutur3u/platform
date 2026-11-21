import type { Tone } from '../components/tone';
import type {
  ProjectGroup,
  ProjectsSnapshot,
  StateCounts,
  ThreadErrorCode,
  ThreadRow,
  ThreadState,
} from './contract';
import { threadStates } from './contract';

export const STATE_TONE: Record<ThreadState, Tone> = {
  running: 'green',
  waiting: 'orange',
  failed: 'red',
  idle: 'gray',
};

/** One page of an expanded group or a flat list. */
export const PAGE_SIZE = 50;
/** The id `/threads` takes for threads outside every project. */
export const UNASSIGNED = 'none';

export type StateFilter = ThreadState | 'all';
export const stateFilters: readonly StateFilter[] = ['all', ...threadStates];

/** Unread items, or `new` when the owner has never opened the thread. */
export function unread(row: ThreadRow): number | 'new' {
  if (row.seenItemCount === undefined) return 'new';
  return Math.max(0, row.itemCount - row.seenItemCount);
}

export function total(counts: StateCounts) {
  return counts.running + counts.waiting + counts.failed + counts.idle;
}

/** Chip totals across every project and the unassigned group. */
export function filterCounts(
  snapshot: ProjectsSnapshot
): Record<StateFilter, number> {
  const sum: StateCounts = { ...snapshot.unassigned.counts };
  for (const group of snapshot.projects)
    for (const state of threadStates) sum[state] += group.counts[state];
  return { all: total(sum), ...sum };
}

export interface GroupView {
  id: string;
  label?: string;
  counts: StateCounts;
  threadCount: number;
}

/** Groups to render for a state filter: projects first, unassigned last. */
export function visibleGroups(
  snapshot: ProjectsSnapshot,
  filter: StateFilter
): GroupView[] {
  const groups: GroupView[] = snapshot.projects.map((p: ProjectGroup) => ({
    id: p.projectId,
    label: p.project,
    counts: p.counts,
    threadCount: p.threadCount,
  }));
  if (snapshot.unassigned.threadCount > 0)
    groups.push({
      id: UNASSIGNED,
      counts: snapshot.unassigned.counts,
      threadCount: snapshot.unassigned.threadCount,
    });
  return filter === 'all'
    ? groups
    : groups.filter((group) => group.counts[filter] > 0);
}

/** A thread route's refusal, thrown so a query keeps its last good data. */
export class ThreadError extends Error {
  constructor(readonly code: ThreadErrorCode) {
    super(code);
  }
}

export function threadErrorOf(error: unknown): ThreadErrorCode | undefined {
  return error instanceof ThreadError ? error.code : undefined;
}

/** `t3-thread` deep link, only for a linked machine whose environment is known. */
export function t3ThreadLink(
  environmentId: string | undefined,
  threadId: string
) {
  return environmentId
    ? `t3-thread://v2/${encodeURIComponent(environmentId)}/${threadId}`
    : undefined;
}
