import type { Decision } from './contract-v2';
import { DAY } from './maintenance';

export const DECISION_CAP = 1000;
export function initializeDecisions(sql: SqlStorage) {
  sql.exec(
    'CREATE TABLE IF NOT EXISTS decisions(id TEXT PRIMARY KEY,at INTEGER NOT NULL,category TEXT,data TEXT NOT NULL)'
  );
  sql.exec('CREATE INDEX IF NOT EXISTS decisions_at ON decisions(at,id)');
}
export function validateDecisions(
  sql: SqlStorage,
  rows: Decision[],
  now: number
) {
  if (new Set(rows.map((row) => row.id)).size !== rows.length) return false;
  for (const row of rows) {
    if (row.at <= now - 30 * DAY || row.at > now + 120_000) return false;
    const previous = sql
      .exec<{ data: string }>('SELECT data FROM decisions WHERE id=?', row.id)
      .toArray()[0];
    if (previous && previous.data !== JSON.stringify(row)) return false;
  }
  return true;
}
export function storeDecisions(sql: SqlStorage, rows: Decision[]) {
  if (rows.length === 0) return;
  for (const row of rows)
    sql.exec(
      'INSERT OR IGNORE INTO decisions(id,at,category,data) VALUES(?,?,?,?)',
      row.id,
      row.at,
      'category' in row ? row.category : null,
      JSON.stringify(row)
    );
  sql.exec(
    'DELETE FROM decisions WHERE id IN (SELECT id FROM decisions ORDER BY at DESC,id DESC LIMIT -1 OFFSET ?)',
    DECISION_CAP
  );
}
export function readDecisions(
  sql: SqlStorage,
  after: string,
  category: string | null,
  now: number
) {
  const [timestamp, id = ''] = after.split(':');
  const at = Number(timestamp);
  const rows = sql
    .exec<{ data: string }>(
      'SELECT data FROM decisions WHERE (at > ? OR (at=? AND id>?)) AND at > ? AND (? IS NULL OR category=?) ORDER BY at,id LIMIT 200',
      at,
      at,
      id,
      now - 30 * DAY,
      category,
      category
    )
    .toArray();
  const decisions = rows.map((row) => JSON.parse(row.data));
  const last: Decision | undefined = decisions.at(-1);
  return { decisions, nextAfter: last ? `${last.at}:${last.id}` : null };
}
