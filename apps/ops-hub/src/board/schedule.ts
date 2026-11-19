import { BoardError, type Store } from './store';

export async function schedule(store: Store) {
  const control = store.control();
  if (control.stopped) return;
  const now = Date.now();
  const window = now - (now % 3_600_000);
  const budgetDelayed =
    control.window_start === window && control.queue_sends >= 60;
  const due = store.one<{ due: number | null }>(
    `SELECT MIN(due) AS due FROM (
      SELECT MIN(expires_at) AS due FROM leases UNION ALL SELECT MIN(expires_at) FROM grants
      UNION ALL SELECT MIN(expires_at) FROM delegations UNION ALL SELECT MIN(expires_at) FROM idempotency
      UNION ALL SELECT MIN(MAX(next_at,?)) FROM followups WHERE state='pending' AND generation=?
      UNION ALL SELECT MIN(attempt_deadline) FROM followups WHERE state IN ('queued','delivering')
      UNION ALL SELECT ? FROM followups WHERE state IN ('pending','queued') AND generation<>? LIMIT -1
    )`,
    budgetDelayed ? window + 3_600_000 : 0,
    control.generation,
    now,
    control.generation
  )?.due;
  const nextWatcher = store.one<{ due: number | null }>(
    'SELECT MIN(CASE WHEN generation=? THEN retry_at ELSE 0 END) AS due FROM watcher_events',
    control.generation
  )?.due;
  const watcherDue =
    nextWatcher == null
      ? null
      : Math.max(
          nextWatcher,
          control.window_start === window && control.tasks_reads >= 120
            ? window + 3_600_000
            : now
        );
  if (due == null && watcherDue == null) return;
  const lastSlot = control.window_start === window && control.alarm_sets >= 119;
  const at = Math.max(
    now + 1000,
    Math.min(due ?? Infinity, watcherDue ?? Infinity),
    lastSlot ? window + 3_600_000 : 0
  );
  if (
    control.alarm_at !== null &&
    control.alarm_at <= at &&
    control.alarm_at > now
  )
    return;
  try {
    store.reserve('alarm_sets', control.generation, lastSlot ? 120 : 119);
  } catch (error) {
    if (error instanceof BoardError && [429, 503].includes(error.status))
      return;
    throw error;
  }
  store.run('UPDATE control SET alarm_at=? WHERE id=1', at);
  try {
    await store.storage.setAlarm(at);
  } catch (error) {
    store.run('UPDATE control SET alarm_at=NULL WHERE id=1 AND alarm_at=?', at);
    throw error;
  }
}
