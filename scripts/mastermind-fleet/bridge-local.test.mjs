import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bridgeRpcAnswerSchemas } from '../../packages/utils/src/mastermind-store/bridge-protocol.ts';
import { localReads, threadState } from './bridge-local.mjs';
import {
  database,
  iso,
  NOW,
  SCRATCH_ID,
  SCRATCH_ROOT,
} from './bridge-local-test-fixture.mjs';
import { scrubTranscriptText } from './bridge-rpc.mjs';

const reads = (db, over = {}) =>
  localReads(db, {
    scrub: scrubTranscriptText,
    now: () => NOW,
    scratchRoot: SCRATCH_ROOT,
    ...over,
  });

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

test('groups live threads by project with a count per state, the project touched last first', () => {
  const { db, thread, run, project } = database();
  project('p2', 'Mobile with token=hunter2');
  thread('thread:a', 'Idle', 90);
  thread('thread:b', 'Running', 40);
  thread('thread:c', 'Failed', 50);
  thread('thread:d', 'Mobile waiting', 5, { project: 'p2' });
  thread('thread:e', 'Project row is gone', 60, { project: 'gone' });
  thread('thread:f', 'In no project', 70, { project: null });
  thread('thread:g', 'In no project, running', 80, { project: null });
  thread('thread:h', 'Deleted', 1, { deleted: iso(0) });
  thread('thread:i', 'Archived', 1, { archived: iso(0) });
  run('thread:b', 1, 'queued');
  run('thread:c', 1, 'failed');
  run('thread:d', 1, 'waiting');
  run('thread:g', 1, 'starting');
  const grouped = reads(db).projects();
  assert.equal(
    bridgeRpcAnswerSchemas.projects.safeParse(grouped).success,
    true
  );
  assert.deepEqual(grouped, {
    projects: [
      {
        projectId: 'p2',
        // Project names pass the fleet scrubber, like thread titles.
        project: 'Mobile with',
        threadCount: 1,
        counts: { running: 0, waiting: 1, failed: 0, idle: 0 },
        latestUpdatedAt: iso(5),
      },
      {
        projectId: 'p1',
        project: 'Platform',
        threadCount: 3,
        counts: { running: 1, waiting: 0, failed: 1, idle: 1 },
        latestUpdatedAt: iso(40),
      },
      {
        projectId: 'gone',
        project: 'Untitled',
        threadCount: 1,
        counts: { running: 0, waiting: 0, failed: 0, idle: 1 },
        latestUpdatedAt: iso(60),
      },
    ],
    unassigned: {
      threadCount: 2,
      counts: { running: 1, waiting: 0, failed: 0, idle: 1 },
    },
    total: 3,
  });
  // A machine with no threads at all still answers in shape.
  assert.deepEqual(reads(database().db).projects(), {
    projects: [],
    unassigned: {
      threadCount: 0,
      counts: { running: 0, waiting: 0, failed: 0, idle: 0 },
    },
    total: 0,
  });
});

test('returns the 200 projects touched last and says how many there are', () => {
  const { db, thread } = database();
  for (let n = 0; n < 205; n++)
    thread(`thread:${n}`, 'One of many', n, { project: `p${n}` });
  const grouped = reads(db).projects();
  assert.equal(grouped.projects.length, 200);
  assert.equal(grouped.total, 205);
  assert.deepEqual(
    [grouped.projects[0].projectId, grouped.projects[199].projectId],
    ['p0', 'p199']
  );
  assert.equal(
    bridgeRpcAnswerSchemas.projects.safeParse(grouped).success,
    true
  );
});

test('filters threads by project, by no project and by state, with matching totals', () => {
  const { db, thread, run } = database();
  thread('thread:a', 'Platform idle', 90);
  thread('thread:b', 'Platform running', 40);
  thread('thread:c', 'Mobile running', 30, { project: 'p2' });
  thread('thread:d', 'Loose running', 20, { project: null });
  thread('thread:e', 'Loose failed', 10, { project: null });
  run('thread:b', 1, 'running');
  run('thread:c', 1, 'preparing');
  run('thread:d', 1, 'completed');
  run('thread:d', 2, 'running');
  run('thread:e', 1, 'failed');
  const list = (filter) => {
    const page = reads(db).threads(filter);
    assert.equal(page.total, page.threads.length);
    return page.threads.map((t) => t.threadId);
  };
  assert.deepEqual(list({ projectId: 'p1' }), ['thread:b', 'thread:a']);
  assert.deepEqual(list({ projectId: 'none' }), ['thread:e', 'thread:d']);
  assert.deepEqual(list({ projectId: 'nope' }), []);
  assert.deepEqual(list({ state: 'running' }), [
    'thread:d',
    'thread:c',
    'thread:b',
  ]);
  assert.deepEqual(list({ state: 'idle' }), ['thread:a']);
  assert.deepEqual(list({ state: 'running', projectId: 'p1' }), ['thread:b']);
  assert.deepEqual(
    list({ state: 'running', projectId: 'none', query: 'loose' }),
    ['thread:d']
  );
  // A project id is a value, never part of the statement.
  assert.deepEqual(list({ projectId: "p1' OR '1'='1" }), []);
  // Paging counts the filtered threads only.
  const first = reads(db).threads({ state: 'running', limit: 2 });
  assert.deepEqual([first.total, first.nextCursor], [3, 2]);
});

