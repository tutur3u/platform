// One bounded pass of orphaned task-media cleanup, called once per Cron
// Control slot. Each pass stops at the first cap it reaches (list calls,
// checked files, removals or elapsed time) and reports `capped`; the next
// daily slot continues. Files are checked page by page as they are listed, and
// the starting workspace advances by a prime stride each day, so capped passes
// spread over all workspaces. A workspace whose old, still-referenced files
// exceed one pass's check cap is only partly covered; a durable cursor (the
// planned Worker processor) closes that gap. Removing only unreferenced media
// older than the retention period keeps passes idempotent.
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  removeUnreferencedTaskMedia,
  taskMediaFilename,
} from './task-media-cleanup';

export type TaskMediaCleanupMode = 'off' | 'dry-run' | 'delete';

export type TaskMediaCleanupLimits = {
  /** Root workspace listing; exceeding it fails the pass (10,000 entries). */
  maxRootListCalls: number;
  maxListCalls: number;
  maxChecked: number;
  /** Deletions, or `removable` files in dry-run. */
  maxRemoved: number;
  timeBudgetMs: number;
};

export const TASK_MEDIA_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
// Under Cron Control's 310 s job timeout, with margin for the response.
export const TASK_MEDIA_CLEANUP_LIMITS: TaskMediaCleanupLimits = {
  maxRootListCalls: 100,
  maxListCalls: 200,
  maxChecked: 500,
  maxRemoved: 200,
  timeBudgetMs: 240_000,
};
const PAGE_SIZE = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
// Primes near the number of workspaces one capped pass reaches; the first one
// coprime to the workspace count gives every workspace a turn as the start.
const WORKSPACE_STRIDES = [97, 89, 83, 79, 73];
const WORKSPACE_ID = /^[0-9a-f-]{36}$/i;

/** Only an exact `delete` deletes and an exact `off` stops; anything else counts. */
export function taskMediaCleanupMode(
  value: string | undefined
): TaskMediaCleanupMode {
  if (value === 'delete') return 'delete';
  if (value === 'off') return 'off';
  return 'dry-run';
}

export type TaskMediaCleanupReport = {
  mode: TaskMediaCleanupMode;
  checked: number;
  /** Files removed (delete mode only). */
  deleted: number;
  /** Files a dry-run pass would remove. */
  removable: number;
  failed: number;
  rootListCalls: number;
  listCalls: number;
  capped: false | 'list-calls' | 'checked' | 'removed' | 'time';
};

class Capped extends Error {
  constructor(
    readonly reason: Exclude<TaskMediaCleanupReport['capped'], false>
  ) {
    super(reason);
  }
}

export async function runTaskMediaCleanup(
  admin: TypedSupabaseClient,
  {
    mode,
    now = Date.now,
    limits = TASK_MEDIA_CLEANUP_LIMITS,
  }: {
    mode: Exclude<TaskMediaCleanupMode, 'off'>;
    now?: () => number;
    limits?: TaskMediaCleanupLimits;
  }
): Promise<TaskMediaCleanupReport> {
  const started = now();
  const cutoff = started - TASK_MEDIA_RETENTION_MS;
  const bucket = admin.storage.from('workspaces');
  const report: TaskMediaCleanupReport = {
    mode,
    checked: 0,
    deleted: 0,
    removable: 0,
    failed: 0,
    rootListCalls: 0,
    listCalls: 0,
    capped: false,
  };

  const guard = () => {
    if (now() - started >= limits.timeBudgetMs) throw new Capped('time');
  };

  async function listPage(prefix: string, offset: number) {
    guard();
    if (report.listCalls >= limits.maxListCalls) throw new Capped('list-calls');
    report.listCalls++;
    const { data, error } = await bucket.list(prefix, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    return data ?? [];
  }

  // The root listing has its own budget so a large workspace count can never
  // leave the inspection budget empty; exceeding it fails the pass loudly.
  async function listWorkspaces() {
    const entries = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      guard();
      if (report.rootListCalls >= limits.maxRootListCalls)
        throw new Error(
          `Workspace listing has at least ${limits.maxRootListCalls * PAGE_SIZE} entries`
        );
      report.rootListCalls++;
      const { data, error } = await bucket.list('', {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw error;
      entries.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
    }
    return entries;
  }

  async function check(path: string) {
    guard();
    if (report.checked >= limits.maxChecked) throw new Capped('checked');
    if (report.deleted + report.removable >= limits.maxRemoved)
      throw new Capped('removed');
    report.checked++;
    try {
      const removed = await removeUnreferencedTaskMedia(admin, path, {
        dryRun: mode === 'dry-run',
      });
      if (removed && mode === 'delete') report.deleted++;
      if (removed && mode === 'dry-run') report.removable++;
      return removed && mode === 'delete';
    } catch (error) {
      report.failed++;
      console.error('Failed to inspect task media:', error);
      return false;
    }
  }

  // Checks each page as it arrives. A removal shifts later names one place
  // earlier, so the next offset steps back by what this page removed: deleted
  // files and nested folders that became empty (Storage folders are virtual).
  // Returns whether the folder ended up empty.
  async function inspect(prefix: string): Promise<boolean> {
    let kept = 0;
    let removedTotal = 0;
    for (let offset = 0; ;) {
      const page = await listPage(prefix, offset);
      let removed = 0;
      for (const entry of page) {
        const path = `${prefix}/${entry.name}`;
        if (!entry.id) {
          if (await inspect(path)) removed++;
          else kept++;
          continue;
        }
        const createdAt = entry.created_at ? Date.parse(entry.created_at) : NaN;
        const candidate =
          !!taskMediaFilename(path) &&
          Number.isFinite(createdAt) &&
          createdAt <= cutoff;
        if (candidate && (await check(path))) removed++;
        else kept++;
      }
      removedTotal += removed;
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE - removed;
    }
    // Only a folder this pass emptied disappears; an already-empty listing
    // (or any dry-run) must not shift the parent's offset.
    return kept === 0 && removedTotal > 0;
  }

  try {
    const workspaces = (await listWorkspaces())
      .filter((entry) => WORKSPACE_ID.test(entry.name) && !entry.id)
      .map((entry) => entry.name);
    const stride =
      WORKSPACE_STRIDES.find((prime) => workspaces.length % prime !== 0) ?? 1;
    const offset = workspaces.length
      ? (Math.floor(started / DAY_MS) * stride) % workspaces.length
      : 0;
    const ordered = [
      ...workspaces.slice(offset),
      ...workspaces.slice(0, offset),
    ];
    for (const workspace of ordered) {
      try {
        await inspect(`${workspace}/task-images`);
      } catch (error) {
        if (error instanceof Capped) throw error;
        report.failed++;
        console.error('Failed to list task media for workspace:', error);
      }
    }
  } catch (error) {
    if (!(error instanceof Capped)) throw error;
    report.capped = error.reason;
  }
  return report;
}
