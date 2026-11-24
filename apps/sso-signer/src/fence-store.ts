/**
 * `SignerControl` over SQLite: the stop fence. With no record the fence is
 * `stopped`, so a fresh deployment signs nothing until an operator sets it
 * to `running` through `ControlEntry`. `SSO_SIGNER_FENCE_FLOOR` is a
 * break-glass minimum read from config: `stopped` (or any mistyped value)
 * stops signing whatever the record says.
 */
import { firstRow, type SqlRunner } from './sql';

export type FenceMode = 'running' | 'stopped';
export type FenceRecord = Readonly<{
  mode: FenceMode;
  version: number;
  updatedAtMs: number;
}>;

export const MAX_REASON_LENGTH = 200;

export function isFenceMode(value: unknown): value is FenceMode {
  return value === 'running' || value === 'stopped';
}

/** Empty or absent is `running`; anything else but `running` is `stopped`. */
export function parseFenceFloor(raw: unknown): FenceMode {
  if (raw === undefined || raw === null) return 'running';
  if (typeof raw !== 'string') return 'stopped';
  const text = raw.trim();
  return text === '' || text === 'running' ? 'running' : 'stopped';
}

export function createFenceStore(sql: SqlRunner) {
  sql.exec(`CREATE TABLE IF NOT EXISTS fence (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    mode TEXT NOT NULL,
    version INTEGER NOT NULL,
    reason TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`);

  const read = (): FenceRecord => {
    const row = firstRow(
      sql,
      'SELECT mode, version, updated_at FROM fence WHERE id = 1'
    );
    if (!row || !isFenceMode(row.mode)) {
      return {
        mode: 'stopped',
        version: Number(row?.version ?? 0),
        updatedAtMs: 0,
      };
    }
    return {
      mode: row.mode,
      version: Number(row.version),
      updatedAtMs: Number(row.updated_at),
    };
  };

  return Object.freeze({
    read,
    set(mode: FenceMode, reason: string, nowMs: number): FenceRecord {
      const version = read().version + 1;
      sql.exec(
        `INSERT INTO fence (id, mode, version, reason, updated_at)
         VALUES (1, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET mode = excluded.mode,
           version = excluded.version, reason = excluded.reason,
           updated_at = excluded.updated_at`,
        mode,
        version,
        reason,
        nowMs
      );
      return { mode, version, updatedAtMs: nowMs };
    },
  });
}
