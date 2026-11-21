import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import {
  BRIDGE_RPC_DOMAIN,
  BRIDGE_RPC_KEY_INFO,
  bridgeMachineFrameSchema,
  bridgeRpcAnswerSchemas,
  bridgeRpcRequestSchema,
  bridgeRpcSealContext,
  bridgeRpcSigningString,
} from '../../packages/utils/src/mastermind-store/bridge-protocol.ts';
import {
  handleRequest,
  MAX_ANSWER_BYTES,
  RPC_DOMAIN,
  RPC_KEY_INFO,
  rpcSigningString,
  verifyRequest,
} from './bridge-rpc.mjs';
import {
  ask,
  deps,
  openAnswer,
  requestFrame,
  THREAD,
} from './bridge-rpc-test-fixture.mjs';
import { NOW, SECRET, uuid } from './bridge-test-fixture.mjs';

test('matches the Web protocol: labels, signed bytes and sealing contexts', () => {
  assert.equal(RPC_DOMAIN, BRIDGE_RPC_DOMAIN);
  assert.equal(RPC_KEY_INFO, BRIDGE_RPC_KEY_INFO);
  const { request } = requestFrame('threads', { limit: 5 });
  assert.equal(bridgeRpcRequestSchema.safeParse(request).success, true);
  assert.equal(rpcSigningString(request), bridgeRpcSigningString(request));
});

test('answers only a request Web signed for this machine, intact and in date', () => {
  const check = (frame, now = NOW) =>
    verifyRequest(frame, { secret: SECRET, machineId: 'skr-m4', now });
  assert.deepEqual(check(requestFrame('threads', { limit: 5 })).args, {
    limit: 5,
  });
  const other = requestFrame('transcript', { threadId: THREAD }).request;
  for (const change of [
    (f) => (f.request.kind = 'transcript'),
    (f) => (f.request.kind = 'shell'),
    (f) => (f.request.box = other.box),
    (f) => (f.request.expiresAt += 1),
    (f) => (f.request.extra = 1),
    (f) => (f.sig = '0'.repeat(64)),
    (f) => (f.t = 'reply'),
    (f) => (f.v = 2),
  ]) {
    const frame = requestFrame('threads', { limit: 5 });
    change(frame);
    assert.equal(check(frame), null);
  }
  assert.equal(check(requestFrame('threads', {}, {}, 'x'.repeat(40))), null);
  assert.equal(
    check(requestFrame('threads', {}, { machineId: 'other' })),
    null
  );
  assert.equal(check(requestFrame('threads', {}), NOW + 20_000), null);
  // Signed for longer than a read may live.
  assert.equal(
    check(requestFrame('threads', {}, { expiresAt: NOW + 120_000 })),
    null
  );
  // Arguments that are not an object.
  assert.equal(check(requestFrame('threads', [1, 2])), null);
  assert.equal(check({ v: 1, t: 'req' }), null);
});

test('says nothing at all to a request it cannot verify', async () => {
  const frame = requestFrame('threads', {});
  frame.sig = 'f'.repeat(64);
  const d = deps({});
  assert.equal(await handleRequest(frame, d), null);
  assert.equal(d.calls.length, 0);
});

test('lists this machine and its linked machines', async () => {
  const { answer, res } = await ask(
    'machines',
    {},
    {
      t3_environment_links: () => ({
        links: [
          { environmentId: 'env-1', label: 'MacStudio1', status: 'reachable' },
          { environmentId: 'env-2', label: 'Laptop', status: 'unreachable' },
          { environmentId: '../bad', label: 'x', status: 'reachable' },
        ],
      }),
    }
  );
  assert.equal(bridgeMachineFrameSchema.safeParse(res).success, true);
  assert.equal(
    bridgeRpcAnswerSchemas.machines.safeParse(answer.data).success,
    true
  );
  assert.deepEqual(answer, {
    ok: true,
    data: {
      machines: [
        { label: 'This machine', reachable: true },
        { environmentId: 'env-1', label: 'MacStudio1', reachable: true },
        { environmentId: 'env-2', label: 'Laptop', reachable: false },
      ],
    },
  });
});

