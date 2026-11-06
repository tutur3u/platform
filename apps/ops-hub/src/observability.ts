import type { Observability, Series } from './contract-v2';
import { DAY } from './maintenance';

export const POINT_CAP = 500;
export const QUOTA_CAP = 80_672;
export const OTHER_SERIES_CAP = 10_000;
const BUCKET = 120_000;
export function initializeObservability(sql: SqlStorage) {
  sql.exec(`CREATE TABLE IF NOT EXISTS metrics (
    series TEXT NOT NULL, dimension TEXT NOT NULL, t INTEGER NOT NULL, data TEXT NOT NULL,
    PRIMARY KEY(series,dimension,t));
    CREATE INDEX IF NOT EXISTS metrics_time ON metrics(series,t);
    CREATE TABLE IF NOT EXISTS metric_counts(series TEXT PRIMARY KEY,cnt INTEGER NOT NULL CHECK(cnt>=0));
    CREATE TABLE IF NOT EXISTS metric_dimensions(series TEXT NOT NULL,dimension TEXT NOT NULL,lastAt INTEGER NOT NULL,PRIMARY KEY(series,dimension));
    CREATE TABLE IF NOT EXISTS observability_snapshot(id INTEGER PRIMARY KEY CHECK(id=1),at INTEGER NOT NULL,data TEXT NOT NULL);`);
}
function points(observation: Observability) {
  return [
    ...observation.quota_series.map((row) => ({
      series: 'quota_series',
      dimension: row.instance,
      t: Math.floor(row.t / BUCKET) * BUCKET,
      data: row,
    })),
    ...observation.speed_series.map((row) => ({
      series: 'speed_series',
      dimension: row.model,
      t: row.t,
      data: row,
    })),
    ...observation.children_series.map((row) => ({
      series: 'children_series',
      dimension: JSON.stringify([row.provider, row.model]),
      t: row.t,
      data: row,
    })),
    ...observation.ci.map((row) => ({
      series: 'ci',
      dimension: row.repo,
      t: row.t,
      data: row,
    })),
  ];
}
export function validateObservability(
  sql: SqlStorage,
  observation: Observability,
  now: number
) {
  const rows = points(observation);
  for (const series of [
    'quota_series',
    'speed_series',
    'children_series',
    'ci',
  ]) {
    const dimensions = new Set(
      sql
        .exec<{ dimension: string }>(
          'SELECT dimension FROM metric_dimensions WHERE series=? AND lastAt>? LIMIT 17',
          series,
          now - (series === 'quota_series' ? 7 : 30) * DAY
        )
        .toArray()
        .map((row) => row.dimension)
    );
    for (const row of rows.filter((point) => point.series === series)) {
      if (
        row.t <= now - (series === 'quota_series' ? 7 : 30) * DAY ||
        row.t > now + 120_000
      )
        return false;
      dimensions.add(row.dimension);
    }
    if (dimensions.size > 16) return false;
  }
  return (
    observation.staff.every((row) => row.last_active <= now + 120_000) &&
    observation.cadence.every(
      (row) => row.last_prod_at === null || row.last_prod_at <= now + 120_000
    )
  );
}
export function storeObservability(
  sql: SqlStorage,
  observation: Observability,
  now: number
) {
  sql.exec(
    "DELETE FROM metric_dimensions WHERE (series='quota_series' AND lastAt<=?) OR (series!='quota_series' AND lastAt<=?)",
    now - 7 * DAY,
    now - 30 * DAY
  );
  const inserted = new Map<string, number>();
  for (const row of points(observation)) {
    sql.exec(
      `INSERT INTO metric_dimensions(series,dimension,lastAt) VALUES(?,?,?)
      ON CONFLICT(series,dimension) DO UPDATE SET lastAt=MAX(lastAt,excluded.lastAt)`,
      row.series,
      row.dimension,
      row.t
    );
    const written = sql
      .exec(
        'INSERT OR IGNORE INTO metrics(series,dimension,t,data) VALUES(?,?,?,?) RETURNING t',
        row.series,
        row.dimension,
        row.t,
        JSON.stringify({ ...row.data, t: row.t })
      )
      .toArray().length;
    inserted.set(row.series, (inserted.get(row.series) ?? 0) + written);
    if (written === 0)
      sql.exec(
        'UPDATE metrics SET data=? WHERE series=? AND dimension=? AND t=?',
        JSON.stringify({ ...row.data, t: row.t }),
        row.series,
        row.dimension,
        row.t
      );
  }
  for (const [series, added] of inserted) {
    const previous =
      sql
        .exec<{ cnt: number }>(
          'SELECT cnt FROM metric_counts WHERE series=?',
          series
        )
        .toArray()[0]?.cnt ?? 0;
    const count = previous + added;
    const limit = series === 'quota_series' ? QUOTA_CAP : OTHER_SERIES_CAP;
    const overflow = Math.max(0, count - limit);
    if (overflow > 0)
      sql.exec(
        `DELETE FROM metrics WHERE rowid IN
      (SELECT rowid FROM metrics WHERE series=? ORDER BY t,dimension LIMIT ?)`,
        series,
        overflow
      );
    sql.exec(
      'INSERT INTO metric_counts(series,cnt) VALUES(?,?) ON CONFLICT(series) DO UPDATE SET cnt=excluded.cnt',
      series,
      count - overflow
    );
  }
  sql.exec(
    'INSERT OR REPLACE INTO observability_snapshot(id,at,data) VALUES(1,?,?)',
    now,
    JSON.stringify({ staff: observation.staff, cadence: observation.cadence })
  );
}
export function readObservability(
  sql: SqlStorage,
  since: number,
  series: Series,
  now: number
) {
  if (series === 'staff' || series === 'cadence') {
    const row = sql
      .exec<{ data: string }>(
        'SELECT data FROM observability_snapshot WHERE id=1 AND at>?',
        now - 30 * DAY
      )
      .toArray()[0];
    if (!row) return { series, points: [], pointCap: POINT_CAP };
    const parsed: Pick<Observability, 'staff' | 'cadence'> = JSON.parse(
      row.data
    );
    return { series, points: parsed[series], pointCap: POINT_CAP };
  }
  const cutoff = Math.max(
    since,
    now - (series === 'quota_series' ? 7 : 30) * DAY
  );
  if (cutoff >= now)
    return { series, points: [], pointCap: POINT_CAP, bucketMs: BUCKET };
  const dimensions = sql
    .exec<{ dimension: string }>(
      'SELECT dimension FROM metric_dimensions WHERE series=? AND lastAt>? ORDER BY dimension LIMIT 16',
      series,
      cutoff
    )
    .toArray();
  const perDimension = Math.max(
    1,
    Math.floor(POINT_CAP / Math.max(1, dimensions.length))
  );
  const interval = Math.max(
    BUCKET,
    Math.ceil((now - cutoff) / perDimension / BUCKET) * BUCKET
  );
  const sampled: { t: number; dimension: string; data: string }[] = [];
  for (const { dimension } of dimensions) {
    // Each bucket uses the primary-key range index and reads its latest point.
    sampled.push(
      ...sql
        .exec<{ t: number; dimension: string; data: string }>(
          `
      WITH RECURSIVE buckets(lo) AS (
        SELECT ? UNION ALL SELECT lo+? FROM buckets WHERE lo+? < ?
      )
      SELECT t,dimension,data FROM metrics
      WHERE series=? AND dimension=? AND t>? AND t IN (
        SELECT (SELECT MAX(point.t) FROM metrics AS point WHERE point.series=? AND point.dimension=?
          AND point.t>=buckets.lo AND point.t<MIN(buckets.lo+?,?)) FROM buckets
      ) ORDER BY t DESC LIMIT ?`,
          cutoff,
          interval,
          interval,
          now,
          series,
          dimension,
          cutoff,
          series,
          dimension,
          interval,
          now + 1,
          perDimension
        )
        .toArray()
    );
  }
  sampled.sort((a, b) => a.t - b.t || a.dimension.localeCompare(b.dimension));
  return {
    series,
    points: sampled.slice(0, POINT_CAP).map((row) => JSON.parse(row.data)),
    pointCap: POINT_CAP,
    bucketMs: interval,
  };
}
