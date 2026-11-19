import {
  type TaskBoardCacheSnapshot,
  writeTaskBoardCache,
} from './task-board-cache';

type PendingSnapshot = Omit<TaskBoardCacheSnapshot, 'updatedAt'>;

export const TASK_BOARD_CACHE_WRITE_DELAY_MS = 800;

const pending = new Map<
  string,
  { workspaceId: string; boardId: string; snapshot: PendingSnapshot }
>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let pageHideBound = false;

function keyOf(workspaceId: string, boardId: string) {
  return `${workspaceId}:${boardId}`;
}

function flushKey(key: string) {
  const timer = timers.get(key);
  if (timer) clearTimeout(timer);
  timers.delete(key);
  const entry = pending.get(key);
  pending.delete(key);
  if (entry)
    writeTaskBoardCache(entry.workspaceId, entry.boardId, entry.snapshot);
}

/** Writes every pending board snapshot now (page hide, unmount, tests). */
export function flushTaskBoardCacheWrites() {
  for (const key of [...pending.keys()]) flushKey(key);
}

/**
 * Coalesces board snapshot writes. Rapid task changes (realtime batches,
 * optimistic bulk moves) serialize the board once after they settle, instead
 * of synchronously on every change. The latest snapshot always wins, and
 * pending writes flush when the page is hidden.
 */
export function scheduleTaskBoardCacheWrite(
  workspaceId: string,
  boardId: string,
  snapshot: PendingSnapshot,
  delayMs = TASK_BOARD_CACHE_WRITE_DELAY_MS
) {
  if (typeof window === 'undefined') return;
  const key = keyOf(workspaceId, boardId);
  pending.set(key, { workspaceId, boardId, snapshot });
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  timers.set(
    key,
    setTimeout(() => flushKey(key), delayMs)
  );
  if (!pageHideBound) {
    pageHideBound = true;
    window.addEventListener('pagehide', flushTaskBoardCacheWrites);
  }
}

/** Flushes one board's pending snapshot, if any. */
export function flushTaskBoardCacheWrite(workspaceId: string, boardId: string) {
  flushKey(keyOf(workspaceId, boardId));
}
