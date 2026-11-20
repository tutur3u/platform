// Synthetic T3 state database for the fleet publisher tests.
import { DatabaseSync } from 'node:sqlite';

export function fixtureDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE orchestration_v2_projection_threads (
      thread_id TEXT PRIMARY KEY, project_id TEXT, title TEXT, updated_at TEXT,
      archived_at TEXT, deleted_at TEXT, payload_json TEXT);
    CREATE TABLE orchestration_v2_projection_runs (
      run_id TEXT PRIMARY KEY, thread_id TEXT, ordinal INTEGER, provider TEXT,
      status TEXT, requested_at TEXT, completed_at TEXT, payload_json TEXT);
    CREATE TABLE projection_projects (project_id TEXT PRIMARY KEY, title TEXT);
    CREATE TABLE peer_environment_links (
      environment_id TEXT PRIMARY KEY, label TEXT, last_reached_at TEXT,
      secret_name TEXT);
    CREATE TABLE orchestration_v2_projection_messages (thread_id TEXT, text TEXT);
  `);
  db.prepare('INSERT INTO projection_projects VALUES (?, ?)').run(
    'p1',
    'tuturuuu'
  );
  const thread = db.prepare(
    'INSERT INTO orchestration_v2_projection_threads VALUES (?, ?, ?, ?, ?, NULL, ?)'
  );
  const payload = (model, parent) =>
    JSON.stringify({
      modelSelection: { model },
      ...(parent ? { lineage: { parentThreadId: parent } } : {}),
    });
  thread.run(
    't-iris',
    'p1',
    '[Iris] Orchestrator',
    '2026-11-20T02:59:00.000Z',
    null,
    payload('claude-opus')
  );
  thread.run(
    't-run',
    'p1',
    'Mobile sync see https://x.example/a',
    '2026-11-20T02:58:00.000Z',
    null,
    payload('gpt-6', 't-iris')
  );
  thread.run(
    't-fail',
    'p1',
    'CI fix',
    '2026-11-20T01:00:00.000Z',
    null,
    payload('gpt-6')
  );
  thread.run(
    't-old',
    'p1',
    'Old lane',
    '2026-11-10T01:00:00.000Z',
    null,
    payload('gpt-6')
  );
  thread.run(
    't-arch',
    'p1',
    'Archived',
    '2026-11-20T02:00:00.000Z',
    '2026-11-20T02:30:00.000Z',
    payload('gpt-6')
  );
  const run = db.prepare(
    'INSERT INTO orchestration_v2_projection_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  run.run(
    'r1',
    't-iris',
    1,
    'claude',
    'completed',
    '2026-11-20T02:50:00.000Z',
    '2026-11-20T02:59:00.000Z',
    '{}'
  );
  run.run(
    'r2',
    't-iris',
    2,
    'claude',
    'running',
    '2026-11-20T02:59:30.000Z',
    null,
    '{}'
  );
  run.run(
    'r3',
    't-run',
    1,
    'codex',
    'running',
    '2026-11-20T02:40:00.000Z',
    null,
    '{}'
  );
  run.run(
    'r4',
    't-run',
    2,
    'codex',
    'queued',
    '2026-11-20T02:41:00.000Z',
    null,
    '{}'
  );
  run.run(
    'r5',
    't-fail',
    1,
    'codex',
    'failed',
    '2026-11-20T00:30:00.000Z',
    '2026-11-20T01:00:00.000Z',
    '{}'
  );
  run.run(
    'r6',
    't-old',
    1,
    'codex',
    'completed',
    '2026-11-10T00:30:00.000Z',
    '2026-11-10T01:00:00.000Z',
    '{}'
  );
  run.run(
    'r7',
    't-arch',
    1,
    'codex',
    'running',
    '2026-11-20T02:00:00.000Z',
    null,
    '{}'
  );
  db.prepare('INSERT INTO peer_environment_links VALUES (?, ?, ?, ?)').run(
    'env-1',
    'MacStudio1',
    '2026-11-20T02:55:00.000Z',
    'kept-out'
  );
  db.prepare('INSERT INTO peer_environment_links VALUES (?, ?, ?, ?)').run(
    'env-2',
    'Old laptop',
    '2026-11-18T02:55:00.000Z',
    'kept-out'
  );
  db.prepare(
    'INSERT INTO orchestration_v2_projection_messages VALUES (?, ?)'
  ).run('t-run', 'PRIVATE CHAT BODY');
  return db;
}