test('pages and searches threads with only read tools, titles scrubbed', async () => {
  const { answer, calls } = await ask(
    'threads',
    { environmentId: 'env-1', query: ' deploy ', cursor: 50, limit: 2 },
    {
      t3_thread_list: () => ({
        threads: [
          {
            threadId: THREAD,
            projectId: 'p1',
            title: 'Deploy with token=hunter2 to https://example.com',
            status: 'running',
            updatedAt: '2026-11-21T05:00:00.000Z',
            itemCount: 12,
          },
          { threadId: 'bad id', title: 'x', status: 'idle' },
          { threadId: 'mcp:launch:abc', title: '', status: 'waiting' },
        ],
        nextCursor: 52,
        total: 76,
      }),
      t3_project_list: () => ({ projects: [{ id: 'p1', title: 'Platform' }] }),
    }
  );
  assert.equal(
    bridgeRpcAnswerSchemas.threads.safeParse(answer.data).success,
    true
  );
  assert.deepEqual(answer.data, {
    threads: [
      {
        threadId: THREAD,
        title: 'Deploy with to',
        projectId: 'p1',
        project: 'Platform',
        state: 'running',
        updatedAt: '2026-11-21T05:00:00.000Z',
        itemCount: 12,
      },
      {
        threadId: 'mcp:launch:abc',
        title: 'Untitled',
        state: 'waiting',
        updatedAt: '',
        itemCount: 0,
      },
    ],
    nextCursor: 52,
    total: 76,
  });
  assert.deepEqual(calls[0].args, {
    environmentId: 'env-1',
    allProjects: true,
    limit: 2,
    cursor: 50,
    titleContains: 'deploy',
  });
  // Nothing but reads ever reaches T3 from here.
  assert.deepEqual([...new Set(calls.map((call) => call.name))].sort(), [
    't3_project_list',
    't3_thread_list',
  ]);
});

test('returns user and assistant messages only, redacted and capped', async () => {
  const { answer, calls } = await ask(
    'transcript',
    { threadId: THREAD, before: 40, limit: 3 },
    {
      t3_thread_read: () => ({
        thread: { title: 'Fix the build', status: 'failed', itemCount: 44 },
        items: [
          {
            position: 30,
            type: 'user_message',
            text: 'run it\nplease',
            updatedAt: 't1',
          },
          {
            position: 31,
            type: 'command_execution',
            text: 'cat .env',
            updatedAt: 't2',
          },
          {
            position: 32,
            type: 'reasoning',
            text: 'thinking',
            updatedAt: 't3',
          },
          {
            position: 33,
            type: 'assistant_message',
            text: `Edited ./apps/web/.env.local, see https://example.com/x\nAPI_KEY=${['sk', 'live', 'abcdef0123456789'].join('-')}`,
            updatedAt: 't4',
          },
          {
            position: 34,
            type: 'assistant_message',
            text: 'lorem ipsum '.repeat(420),
            updatedAt: 't5',
          },
          {
            position: 35,
            type: 'assistant_message',
            text: '   ',
            updatedAt: 't6',
          },
        ],
        earlierPosition: 29,
      }),
    }
  );
  assert.equal(
    bridgeRpcAnswerSchemas.transcript.safeParse(answer.data).success,
    true
  );
  assert.deepEqual(calls[0].args, {
    threadId: THREAD,
    limit: 3,
    maxCharsPerItem: 4000,
    beforePosition: 40,
  });
  // Without a position T3 would start at the oldest item.
  const first = await ask(
    'transcript',
    { threadId: THREAD },
    {
      t3_thread_read: () => ({ thread: {}, items: [], earlierPosition: null }),
    }
  );
  assert.equal(first.calls[0].args.beforePosition, 2_000_000_000);
  assert.deepEqual(answer.data.thread, {
    threadId: THREAD,
    title: 'Fix the build',
    state: 'failed',
    updatedAt: '',
    itemCount: 44,
  });
  assert.deepEqual(
    answer.data.messages.map((m) => [m.position, m.role, m.truncated]),
    [
      [30, 'user', false],
      [33, 'assistant', false],
      [34, 'assistant', true],
    ]
  );
  // Layout, paths and links stay; the credential does not.
  assert.equal(answer.data.messages[0].text, 'run it\nplease');
  assert.equal(
    answer.data.messages[1].text,
    'Edited ./apps/web/.env.local, see https://example.com/x\nAPI_KEY=[redacted]'
  );
  assert.equal(answer.data.messages[2].text.length, 4000);
  assert.equal(answer.data.earlierPosition, 29);
});

