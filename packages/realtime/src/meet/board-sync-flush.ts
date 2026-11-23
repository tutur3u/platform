import { planRetryReservation, type RetryBudget } from '../core/retry-budget';
import { BOARD_FLUSH_RETRY, BOARD_LIMITS } from './board-sync-schema';

/** Durable bookkeeping of one board room. Persisted with the scene. */
export interface BoardRoomMeta {
  /** Counts applied edits; the room never decreases it. */
  revision: number;
  /** Highest revision known to be stored in Durable Object storage. */
  persistedRevision: number;
  /** Highest revision known to be stored in the database. */
  flushedRevision: number;
  /** `workspace_whiteboards.updated_at` the next flush compares against. */
  baseUpdatedAt: string | null;
  /** First edit not yet persisted / flushed, for the coalescing windows. */
  persistDueAt: number | null;
  flushDueAt: number | null;
  retry?: RetryBudget;
  /** The board was unlinked or archived; nothing flushes again. */
  closed?: boolean;
}

export const emptyMeta = (): BoardRoomMeta => ({
  revision: 0,
  persistedRevision: 0,
  flushedRevision: 0,
  baseUpdatedAt: null,
  persistDueAt: null,
  flushDueAt: null,
});

/**
 * The stop fence. Flushes and storage writes halt unless the switch is
 * explicitly off; a deployment turns the fence on with
 * `MEET_WHITEBOARD_FLUSH_DISABLED=true` (or `1`). Live relay keeps working.
 */
export function boardFlushFenced(value: string | undefined) {
  return value === 'true' || value === '1';
}

/** Records an applied edit and arms the coalescing windows once. */
export function recordEdit(meta: BoardRoomMeta, now: number): BoardRoomMeta {
  const retry =
    meta.retry && now >= meta.retry.expiresAt ? undefined : meta.retry;
  return {
    ...meta,
    revision: meta.revision + 1,
    persistDueAt: meta.persistDueAt ?? now + BOARD_LIMITS.persistWindowMs,
    flushDueAt: meta.flushDueAt ?? now + BOARD_LIMITS.flushWindowMs,
    retry,
  };
}

/** The last participant left: flush soon instead of waiting out the window. */
export function recordIdle(meta: BoardRoomMeta, now: number): BoardRoomMeta {
  if (meta.revision === meta.flushedRevision || meta.closed) return meta;
  const at = now + BOARD_LIMITS.idleFlushMs;
  return {
    ...meta,
    persistDueAt:
      meta.persistDueAt === null ? at : Math.min(meta.persistDueAt, at),
    flushDueAt: meta.flushDueAt === null ? at : Math.min(meta.flushDueAt, at),
  };
}

export const needsPersist = (meta: BoardRoomMeta) =>
  meta.revision > meta.persistedRevision;
export const needsFlush = (meta: BoardRoomMeta) =>
  !meta.closed && meta.revision > meta.flushedRevision;

export interface AlarmInput {
  meta: BoardRoomMeta;
  now: number;
  fenced: boolean;
  connected: boolean;
  sweepDueAt: number | null;
}

/**
 * The single next alarm, or null when the room is quiet. A quiet room (nobody
 * connected, nothing dirty) schedules nothing, so an idle board costs nothing.
 */
export function nextAlarmAt({
  meta,
  now,
  fenced,
  connected,
  sweepDueAt,
}: AlarmInput): number | null {
  const due: number[] = [];
  if (connected && sweepDueAt !== null) due.push(sweepDueAt);
  if (!fenced && !meta.closed) {
    if (needsPersist(meta) && meta.persistDueAt !== null)
      due.push(meta.persistDueAt);
    if (needsFlush(meta) && meta.flushDueAt !== null) {
      const plan = planRetryReservation(
        meta.retry,
        Math.max(now, meta.flushDueAt),
        BOARD_FLUSH_RETRY
      );
      // A spent budget leaves the edits unflushed until a later edit re-arms.
      if (plan.kind === 'wait') due.push(plan.at);
      else if (plan.kind === 'reserve') due.push(meta.flushDueAt);
    }
  }
  return due.length === 0 ? null : Math.max(Math.min(...due), now + 1);
}

/** Reserves one flush attempt before any network I/O; null when the budget is spent. */
export function reserveFlushAttempt(
  meta: BoardRoomMeta,
  now: number
): { meta: BoardRoomMeta } | { wait: number } | null {
  const plan = planRetryReservation(meta.retry, now, BOARD_FLUSH_RETRY);
  if (plan.kind === 'stop') return null;
  if (plan.kind === 'wait') return { wait: plan.at };
  return { meta: { ...meta, retry: plan.reservation } };
}

/** A flush landed: the revision is durable and the retry budget resets. */
export function recordFlushed(
  meta: BoardRoomMeta,
  flushedRevision: number,
  updatedAt: string,
  now: number
): BoardRoomMeta {
  const dirtyAgain = meta.revision > flushedRevision;
  return {
    ...meta,
    flushedRevision,
    baseUpdatedAt: updatedAt,
    retry: undefined,
    flushDueAt: dirtyAgain ? now + BOARD_LIMITS.flushWindowMs : null,
  };
}
