import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import {
  bridgeRpcAnswerSchemas,
  bridgeRpcArgsSchemas,
  bridgeRpcRequestSchema,
} from '../../packages/utils/src/mastermind-store/bridge-protocol.ts';
import { createLedger } from './bridge-core.mjs';
import { database, iso, SCRATCH_ROOT } from './bridge-local-test-fixture.mjs';
import { handleRequest } from './bridge-rpc.mjs';
import {
  ask,
  deps,
  localAsk,
  openAnswer,
  requestFrame,
} from './bridge-rpc-test-fixture.mjs';
import { tempDir, uuid } from './bridge-test-fixture.mjs';
import path from 'node:path';

test('answers the projects of this machine from its own database', async () => {
  const { db, thread, run } = database();
  thread('thread:a', 'Platform running', 10);
  thread('thread:b', 'In no project', 20, { project: null });
  run('thread:a', 1, 'running');
  const frame = requestFrame('projects', {});
  assert.equal(bridgeRpcRequestSchema.safeParse(frame.request).success, true);
  const local = localAsk(db, { scratchRoot: SCRATCH_ROOT });
  const { answer, calls } = await local('projects', {});
  assert.equal(
    bridgeRpcAnswerSchemas.projects.safeParse(answer.data).success,
    true
  );
  assert.deepEqual(answer, {
    ok: true,
    data: {
      projects: [
        {
          projectId: 'p1',
          project: 'Platform',
          threadCount: 1,
          counts: { running: 1, waiting: 0, failed: 0, idle: 0 },
          latestUpdatedAt: iso(10),
        },
      ],
      unassigned: {
        threadCount: 1,
        counts: { running: 0, waiting: 0, failed: 0, idle: 1 },
      },
      total: 1,
    },
  });
  // Read, closed, and T3 never asked.
  assert.equal(local.state.closed, 1);
  assert.equal(calls.length, 0);
});

test('groups projects for this machine only, and only from a database it can read', async () => {
  // A linked machine: refused before any read.
  const linked = await ask('projects', { environmentId: 'env-1' }, {});
  assert.deepEqual(linked.answer, { ok: false, code: 'bad_request' });
  assert.equal(linked.calls.length, 0);
  // No database to open: T3's tools cannot stand in for it.
  const without = await ask('projects', {}, { t3_project_list: () => ({}) });
  assert.deepEqual(without.answer, { ok: false, code: 'unavailable' });
  assert.equal(without.calls.length, 0);
  // A T3 release without the columns the grouping relies on.
  const renamed = new DatabaseSync(':memory:');
  renamed.exec(`
    CREATE TABLE orchestration_v2_projection_threads (
      id TEXT PRIMARY KEY, name TEXT, updated_at TEXT);
    CREATE TABLE projection_projects (project_id TEXT PRIMARY KEY, title TEXT);
    CREATE TABLE orchestration_v2_projection_runs (
      run_id TEXT PRIMARY KEY, thread_id TEXT, ordinal INTEGER, status TEXT);
  `);
  const local = localAsk(renamed);
  assert.deepEqual((await local('projects', {})).answer, {
    ok: false,
    code: 'unavailable',
  });
  assert.equal(local.state.closed, 1);
});

test('passes the project, state and owner-reply arguments to the local read', async () => {
  const { db, thread, run, message } = database();
  thread('thread:a', 'Platform running', 10);
  thread('thread:b', 'Platform idle', 20);
  thread('thread:c', 'Loose running', 30, { project: null });
  run('thread:a', 1, 'running');
  run('thread:c', 1, 'running');
  message('thread:a', 'user', 'go on', { createdBy: 'user', minutesAgo: 15 });
  const local = localAsk(db, {
    scratchRoot: SCRATCH_ROOT,
    bridgeReplyAt: (threadId) => (threadId === 'thread:b' ? iso(3) : undefined),
  });
  const ids = async (args) => {
    const { answer } = await local('threads', args);
    assert.equal(
      bridgeRpcAnswerSchemas.threads.safeParse(answer.data).success,
      true
    );
    return answer.data.threads.map((t) => t.threadId);
  };
  assert.deepEqual(await ids({ projectId: 'p1', state: 'running' }), [
    'thread:a',
  ]);
  assert.deepEqual(await ids({ projectId: 'none' }), ['thread:c']);
  assert.deepEqual(await ids({ state: 'idle' }), ['thread:b']);
  const { answer } = await local('threads', { ownerReply: true });
  assert.deepEqual(
    answer.data.threads.map((t) => t.lastOwnerReplyAt),
    // Typed in T3, then one the bridge's own ledger knows of.
    [iso(15), iso(3), undefined]
  );
  assert.equal(
    (await local('threads', {})).answer.data.threads.some(
      (t) => 'lastOwnerReplyAt' in t
    ),
    false
  );
});

