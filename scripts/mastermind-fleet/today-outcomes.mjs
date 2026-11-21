const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;
const MAX_FAILED_RUNS = 500;
const REAL_FAILURES = new Set([
  'provider_error',
  'transport_error',
  'permission_error',
  'validation_error',
]);

export function startOfTodayIct(now) {
  const wall = new Date(now.getTime() + ICT_OFFSET_MS);
  wall.setUTCHours(0, 0, 0, 0);
  return new Date(wall.getTime() - ICT_OFFSET_MS).toISOString();
}

/** Counts finished runs, with direct T3 recovery linkage and no error prose. */
export function readTodayOutcomes(db, now) {
  const dayStart = startOfTodayIct(now);
  const observedAt = now.toISOString();
  const rows = db
    .prepare(`
    WITH failed AS (
      SELECT run_id, thread_id, ordinal
      FROM orchestration_v2_projection_runs
      WHERE status = 'failed' AND completed_at >= ? AND completed_at <= ?
      ORDER BY completed_at DESC, run_id
      LIMIT ?
    )
    SELECT
      (SELECT json_extract(item.payload_json, '$.failure.class')
       FROM orchestration_v2_projection_turn_items item
       WHERE item.run_id = failed.run_id
         AND item.thread_id = failed.thread_id AND item.type = 'error'
         AND item.status = 'failed'
       ORDER BY item.ordinal DESC
       LIMIT 1) AS failure_class,
      EXISTS (
        SELECT 1
        FROM orchestration_v2_projection_runs recovery
        WHERE recovery.thread_id = failed.thread_id
          AND recovery.ordinal > failed.ordinal
          AND recovery.status = 'completed' AND recovery.completed_at <= ?
          AND json_extract(recovery.payload_json, '$.usageLimitContinuationOfRunId') = failed.run_id
          AND json_extract(recovery.payload_json, '$.manualContinuationOfRunId') IS NULL
      ) AS auto_recovered
    FROM failed
  `)
    .all(dayStart, observedAt, MAX_FAILED_RUNS + 1, observedAt);
  const totals = {
    real: 0,
    quotaRecovered: 0,
    quotaUnrecovered: 0,
    unclassified: 0,
  };
  for (const row of rows.slice(0, MAX_FAILED_RUNS)) {
    if (row.failure_class === 'usage_limit') {
      totals[row.auto_recovered ? 'quotaRecovered' : 'quotaUnrecovered']++;
    } else if (REAL_FAILURES.has(row.failure_class)) {
      totals.real++;
    } else {
      totals.unclassified++;
    }
  }
  return {
    kind: rows.length > MAX_FAILED_RUNS ? 'partial' : 'complete',
    observedAt,
    dayStart,
    ...totals,
  };
}
