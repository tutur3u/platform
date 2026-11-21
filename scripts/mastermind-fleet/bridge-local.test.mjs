import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { bridgeRpcAnswerSchemas } from '../../packages/utils/src/mastermind-store/bridge-protocol.ts';
import { localReads, threadState } from './bridge-local.mjs';
import { scrubTranscriptText } from './bridge-rpc.mjs';

const NOW = Date.UTC(2026, 10, 21, 5, 0, 0);
const iso = (minutesAgo) => new Date(NOW - minutesAgo * 60_000).toISOString();

/** The columns of T3's projection database these reads rely on. */
function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE orchestration_v2_projection_threads (
      thread_id TEXT PRIMARY KEY, project_id TEXT, title TEXT,
      updated_at TEXT, archived_at TEXT, deleted_at TEXT);
    CREATE TABLE projection_projects (project_id TEXT PRIMARY KEY, title TEXT);
    CREATE TABLE orchestration_v2_projection_thread_item_counts (
      thread_id TEXT PRIMARY KEY, item_count INTEGER);
    CREATE TABLE orchestration_v2_projection_runs (
      run_id TEXT PRIMARY KEY, thread_id TEXT, ordinal INTEGER, status TEXT);
    CREATE TABLE orchestration_v2_projection_messages (
      message_id TEXT PRIMARY KEY, thread_id TEXT, role TEXT,
      payload_json TEXT, updated_at TEXT);
    CREATE TABLE peer_environment_links (
      environment_id TEXT PRIMARY KEY, label TEXT, linked_at TEXT,
      expires_at TEXT, last_reached_at TEXT, fenced INTEGER);
  `);
  const thread = (id, title, minutesAgo, over = {}) =>
    db
      .prepare(
        'INSERT INTO orchestration_v2_projection_threads VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        id,
        over.project ?? 'p1',
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
  const message = (id, role, text) =>
    db
      .prepare(
        'INSERT INTO orchestration_v2_projection_messages VALUES (?, ?, ?, ?, ?)'
      )
      .run(`m${++n}`, id, role, JSON.stringify({ text }), iso(0));
  db.prepare('INSERT INTO projection_projects VALUES (?, ?)').run(
    'p1',
    'Platform'
  );
  return { db, thread, run, message };
}

const reads = (db) =>
  localReads(db, { scrub: scrubTranscriptText, now: () => NOW });

test('lists live threads newest first with state, project and item count', () => {
  const { db, thread, run } = database();
  thread('thread:a', 'Old and idle', 90);
  thread('thread:b', 'Deploy with token=hunter2', 5);
  thread('thread:c', 'Waiting on the owner', 30, { project: 'gone' });
  thread('thread:d', 'Deleted', 1, { deleted: iso(0) });
  thread('thread:e', 'Archived', 1, { archived: iso(0) });
  run('thread:a', 1, 'completed');
  run('thread:b', 1, 'failed');
  run('thread:b', 2, 'running');
  run('thread:c', 1, 'waiting');
  db.prepare(
    'INSERT INTO orchestration_v2_projection_thread_item_counts VALUES (?, ?)'
  ).run('thread:b', 42);
  const page = reads(db).threads({ limit: 2 });
  assert.equal(bridgeRpcAnswerSchemas.threads.safeParse(page).success, true);
  assert.deepEqual(page, {
    threads: [
      {
        threadId: 'thread:b',
        // Titles pass the fleet scrubber.
        title: 'Deploy with',
        projectId: 'p1',
        project: 'Platform',
        // The newest run decides the state.
        state: 'running',
        updatedAt: iso(5),
        itemCount: 42,
      },
      {
        threadId: 'thread:c',
        title: 'Waiting on the owner',
        projectId: 'gone',
        state: 'waiting',
        updatedAt: iso(30),
        itemCount: 0,
      },
    ],
    nextCursor: 2,
    total: 3,
  });
  const rest = reads(db).threads({ cursor: 2, limit: 2 });
  assert.deepEqual(
    [rest.threads.map((t) => [t.threadId, t.state]), rest.nextCursor],
    [[['thread:a', 'idle']], null]
  );
});

test('searches titles literally and case-insensitively', () => {
  const { db, thread } = database();
  thread('thread:a', 'Fix the 100% CPU bug', 3);
  thread('thread:b', 'fix flaky_test in CI', 2);
  thread('thread:c', 'Unrelated', 1);
  const titles = (query) =>
    reads(db)
      .threads({ query })
      .threads.map((t) => t.threadId);
  assert.deepEqual(titles('FIX'), ['thread:b', 'thread:a']);
  // `%` and `_` match themselves, not anything.
  assert.deepEqual(titles('100%'), ['thread:a']);
  assert.deepEqual(titles('flaky_test'), ['thread:b']);
  assert.deepEqual(titles('%'), ['thread:a']);
  assert.deepEqual(titles('_'), ['thread:b']);
  assert.deepEqual(titles("'; DROP TABLE x; --"), []);
  assert.equal(reads(db).threads({ query: 'fix' }).total, 2);
});

test('pages a thread back from its newest messages, redacted, user and assistant only', () => {
  const { db, thread, message } = database();
  thread('thread:a', 'History', 1);
  thread('thread:other', 'Other', 1);
  for (let i = 1; i <= 7; i++)
    message('thread:a', i % 2 ? 'user' : 'assistant', `message ${i}`);
  message('thread:other', 'user', 'not this thread');
  message('thread:a', 'system', 'internal note');
  message(
    'thread:a',
    'assistant',
    `key ${['sk', 'live', 'abcdef0123456789abcdef'].join('-')} in ./x.ts`
  );
  message('thread:a', 'assistant', '   ');
  db.prepare(
    'INSERT INTO orchestration_v2_projection_messages VALUES (?, ?, ?, ?, ?)'
  ).run('broken', 'thread:a', 'assistant', '{not json', iso(0));

  const newest = reads(db).transcript({ threadId: 'thread:a', limit: 3 });
  assert.equal(
    bridgeRpcAnswerSchemas.transcript.safeParse(newest).success,
    true
  );
  assert.deepEqual(
    newest.messages.map((m) => [m.role, m.text]),
    [['assistant', 'key [redacted] in ./x.ts']]
  );
  assert.equal(newest.thread.threadId, 'thread:a');
  // The empty and unreadable rows are left out; paging back still continues.
  const older = reads(db).transcript({
    threadId: 'thread:a',
    limit: 3,
    before: newest.earlierPosition,
  });
  assert.deepEqual(
    older.messages.map((m) => m.text),
    ['message 5', 'message 6', 'message 7']
  );
  const oldest = reads(db).transcript({
    threadId: 'thread:a',
    limit: 10,
    before: older.earlierPosition,
  });
  assert.deepEqual(
    oldest.messages.map((m) => m.text),
    ['message 1', 'message 2', 'message 3', 'message 4']
  );
  assert.equal(oldest.earlierPosition, null);
  // Nothing from another thread, and nothing but user and assistant.
  for (const page of [newest, older, oldest])
    for (const m of page.messages)
      assert.ok(!/not this thread|internal note/.test(m.text));
});

test('has no history for a thread that is deleted, archived or unknown', () => {
  const { db, thread, message } = database();
  thread('thread:d', 'Deleted', 1, { deleted: iso(0) });
  thread('thread:e', 'Archived', 1, { archived: iso(0) });
  message('thread:d', 'user', 'gone');
  for (const threadId of ['thread:d', 'thread:e', 'thread:nope'])
    assert.equal(reads(db).transcript({ threadId }), null);
});

test('lists linked machines whose link has not expired', () => {
  const { db } = database();
  const link = (id, label, over = {}) =>
    db
      .prepare('INSERT INTO peer_environment_links VALUES (?, ?, ?, ?, ?, ?)')
      .run(
        id,
        label,
        iso(1000),
        over.expires ?? iso(-1000),
        iso(600),
        over.fenced ?? 1
      );
  // T3 writes `fenced = 1` for an ordinary link; it does not mean revoked.
  link('env-1', 'MacStudio1');
  link('env-2', 'Unfenced', { fenced: 0 });
  link('env-4', 'Expired', { expires: iso(5) });
  link('../bad', 'x');
  const answer = reads(db).machines();
  assert.equal(bridgeRpcAnswerSchemas.machines.safeParse(answer).success, true);
  assert.deepEqual(answer.machines, [
    { label: 'This machine', reachable: true },
    { environmentId: 'env-1', label: 'MacStudio1', reachable: true },
    { environmentId: 'env-2', label: 'Unfenced', reachable: true },
    { environmentId: 'env-4', label: 'Expired', reachable: false },
  ]);
});

test('maps T3 run states to the four the owner sees', () => {
  assert.deepEqual(
    [
      'preparing',
      'queued',
      'starting',
      'running',
      'waiting',
      'failed',
      'completed',
      'interrupted',
      'cancelled',
      'rolled_back',
      'idle',
      null,
      'made-up',
    ].map(threadState),
    [
      'running',
      'running',
      'running',
      'running',
      'waiting',
      'failed',
      'idle',
      'idle',
      'idle',
      'idle',
      'idle',
      'idle',
      'idle',
    ]
  );
});
