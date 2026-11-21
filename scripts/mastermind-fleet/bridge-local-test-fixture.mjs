// An in-memory stand-in for T3's projection database, with only the columns
// and indexes the bridge's local reads rely on.
import { DatabaseSync } from 'node:sqlite';

export const NOW = Date.UTC(2026, 10, 21, 5, 0, 0);
export const iso = (minutesAgo) =>
  new Date(NOW - minutesAgo * 60_000).toISOString();

/** Where T3 keeps the scratch project that holds threads in no project. */
export const SCRATCH_ROOT = '/home/owner/.t3/scratch';
export const SCRATCH_ID = 'scratch-project';

export function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE orchestration_v2_projection_threads (
      thread_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT,
      updated_at TEXT, archived_at TEXT, deleted_at TEXT);
    CREATE TABLE projection_projects (
      project_id TEXT PRIMARY KEY, title TEXT, workspace_root TEXT);
    CREATE TABLE orchestration_v2_projection_thread_item_counts (
      thread_id TEXT PRIMARY KEY, item_count INTEGER);
    CREATE TABLE orchestration_v2_projection_runs (
      run_id TEXT PRIMARY KEY, thread_id TEXT, ordinal INTEGER, status TEXT);
    CREATE UNIQUE INDEX runs_thread_ordinal
      ON orchestration_v2_projection_runs (thread_id, ordinal);
    CREATE TABLE orchestration_v2_projection_messages (
      message_id TEXT PRIMARY KEY, thread_id TEXT, role TEXT,
      payload_json TEXT, updated_at TEXT);
    CREATE INDEX messages_latest_user
      ON orchestration_v2_projection_messages (thread_id, updated_at DESC)
      WHERE role = 'user';
    CREATE TABLE peer_environment_links (
      environment_id TEXT PRIMARY KEY, label TEXT, linked_at TEXT,
      expires_at TEXT, last_reached_at TEXT, fenced INTEGER);
  `);
  /** `over.project` may be null: a thread in no project, which T3 files under its scratch project. */
  const thread = (id, title, minutesAgo, over = {}) =>
    db
      .prepare(
        'INSERT INTO orchestration_v2_projection_threads VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        id,
        'project' in over ? (over.project ?? SCRATCH_ID) : 'p1',
        title,
        iso(minutesAgo),
        over.archived ?? null,
        over.deleted ?? null
      );
  const run = (id, ordinal, status) =>
    db
      .prepare(
        'INSERT INTO orchestration_v2_projection_runs VALUES (?, ?, ?, ?)'
      )
      .run(`${id}:${ordinal}`, id, ordinal, status);
  let n = 0;
  /** `over`: `id`, `createdBy`, `minutesAgo`, `fields` for more payload fields, or `payload` for raw JSON. */
  const message = (id, role, text, over = {}) =>
    db
      .prepare(
        'INSERT INTO orchestration_v2_projection_messages VALUES (?, ?, ?, ?, ?)'
      )
      .run(
        over.id ?? `m${++n}`,
        id,
        role,
        over.payload ??
          JSON.stringify({
            text,
            ...(over.createdBy ? { createdBy: over.createdBy } : {}),
            ...over.fields,
          }),
        iso(over.minutesAgo ?? 0)
      );
  const project = (id, title, root = `/home/owner/code/${id}`) =>
    db
      .prepare('INSERT INTO projection_projects VALUES (?, ?, ?)')
      .run(id, title, root);
  project('p1', 'Platform');
  project(SCRATCH_ID, 'No project', SCRATCH_ROOT);
  return { db, thread, run, message, project };
}
