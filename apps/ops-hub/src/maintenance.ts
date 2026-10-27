export const DAY = 86_400_000;
export const HOUR = 3_600_000;
export const DELETE_BATCH = 512;
export const CATCHUP_DELAY = 60_000;
type Sql = {
  exec: (
    query: string,
    ...bindings: (number | string)[]
  ) => { rowsWritten: number; toArray: () => Record<string, unknown>[] };
};
const TABLES = [
  'snapshot',
  'events',
  'needs_you',
  'decisions',
  'metrics',
  'metric_dimensions',
  'metric_counts',
  'observability_snapshot',
];
export function eraseContent(sql: Sql) {
  for (const table of TABLES) {
    // 220 batches cover the hard 110,672-row metrics ceiling; other tables are smaller.
    for (let batch = 0; batch < 220; batch++) {
      const result = sql.exec(
        `DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} LIMIT ${DELETE_BATCH}) RETURNING rowid`
      );
      if (result.toArray().length < DELETE_BATCH) break;
    }
  }
}
export function maintainHub(
  sql: Sql,
  enabled: boolean,
  lastPublisherAt: number,
  now: number
) {
  if (!lastPublisherAt) return null;
  if (now - lastPublisherAt >= 30 * DAY) {
    eraseContent(sql);
    return null;
  }
  sql.exec('DELETE FROM events WHERE ts <= ?', now - 30 * DAY);
  sql.exec('DELETE FROM needs_you WHERE completedAt <= ?', now - 30 * DAY);
  sql.exec('DELETE FROM decisions WHERE at <= ?', now - 30 * DAY);
  sql.exec('DELETE FROM observability_snapshot WHERE at <= ?', now - 30 * DAY);
  sql.exec(
    "DELETE FROM metric_dimensions WHERE (series='quota_series' AND lastAt<=?) OR (series!='quota_series' AND lastAt<=?)",
    now - 7 * DAY,
    now - 30 * DAY
  );
  let backlog = false;
  for (const series of [
    'quota_series',
    'speed_series',
    'children_series',
    'ci',
  ]) {
    const cutoff = now - (series === 'quota_series' ? 7 : 30) * DAY;
    let removed = 0;
    for (let batch = 0; batch < 8; batch++) {
      const written = sql
        .exec(
          `DELETE FROM metrics WHERE rowid IN
        (SELECT rowid FROM metrics WHERE series=? AND t<=? LIMIT ${DELETE_BATCH}) RETURNING rowid`,
          series,
          cutoff
        )
        .toArray().length;
      removed += written;
      if (written < DELETE_BATCH) break;
    }
    if (removed > 0)
      sql.exec(
        'UPDATE metric_counts SET cnt=cnt-? WHERE series=?',
        removed,
        series
      );
    if (
      sql
        .exec(
          'SELECT 1 FROM metrics WHERE series=? AND t<=? LIMIT 1',
          series,
          cutoff
        )
        .toArray().length
    )
      backlog = true;
  }
  if (enabled)
    sql.exec(
      'UPDATE flags SET stale=? WHERE id=1',
      now - lastPublisherAt > 15 * 60_000 ? 1 : 0
    );
  return Math.min(
    now + (backlog ? CATCHUP_DELAY : HOUR),
    lastPublisherAt + 30 * DAY
  );
}
