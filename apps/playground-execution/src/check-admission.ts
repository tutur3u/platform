import type { AdmissionStorage } from './admission';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_MS = 10 * 60 * 1000;
const PRUNE_LIMIT = 64;
// Rows outlive the quota window so a pause can find every room whose guest
// may still be inside its 30-minute lifetime.
const RETENTION_MS = 35 * 60 * 1000;

export interface CheckCapacity {
  readonly perUserPerWindow: number;
  readonly perRoomPerWindow: number;
  readonly perDay: number;
}

export const DEFAULT_CHECK_CAPACITY: CheckCapacity = Object.freeze({
  perUserPerWindow: 60,
  perRoomPerWindow: 300,
  perDay: 20_000,
});

export function parseCheckCapacity(env: {
  PLAYGROUND_MAX_CHECKS_PER_UTC_DAY?: string;
}): CheckCapacity {
  const value = env.PLAYGROUND_MAX_CHECKS_PER_UTC_DAY;
  if (value === undefined) return DEFAULT_CHECK_CAPACITY;
  const count = Number(value);
  if (!/^[1-9][0-9]*$/u.test(value) || count > DEFAULT_CHECK_CAPACITY.perDay) {
    throw new Error('Invalid Playground check capacity configuration');
  }
  return { ...DEFAULT_CHECK_CAPACITY, perDay: count };
}

export interface CheckRequest {
  requestId: string;
  requester: string;
  room: string;
}

export type CheckAdmissionResult =
  | { kind: 'admitted'; admittedAt: number }
  | {
      kind: 'refused';
      reason: 'execution_paused' | 'check_quota' | 'request_conflict';
      retryAfterMs?: number;
    };

/**
 * Charges checks against their own budget, separate from Runs. Every
 * admitted attempt is charged. The durable admission gate that pauses Runs
 * pauses checks too.
 */
export class CheckAdmission {
  private readonly storage: AdmissionStorage;
  private readonly capacity: CheckCapacity;

  constructor(storage: AdmissionStorage, capacity: CheckCapacity) {
    this.storage = storage;
    this.capacity = capacity;
    storage.query(`
      CREATE TABLE IF NOT EXISTS playground_checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT NOT NULL,
        requester TEXT NOT NULL,
        room TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`);
    storage.query(`
      CREATE INDEX IF NOT EXISTS playground_check_request
      ON playground_checks (request_id)`);
    storage.query(`
      CREATE INDEX IF NOT EXISTS playground_check_user
      ON playground_checks (requester, created_at)`);
    storage.query(`
      CREATE INDEX IF NOT EXISTS playground_check_room
      ON playground_checks (room, created_at)`);
    storage.query(`
      CREATE TABLE IF NOT EXISTS playground_check_budget (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        day INTEGER NOT NULL,
        count INTEGER NOT NULL
      )`);
    storage.query(
      'INSERT OR IGNORE INTO playground_check_budget VALUES (1, -1, 0)'
    );
  }

  /** Rooms with checks within a guest lifetime: the only ones with live guests. */
  recentRooms(now: number, limit = 100): string[] {
    return Array.from(
      this.storage.query<{ room: string }>(
        `SELECT room FROM playground_checks WHERE created_at > ?
         GROUP BY room ORDER BY MAX(created_at) DESC LIMIT ?`,
        now - RETENTION_MS,
        limit
      ),
      ({ room }) => room
    );
  }

  admit(request: CheckRequest, now: number): CheckAdmissionResult {
    return this.storage.transaction(() => {
      const [gate] = this.storage.query<{ enabled: number }>(
        'SELECT enabled FROM playground_gate WHERE singleton = 1'
      );
      if (!gate?.enabled)
        return { kind: 'refused', reason: 'execution_paused' };
      // Every compile is charged, including a retry of the same request ID;
      // an ID already used by another person or room is refused.
      const [conflict] = this.storage.query<{ id: number }>(
        `SELECT id FROM playground_checks
         WHERE request_id = ? AND (requester != ? OR room != ?) LIMIT 1`,
        request.requestId,
        request.requester,
        request.room
      );
      if (conflict) return { kind: 'refused', reason: 'request_conflict' };
      const [budget] = this.storage.query<{ day: number; count: number }>(
        'SELECT day, count FROM playground_check_budget WHERE singleton = 1'
      );
      const day = Math.floor(now / DAY_MS);
      const latestDay = Math.max(day, budget?.day ?? -1);
      const used = day > (budget?.day ?? -1) ? 0 : (budget?.count ?? 0);
      if (used >= this.capacity.perDay) {
        return {
          kind: 'refused',
          reason: 'check_quota',
          retryAfterMs: (latestDay + 1) * DAY_MS - now,
        };
      }
      for (const [column, value, limit] of [
        ['requester', request.requester, this.capacity.perUserPerWindow],
        ['room', request.room, this.capacity.perRoomPerWindow],
      ] as const) {
        const recent = Array.from(
          this.storage.query<{ created_at: number }>(
            `SELECT created_at FROM playground_checks
             WHERE ${column} = ? AND created_at > ?
             ORDER BY created_at DESC LIMIT ?`,
            value,
            now - WINDOW_MS,
            limit
          )
        );
        if (recent.length >= limit) {
          return {
            kind: 'refused',
            reason: 'check_quota',
            retryAfterMs: (recent.at(-1)?.created_at ?? now) + WINDOW_MS - now,
          };
        }
      }
      this.storage.query(
        `INSERT INTO playground_checks (request_id, requester, room, created_at)
         VALUES (?, ?, ?, ?)`,
        request.requestId,
        request.requester,
        request.room,
        now
      );
      this.storage.query(
        'UPDATE playground_check_budget SET day = ?, count = ? WHERE singleton = 1',
        latestDay,
        used + 1
      );
      this.storage.query(
        `DELETE FROM playground_checks WHERE id IN (
           SELECT id FROM playground_checks WHERE created_at < ?
           ORDER BY created_at LIMIT ?
         )`,
        now - RETENTION_MS,
        PRUNE_LIMIT
      );
      return { kind: 'admitted', admittedAt: now };
    });
  }
}
