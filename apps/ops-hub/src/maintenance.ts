export const DAY = 86_400_000;
export const HOUR = 3_600_000;
type Sql = { exec: (query: string, ...bindings: number[]) => unknown };
export function maintainHub(
  sql: Sql,
  enabled: boolean,
  lastPublisherAt: number,
  now: number
) {
  if (!enabled) return null;
  sql.exec('DELETE FROM events WHERE ts <= ?', now - 30 * DAY);
  sql.exec('DELETE FROM needs_you WHERE completedAt <= ?', now - 30 * DAY);
  sql.exec(
    'UPDATE flags SET stale=? WHERE id=1',
    now - lastPublisherAt > 15 * 60_000 ? 1 : 0
  );
  // Expirable rows are gone after 30 days without ingest; stop idle scheduling.
  return now < lastPublisherAt + 30 * DAY ? now + HOUR : null;
}