test('filters a linked machine through T3: one project, and statuses for a state', async () => {
  const tools = {
    t3_thread_list: () => ({ threads: [], nextCursor: null, total: 0 }),
  };
  const sent = async (args) => {
    const { answer, calls } = await ask(
      'threads',
      { environmentId: 'env-1', ...args },
      tools
    );
    assert.equal(answer.ok, true);
    return calls.find((call) => call.name === 't3_thread_list').args;
  };
  assert.deepEqual(await sent({ projectId: 'p1', limit: 5 }), {
    environmentId: 'env-1',
    projectId: 'p1',
    limit: 5,
  });
  const statuses = async (state) => (await sent({ state })).statuses;
  assert.deepEqual(await statuses('running'), [
    'preparing',
    'queued',
    'starting',
    'running',
  ]);
  assert.deepEqual(await statuses('waiting'), ['waiting']);
  assert.deepEqual(await statuses('failed'), ['failed']);
  assert.deepEqual(await statuses('idle'), [
    'idle',
    'completed',
    'interrupted',
    'cancelled',
    'rolled_back',
  ]);
  // Without a filter every project is listed.
  assert.deepEqual(await sent({ ownerReply: true }), {
    environmentId: 'env-1',
    allProjects: true,
    limit: 50,
  });
  // T3 cannot list "in no project": refused, not silently unfiltered.
  const none = await ask(
    'threads',
    { environmentId: 'env-1', projectId: 'none' },
    tools
  );
  assert.deepEqual(none.answer, { ok: false, code: 'bad_request' });
  assert.equal(none.calls.length, 0);
});

test('checks the new arguments by type and range, the way the Web schema does', async () => {
  const bad = [
    { projectId: ['p1'] },
    { projectId: '' },
    { projectId: 'has space' },
    { projectId: 'x'.repeat(401) },
    { state: 'done' },
    { state: ['running'] },
    { ownerReply: 'yes' },
    { ownerReply: 1 },
  ];
  for (const args of bad) {
    assert.equal(bridgeRpcArgsSchemas.threads.safeParse(args).success, false);
    const { answer, calls } = await ask('threads', args, {
      t3_thread_list: () => ({ threads: [] }),
    });
    assert.deepEqual(answer, { ok: false, code: 'bad_request' });
    assert.equal(calls.length, 0);
  }
  for (const args of [
    { projectId: 'none' },
    { projectId: 'project:mobile.app%3A1', state: 'failed' },
    { ownerReply: false },
  ])
    assert.equal(bridgeRpcArgsSchemas.threads.safeParse(args).success, true);
  // An unsigned frame of the new kind is ignored like any other.
  const frame = requestFrame('projects', {});
  assert.equal(
    await handleRequest({ ...frame, sig: '0'.repeat(64) }, deps({})),
    null
  );
  assert.equal(
    openAnswer(await handleRequest(frame, deps({})), frame.request).ok,
    false
  );
});

test('takes bridge reply times from delivered replies to this machine only', () => {
  const ledger = createLedger(path.join(tempDir(), 'replies.jsonl'));
  const row = (n, over) => ({
    id: uuid(n),
    threadId: 'thread:a',
    state: 'delivered',
    at: iso(60 - n),
    ...over,
  });
  ledger.record(row(1));
  ledger.record(row(2));
  // None of these is a delivery into this machine's thread:a.
  ledger.record(row(3, { state: 'failed' }));
  ledger.record(row(4, { environmentId: 'env-1' }));
  ledger.record(row(5, { threadId: 'thread:b' }));
  assert.equal(ledger.lastDelivered('thread:a'), iso(58));
  assert.equal(ledger.lastDelivered('thread:b'), iso(55));
  assert.equal(ledger.lastDelivered('thread:c'), undefined);
});

test('answers unavailable when the index the grouping needs is missing', async () => {
  const { db, thread } = database();
  thread('thread:a', 'One', 1);
  db.exec('DROP INDEX runs_thread_ordinal');
  const local = localAsk(db, { scratchRoot: SCRATCH_ROOT });
  for (const [kind, args] of [
    ['projects', {}],
    ['threads', { state: 'idle' }],
  ])
    assert.deepEqual((await local(kind, args)).answer, {
      ok: false,
      code: 'unavailable',
    });
  // The plain list does not need it.
  assert.equal((await local('threads', {})).answer.ok, true);
  assert.equal(local.state.closed, 3);
});