test('drops the oldest messages when a page would not fit one frame', async () => {
  const { answer, res } = await ask(
    'transcript',
    { threadId: THREAD },
    {
      t3_thread_read: () => ({
        thread: { title: 't', status: 'idle', itemCount: 400 },
        // Multi-byte text: 4,000 characters are about 12 KB each.
        items: Array.from({ length: 30 }, (_, i) => ({
          position: 100 + i,
          type: 'assistant_message',
          text: '好'.repeat(4000),
          updatedAt: 't',
        })),
        earlierPosition: 99,
      }),
    }
  );
  assert.ok(Buffer.byteLength(JSON.stringify(answer.data)) <= MAX_ANSWER_BYTES);
  assert.ok(answer.data.messages.length < 30);
  // The newest survive, and paging back resumes exactly where this page starts.
  assert.equal(answer.data.messages.at(-1).position, 129);
  assert.equal(answer.data.earlierPosition, answer.data.messages[0].position);
  assert.equal(bridgeMachineFrameSchema.safeParse(res).success, true);
});

test('answers failures with a closed code, sealed like any answer', async () => {
  const refuse = (detail) => () => {
    throw Object.assign(new Error('t3_tool_error'), {
      code: 't3_tool_error',
      detail,
    });
  };
  const cases = [
    [
      'transcript',
      { threadId: THREAD },
      { t3_thread_read: refuse(`Thread ${THREAD} was not found.`) },
      'unknown_thread',
    ],
    [
      'transcript',
      { threadId: THREAD },
      { t3_thread_read: refuse('Environment unreachable.') },
      'unavailable',
    ],
    ['transcript', { threadId: 'bad id' }, {}, 'bad_request'],
    ['transcript', {}, {}, 'bad_request'],
    ['threads', { environmentId: '../x' }, {}, 'bad_request'],
    [
      'threads',
      {},
      {
        t3_thread_list: () => {
          throw Object.assign(new Error('x'), { code: 't3_not_running' });
        },
      },
      'unavailable',
    ],
  ];
  for (const [kind, args, tools, code] of cases)
    assert.deepEqual((await ask(kind, args, tools)).answer, {
      ok: false,
      code,
    });
});

test('an answer opens only for the request it was sealed for', async () => {
  const frame = requestFrame('machines', {});
  const res = await handleRequest(
    frame,
    deps({ t3_environment_links: () => ({ links: [] }) })
  );
  assert.throws(() => openAnswer(res, { ...frame.request, id: uuid(2) }));
  assert.throws(() => openAnswer(res, frame.request, 'x'.repeat(40)));
  assert.equal(openAnswer(res, frame.request).ok, true);
});