test('the state filter agrees with threadState for every run status', () => {
  const statuses = [
    'idle',
    'preparing',
    'queued',
    'starting',
    'running',
    'waiting',
    'completed',
    'interrupted',
    'failed',
    'cancelled',
    'rolled_back',
    'a-status-added-later',
  ];
  const { db, thread, run } = database();
  statuses.forEach((status, n) => {
    thread(`thread:${status}`, status, n);
    run(`thread:${status}`, 1, status);
  });
  thread('thread:never-ran', 'never ran', 99);
  for (const state of ['running', 'waiting', 'failed', 'idle']) {
    const listed = reads(db)
      .threads({ state })
      .threads.map((t) => t.threadId.slice('thread:'.length))
      .sort();
    const expected = statuses
      .filter((status) => threadState(status) === state)
      .concat(state === 'idle' ? ['never-ran'] : [])
      .sort();
    assert.deepEqual(listed, expected, state);
  }
});

test('treats the threads of the scratch project as threads in no project', () => {
  const { db, thread, message } = database();
  thread('thread:a', 'In a project', 10);
  thread('thread:b', 'Loose', 20, { project: null });
  message('thread:b', 'user', 'hello');
  const listed = reads(db).threads({});
  assert.deepEqual(
    listed.threads.map((t) => [t.threadId, t.projectId, t.project]),
    [
      ['thread:a', 'p1', 'Platform'],
      // Neither the scratch project's id nor its name is shown.
      ['thread:b', undefined, undefined],
    ]
  );
  const history = reads(db).transcript({ threadId: 'thread:b' });
  assert.equal('projectId' in history.thread, false);
  assert.equal('project' in history.thread, false);
  const grouped = reads(db).projects();
  assert.deepEqual(
    [grouped.projects.map((p) => p.projectId), grouped.total],
    [['p1'], 1]
  );
  assert.equal(grouped.unassigned.threadCount, 1);
  // Asked for by its own id, the scratch project is still only "none".
  assert.deepEqual(
    reads(db)
      .threads({ projectId: SCRATCH_ID })
      .threads.map((t) => [t.threadId, t.projectId]),
    [['thread:b', undefined]]
  );

  // A machine whose T3 has no scratch project has no loose threads.
  const other = reads(db, { scratchRoot: '/somewhere/else' });
  assert.equal(other.threads({ projectId: 'none' }).total, 0);
  assert.equal(other.projects().unassigned.threadCount, 0);
  assert.equal(other.projects().total, 2);
  // More scratch projects than T3 ever keeps: not a schema known here.
  const { db: odd, project } = database();
  for (let n = 0; n < 9; n++) project(`s${n}`, 'No project', SCRATCH_ROOT);
  assert.throws(() => reads(odd).projects(), /scratch/);
});

test('adds when the owner last wrote: typed in T3, or delivered through the bridge', () => {
  const { db, thread, message } = database();
  thread('thread:a', 'Owner typed here', 1);
  thread('thread:b', 'Owner replied from Mastermind', 2);
  thread('thread:c', 'Agents and automatic messages only', 3);
  thread('thread:d', 'A broken row', 4);
  thread('thread:e', 'Typed, then replied through the bridge', 5);
  message('thread:a', 'user', 'typed long ago', {
    createdBy: 'user',
    minutesAgo: 500,
  });
  message('thread:a', 'user', 'typed', { createdBy: 'user', minutesAgo: 30 });
  message('thread:a', 'user', 'an agent, later', {
    createdBy: 'agent',
    minutesAgo: 5,
  });
  message('thread:a', 'assistant', 'the answer', { minutesAgo: 4 });
  // A message id shaped like a bridge reply proves nothing by itself.
  message('thread:c', 'user', 'an agent borrowing the id shape', {
    id: 'message:mcp:abc:thread-send:mm-reply:0000',
    createdBy: 'agent',
  });
  // T3 files these under the owner, but the owner did not type them.
  for (const fields of [
    { scheduledTaskId: 'task:1' },
    { notification: { kind: 'limit' } },
    { delegatedCompletion: { taskId: 't' } },
    // Set to something that is not a value still marks the message.
    { scheduledTaskId: '' },
    { notification: false },
  ])
    message('thread:c', 'user', 'automatic', { createdBy: 'user', fields });
  // The prompt T3 sends by itself to resume a run after a usage limit.
  message('thread:c', 'user', 'continue', {
    id: 'limit-resume:run-1',
    createdBy: 'user',
    fields: { creationSource: 'server' },
  });
  // History imported from another tool: written by the owner once, elsewhere.
  message('thread:c', 'user', 'an old prompt', {
    id: 'import:session-1:0',
    createdBy: 'user',
    fields: { creationSource: 'server' },
  });
  // The owner answering a question a thread asked is the owner writing.
  thread('thread:f', 'Asked the owner something', 6);
  message('thread:f', 'user', 'the answer', {
    id: 'async-answer:question-1',
    createdBy: 'user',
    minutesAgo: 9,
    fields: { creationSource: 'server' },
  });
  message('thread:d', 'user', '', { payload: '{"text": "cut off' });
  // The fields present but empty are the same as absent.
  message('thread:e', 'user', 'typed', {
    createdBy: 'user',
    minutesAgo: 40,
    fields: { scheduledTaskId: null, notification: null },
  });
  const delivered = { 'thread:b': iso(12), 'thread:e': iso(8) };
  const page = reads(db, {
    bridgeReplyAt: (threadId) => delivered[threadId],
  }).threads({ ownerReply: true });
  assert.equal(bridgeRpcAnswerSchemas.threads.safeParse(page).success, true);
  assert.deepEqual(
    page.threads.map((t) => [t.threadId, t.lastOwnerReplyAt]),
    [
      ['thread:a', iso(30)],
      ['thread:b', iso(12)],
      ['thread:c', undefined],
      ['thread:d', undefined],
      // The later of the two.
      ['thread:e', iso(8)],
      ['thread:f', iso(9)],
    ]
  );
  // Not asked for: not looked up, in the database or the ledger.
  let asked = 0;
  const plain = reads(db, { bridgeReplyAt: () => asked++ }).threads({});
  assert.equal(
    plain.threads.some((t) => 'lastOwnerReplyAt' in t),
    false
  );
  assert.equal(asked, 0);
});

test('looks for the owner among the 400 newest user messages only', () => {
  const { db, thread, message } = database();
  thread('thread:a', 'A long agent thread', 1);
  message('thread:a', 'user', 'typed long ago', {
    createdBy: 'user',
    minutesAgo: 1000,
  });
  for (let n = 0; n < 400; n++)
    message('thread:a', 'user', 'a relay', {
      createdBy: 'agent',
      minutesAgo: 400 - n,
    });
  const last = () =>
    reads(db).threads({ ownerReply: true }).threads[0].lastOwnerReplyAt;
  assert.equal(last(), undefined);
  message('thread:a', 'user', 'typed again', { createdBy: 'user' });
  assert.equal(last(), iso(0));
});

test('refuses the per-thread reads when the index they need is missing', () => {
  const { db, thread, run } = database();
  thread('thread:a', 'One', 1);
  run('thread:a', 1, 'running');
  db.exec('DROP INDEX runs_thread_ordinal');
  // Without it each of these scans every run once per thread.
  assert.throws(() => reads(db).projects(), /No index/);
  assert.throws(() => reads(db).threads({ state: 'running' }), /No index/);
  // An index that starts elsewhere does not serve the lookup.
  db.exec(
    'CREATE INDEX runs_status ON orchestration_v2_projection_runs (status, thread_id, ordinal)'
  );
  assert.throws(() => reads(db).projects(), /No index/);
  assert.equal(reads(db).threads({}).threads[0].state, 'running');

  // Nor does one that leaves out rows the lookup reads.
  db.exec('DROP INDEX runs_status');
  db.exec(
    "CREATE INDEX runs_running ON orchestration_v2_projection_runs (thread_id, ordinal) WHERE status = 'running'"
  );
  assert.throws(() => reads(db).projects(), /No index/);

  db.exec('DROP INDEX messages_latest_user');
  assert.throws(() => reads(db).threads({ ownerReply: true }), /No index/);
  db.exec(
    "CREATE INDEX messages_assistant ON orchestration_v2_projection_messages (thread_id, updated_at) WHERE role = 'assistant'"
  );
  assert.throws(() => reads(db).threads({ ownerReply: true }), /No index/);
  // A full index serves it as well as the one of user rows.
  db.exec(
    'CREATE INDEX messages_all ON orchestration_v2_projection_messages (thread_id, updated_at)'
  );
  assert.equal(reads(db).threads({ ownerReply: true }).total, 1);
  assert.equal(reads(db).threads({}).total, 1);
});