test('answers a read of this machine from its own database, without any T3 call', async () => {
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
    INSERT INTO orchestration_v2_projection_threads
      VALUES ('${THREAD}', NULL, 'Local thread', '2026-11-21T05:00:00.000Z', NULL, NULL);
    INSERT INTO orchestration_v2_projection_messages
      VALUES ('m1', '${THREAD}', 'user', '{"text":"hello"}', 't');
  `);
  let closed = 0;
  const local = (kind, args) => {
    const frame = requestFrame(kind, args);
    const d = {
      ...deps({}),
      openDatabase: () => ({
        prepare: (sql) => db.prepare(sql),
        close: () => closed++,
      }),
    };
    return handleRequest(frame, d).then((res) => ({
      answer: openAnswer(res, frame.request),
      calls: d.calls,
    }));
  };
  const list = await local('threads', { limit: 10 });
  assert.equal(list.answer.data.threads[0].threadId, THREAD);
  const page = await local('transcript', { threadId: THREAD });
  assert.deepEqual(
    page.answer.data.messages.map((m) => [m.role, m.text]),
    [['user', 'hello']]
  );
  assert.deepEqual(
    (await local('transcript', { threadId: 'thread:nope' })).answer,
    { ok: false, code: 'unknown_thread' }
  );
  assert.deepEqual((await local('transcript', { threadId: 'bad id' })).answer, {
    ok: false,
    code: 'bad_request',
  });
  // The database is closed after every read (a malformed request never
  // opens it), and T3 is never called.
  assert.equal(closed, 3);
  assert.equal(list.calls.length + page.calls.length, 0);
  // A linked machine is still read through T3.
  const linked = requestFrame('threads', { environmentId: 'env-1' });
  const d = {
    ...deps({
      t3_thread_list: () => ({ threads: [], nextCursor: null, total: 0 }),
    }),
    openDatabase: () => {
      throw new Error('not for a linked machine');
    },
  };
  assert.equal(
    openAnswer(await handleRequest(linked, d), linked.request).ok,
    true
  );
  assert.equal(d.calls[0].args.environmentId, 'env-1');
});

test('answers unavailable, and closes the database, when it is busy, missing or not the schema it expects', async () => {
  let closed = 0;
  const empty = new DatabaseSync(':memory:');
  const renamed = new DatabaseSync(':memory:');
  // A T3 release that renamed a column the reads rely on.
  renamed.exec(`
    CREATE TABLE orchestration_v2_projection_threads (
      id TEXT PRIMARY KEY, name TEXT, updated_at TEXT);
    CREATE TABLE projection_projects (project_id TEXT PRIMARY KEY, title TEXT);
    CREATE TABLE orchestration_v2_projection_thread_item_counts (
      thread_id TEXT PRIMARY KEY, item_count INTEGER);
    CREATE TABLE orchestration_v2_projection_runs (
      run_id TEXT PRIMARY KEY, thread_id TEXT, ordinal INTEGER, status TEXT);
    CREATE TABLE orchestration_v2_projection_messages (
      message_id TEXT PRIMARY KEY, thread_id TEXT, role TEXT,
      payload_json TEXT, updated_at TEXT);
  `);
  const wrap = (db) => () => ({
    prepare: (sql) => db.prepare(sql),
    close: () => closed++,
  });
  const cases = [
    wrap(empty),
    wrap(renamed),
    () => {
      throw Object.assign(new Error('database is locked'), {
        code: 'ERR_SQLITE_ERROR',
      });
    },
  ];
  for (const openDatabase of cases)
    for (const [kind, args] of [
      ['threads', {}],
      ['transcript', { threadId: THREAD }],
    ]) {
      const frame = requestFrame(kind, args);
      const d = { ...deps({}), openDatabase };
      const answer = openAnswer(await handleRequest(frame, d), frame.request);
      // Never a partial list, and never the database error itself.
      assert.deepEqual(answer, { ok: false, code: 'unavailable' });
      assert.equal(d.calls.length, 0);
    }
  // Every database that did open was closed again.
  assert.equal(closed, 4);
});

test('asks T3 which machines answer, and falls back to the links on record', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE peer_environment_links (
      environment_id TEXT PRIMARY KEY, label TEXT, linked_at TEXT,
      expires_at TEXT, last_reached_at TEXT, fenced INTEGER);
    INSERT INTO peer_environment_links
      VALUES ('env-1', 'MacStudio1', 't', '2999-01-01T00:00:00.000Z', NULL, 0);
  `);
  const openDatabase = () => ({
    prepare: (sql) => db.prepare(sql),
    close: () => undefined,
  });
  const machines = async (tools) => {
    const frame = requestFrame('machines', {});
    const d = { ...deps(tools), openDatabase };
    return openAnswer(await handleRequest(frame, d), frame.request).data
      .machines;
  };
  // T3 says the linked machine is not answering right now.
  assert.deepEqual(
    await machines({
      t3_environment_links: () => ({
        links: [
          {
            environmentId: 'env-1',
            label: 'MacStudio1',
            status: 'unreachable',
          },
        ],
      }),
    }),
    [
      { label: 'This machine', reachable: true },
      { environmentId: 'env-1', label: 'MacStudio1', reachable: false },
    ]
  );
  // T3 cannot be asked: the link on record is shown as standing.
  assert.deepEqual(await machines({}), [
    { label: 'This machine', reachable: true },
    { environmentId: 'env-1', label: 'MacStudio1', reachable: true },
  ]);
});

test('checks the type and range of opened arguments before any read', async () => {
  for (const [kind, args] of [
    ['transcript', { threadId: ['thread-abc'] }],
    ['transcript', { threadId: THREAD, before: 3_000_000_000 }],
    ['transcript', { threadId: THREAD, limit: 51 }],
    ['threads', { cursor: 100_001 }],
    ['threads', { cursor: -1 }],
    ['threads', { limit: 0.5 }],
    ['threads', { query: ['x'] }],
    ['threads', { environmentId: ['env-1'] }],
    ['machines', { environmentId: 7 }],
  ]) {
    const { answer, calls } = await ask(kind, args, {
      t3_thread_read: () => ({ thread: {}, items: [] }),
      t3_thread_list: () => ({ threads: [] }),
      t3_environment_links: () => ({ links: [] }),
    });
    assert.deepEqual(answer, { ok: false, code: 'bad_request' });
    assert.equal(calls.length, 0);
  }
});
