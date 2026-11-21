import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { openMcpSession, T3McpError } from './t3-mcp.mjs';
import {
  createSendJournal,
  IN_FLIGHT_GRACE_MS,
  STEER_MESSAGE_MAX,
  steerOnce,
  steerThread,
} from './t3-steer.mjs';
import {
  fakeServer,
  ok,
  ORIGIN,
  refused,
  tempDir,
  THREAD,
} from './t3-test-fixture.mjs';

function homeWith(server) {
  const home = tempDir('t3-home-');
  fs.mkdirSync(path.join(home, '.t3/userdata'), { recursive: true });
  fs.writeFileSync(
    path.join(home, '.t3/userdata/server-runtime.json'),
    JSON.stringify({ origin: ORIGIN })
  );
  return {
    home,
    journalFile: path.join(
      home,
      '.local/share/fleet-sync/t3-steer-journal.jsonl'
    ),
    options: { home, fetchImpl: server.fetchImpl, sessions: server.sessions },
  };
}

const sendCalls = (server, name = 't3_thread_send') =>
  server.log.filter(
    (entry) =>
      entry.body?.method === 'tools/call' && entry.body.params.name === name
  );

test('reuses the cached token and signs in again once when the server rejects it', async () => {
  const server = fakeServer({
    tools: { t3_thread_send: () => ok({ delivery: 'steered', runId: 'r1' }) },
  });
  const { home, options } = homeWith(server);
  const input = { threadId: THREAD, message: 'hello' };
  assert.equal((await steerOnce(input, options)).delivery, 'steered');
  assert.equal((await steerOnce(input, options)).delivery, 'steered');
  assert.equal(server.state.minted, 1);
  // A server restart forgets the token: exactly one new sign-in, then delivery.
  server.state.tokens.clear();
  assert.equal((await steerOnce(input, options)).delivery, 'steered');
  assert.equal(server.state.minted, 2);
  assert.deepEqual(server.sessions.revoked, ['sess-1', 'sess-1']);
  // Without a request id every call is a new message.
  assert.equal(sendCalls(server).length, 3);
  fs.rmSync(home, { recursive: true });
});

test('a retry with the same request id never sends twice, even after a new sign-in', async () => {
  let delivered = 0;
  const server = fakeServer({
    tools: {
      t3_thread_send: () => {
        delivered++;
        return ok({ delivery: 'steered', messageId: 'm1', runId: 'r1' });
      },
    },
  });
  const { home, options, journalFile } = homeWith(server);
  const input = { threadId: THREAD, message: 'hello', clientRequestId: 'a-1' };
  const first = await steerOnce(input, options);
  assert.deepEqual(await steerOnce(input, options), first);
  // T3 would not recognise the id under a new bearer; the journal does.
  server.state.tokens.clear();
  assert.deepEqual(await steerOnce(input, options), first);
  assert.equal(delivered, 1);
  assert.equal(sendCalls(server).length, 1);
  assert.equal(fs.statSync(journalFile).mode & 0o777, 0o600);
  assert.ok(!fs.readFileSync(journalFile, 'utf8').includes('hello'));
  fs.rmSync(home, { recursive: true });
});

test('an interrupted send is resolved from the thread timeline, not by sending again', async () => {
  const setup = (items) => {
    let delivered = 0;
    const server = fakeServer({
      tools: {
        t3_thread_send: () => {
          delivered++;
          return ok({ delivery: 'started', messageId: 'new', runId: 'r2' });
        },
        t3_thread_read: () => ok({ thread: { activeRunId: null }, items }),
      },
    });
    const dir = tempDir();
    const journal = createSendJournal(path.join(dir, 'journal.jsonl'));
    // An earlier attempt went out under another bearer and never reported back.
    journal.begin('a-1', 'old-bearer', 1_000);
    server.state.tokens.add('tok');
    return { server, journal, delivered: () => delivered };
  };
  const input = { threadId: THREAD, message: 'hello', clientRequestId: 'a-1' };
  const steer = async ({ server, journal }, now) => {
    const session = await openMcpSession({
      origin: ORIGIN,
      token: 'tok',
      fetchImpl: server.fetchImpl,
    });
    return steerThread(session.call, input, {
      journal,
      bearerId: session.bearerId,
      now: () => now,
    });
  };

  // Still inside the grace window: another process may be sending it.
  const fresh = setup([]);
  await assert.rejects(steer(fresh, 1_000 + IN_FLIGHT_GRACE_MS - 1), {
    code: 'steer_in_flight',
  });
  assert.equal(fresh.delivered(), 0);

  // It did land: same message, reported as delivered, nothing sent.
  const landed = setup([
    { messageId: 'message:mcp:other:thread-send:a-10', runId: 'r0' },
    { messageId: 'message:mcp:old:thread-send:a-1', runId: 'r1' },
  ]);
  const receipt = await steer(landed, 1_000 + IN_FLIGHT_GRACE_MS);
  assert.deepEqual(receipt, {
    delivery: 'delivered',
    threadId: THREAD,
    messageId: 'message:mcp:old:thread-send:a-1',
    runId: 'r1',
  });
  assert.equal(landed.delivered(), 0);
  assert.deepEqual(landed.journal.get('a-1').r, receipt);

  // It never landed: now it is sent, once.
  const lost = setup([
    { messageId: 'message:mcp:other:thread-send:a-10', runId: 'r0' },
  ]);
  assert.equal(
    (await steer(lost, 1_000 + IN_FLIGHT_GRACE_MS)).delivery,
    'started'
  );
  assert.equal(lost.delivered(), 1);
});

test('two processes cannot both claim one request id, and a held lock stops the send', async () => {
  const dir = tempDir();
  const file = path.join(dir, 'journal.jsonl');
  // Two journals on one file stand for two processes that both started
  // before either had written anything.
  const first = createSendJournal(file);
  const second = createSendJournal(file);
  assert.deepEqual(first.claim('a-1', 'bearer-1', 1_000), { begun: true });
  assert.deepEqual(second.claim('a-1', 'bearer-2', 1_001), { inFlight: true });
  // The same bearer may resend: T3 recognises the id under it.
  assert.deepEqual(second.claim('a-1', 'bearer-1', 1_002), { begun: true });
  const stale = 1_002 + IN_FLIGHT_GRACE_MS;
  assert.deepEqual(second.claim('a-1', 'bearer-2', stale), { probe: 1_002 });
  // Taking over needs the very begin that was probed; a newer one wins.
  assert.deepEqual(second.claim('a-1', 'bearer-2', stale, { takeOver: 999 }), {
    probe: 1_002,
  });
  assert.deepEqual(
    second.claim('a-1', 'bearer-2', stale, { takeOver: 1_002 }),
    { begun: true }
  );
  first.settle('a-1', { delivery: 'steered' });
  assert.deepEqual(second.claim('a-1', 'bearer-3', stale), {
    receipt: { delivery: 'steered' },
  });
  assert.equal(fs.existsSync(`${file}.lock`), false);

  // A lock another process holds: no claim, so no send.
  fs.writeFileSync(`${file}.lock`, '');
  const server = fakeServer({
    tools: { t3_thread_send: () => ok({ delivery: 'steered' }) },
  });
  server.state.tokens.add('tok');
  const session = await openMcpSession({
    origin: ORIGIN,
    token: 'tok',
    fetchImpl: server.fetchImpl,
  });
  await assert.rejects(
    steerThread(
      session.call,
      { threadId: THREAD, message: 'hello', clientRequestId: 'a-2' },
      { journal: first, bearerId: session.bearerId }
    ),
    { code: 'steer_journal_unsafe' }
  );
  assert.equal(sendCalls(server).length, 0);
  // A lock left behind by a dead process is taken over.
  const old = new Date(Date.now() - 120_000);
  fs.utimesSync(`${file}.lock`, old, old);
  assert.deepEqual(first.claim('a-2', 'bearer-1', 5), { begun: true });
  fs.rmSync(dir, { recursive: true });
});

test('looks beyond the first timeline page for an interrupted send', async () => {
  const pages = [];
  const server = fakeServer({
    tools: {
      t3_thread_send: () => ok({ delivery: 'started' }),
      t3_thread_read: (args) => {
        pages.push(args.beforePosition ?? null);
        return args.beforePosition === 40
          ? ok({
              items: [
                { messageId: 'message:mcp:x:thread-send:a-1', runId: 'r' },
              ],
              earlierPosition: null,
            })
          : ok({ items: [], earlierPosition: 40 });
      },
    },
  });
  server.state.tokens.add('tok');
  const journal = createSendJournal(path.join(tempDir(), 'journal.jsonl'));
  journal.begin('a-1', 'old-bearer', 1_000);
  const session = await openMcpSession({
    origin: ORIGIN,
    token: 'tok',
    fetchImpl: server.fetchImpl,
  });
  const receipt = await steerThread(
    session.call,
    { threadId: THREAD, message: 'hello', clientRequestId: 'a-1' },
    {
      journal,
      bearerId: session.bearerId,
      now: () => 1_000 + IN_FLIGHT_GRACE_MS,
    }
  );
  assert.equal(receipt.delivery, 'delivered');
  assert.deepEqual(pages, [null, 40]);
  assert.equal(sendCalls(server).length, 0);
});

test('refuses to send when the journal cannot be written', async () => {
  const server = fakeServer({
    tools: { t3_thread_send: () => ok({ delivery: 'steered' }) },
  });
  const { home, options, journalFile } = homeWith(server);
  fs.mkdirSync(path.dirname(journalFile), { recursive: true });
  fs.symlinkSync(path.join(home, 'elsewhere'), journalFile);
  await assert.rejects(
    steerOnce(
      { threadId: THREAD, message: 'hello', clientRequestId: 'a-1' },
      options
    ),
    { code: 'steer_journal_unsafe' }
  );
  assert.equal(sendCalls(server).length, 0);
  assert.equal(fs.existsSync(path.join(home, 'elsewhere')), false);
  fs.rmSync(home, { recursive: true });
});

async function sessionFor(tools) {
  const server = fakeServer({ tools });
  server.state.tokens.add('tok');
  const session = await openMcpSession({
    origin: ORIGIN,
    token: 'tok',
    fetchImpl: server.fetchImpl,
  });
  const calls = () =>
    server.log
      .filter((e) => e.body?.method === 'tools/call')
      .map((e) => e.body.params);
  return { session, calls };
}

test('steers a running turn or starts an idle thread in one call, with the idempotency key', async () => {
  for (const delivery of ['steered', 'started']) {
    const { session, calls } = await sessionFor({
      t3_thread_send: () =>
        ok({ delivery, threadId: THREAD, messageId: 'm1', runId: 'r1' }),
    });
    const receipt = await steerThread(session.call, {
      threadId: THREAD,
      message: '  hello  ',
      clientRequestId: 'reply-1',
      environmentId: 'env-2',
    });
    assert.deepEqual(receipt, {
      delivery,
      threadId: THREAD,
      messageId: 'm1',
      runId: 'r1',
    });
    assert.deepEqual(calls(), [
      {
        name: 't3_thread_send',
        arguments: {
          threadId: THREAD,
          environmentId: 'env-2',
          message: 'hello',
          mode: 'auto',
          clientRequestId: 'reply-1',
        },
      },
    ]);
  }
});

test('never leaves a message queued behind a running turn: promotes it to steering', async () => {
  const { session, calls } = await sessionFor({
    t3_thread_send: () => ok({ delivery: 'queued', runId: 'queued-run' }),
    t3_thread_read: () => ok({ thread: { activeRunId: 'active-run' } }),
    t3_queue: () => ok({ sequence: 1 }),
  });
  const receipt = await steerThread(session.call, {
    threadId: THREAD,
    message: 'hello',
  });
  assert.equal(receipt.delivery, 'steered');
  assert.deepEqual(calls()[2], {
    name: 't3_queue',
    arguments: {
      threadId: THREAD,
      action: 'promote_to_steer',
      queuedRunId: 'queued-run',
      targetRunId: 'active-run',
    },
  });
});

test('says queued truthfully when there is nothing to steer into or promotion fails', async () => {
  const input = { threadId: THREAD, message: 'hello' };
  for (const activeRunId of [null, 'queued-run']) {
    const { session, calls } = await sessionFor({
      t3_thread_send: () => ok({ delivery: 'queued', runId: 'queued-run' }),
      t3_thread_read: () => ok({ thread: { activeRunId } }),
      t3_queue: () => ok({ sequence: 1 }),
    });
    assert.equal((await steerThread(session.call, input)).delivery, 'queued');
    // No promotion is attempted without another run to steer into.
    assert.deepEqual(
      calls().map((call) => call.name),
      ['t3_thread_send', 't3_thread_read']
    );
  }
  const failing = await sessionFor({
    t3_thread_send: () => ok({ delivery: 'queued', runId: 'queued-run' }),
    t3_thread_read: () => ok({ thread: { activeRunId: 'active-run' } }),
    t3_queue: () => refused('The run is no longer queued.'),
  });
  assert.equal(
    (await steerThread(failing.session.call, input)).delivery,
    'queued'
  );
  // A delivery T3 was never asked for is not a receipt.
  const restarted = await sessionFor({
    t3_thread_send: () => ok({ delivery: 'restarted', runId: 'r' }),
  });
  await assert.rejects(steerThread(restarted.session.call, input), {
    code: 't3_rpc_error',
  });
});

test('surfaces a refused send as a closed code and validates input before any call', async () => {
  const { session, calls } = await sessionFor({
    t3_thread_send: () => refused(`Thread ${THREAD} is archived.`),
  });
  await assert.rejects(
    steerThread(session.call, { threadId: THREAD, message: 'hello' }),
    (error) =>
      error instanceof T3McpError &&
      error.code === 't3_tool_error' &&
      error.message === 't3_tool_error' &&
      error.detail.includes('archived')
  );
  const before = calls().length;
  for (const [input, code] of [
    [{ threadId: 'bad id with spaces', message: 'x' }, 'steer_thread_invalid'],
    [{ threadId: '--json', message: 'x' }, 'steer_thread_invalid'],
    [{ threadId: '-thread', message: 'x' }, 'steer_thread_invalid'],
    [{ threadId: THREAD, message: '   ' }, 'steer_message_invalid'],
    [
      { threadId: THREAD, message: 'x'.repeat(STEER_MESSAGE_MAX + 1) },
      'steer_message_invalid',
    ],
    [
      { threadId: THREAD, message: 'x', clientRequestId: 'has space' },
      'steer_request_id_invalid',
    ],
    [
      { threadId: THREAD, message: 'x', clientRequestId: '--env' },
      'steer_request_id_invalid',
    ],
    [
      { threadId: THREAD, message: 'x', environmentId: '../x' },
      'steer_environment_invalid',
    ],
    [
      { threadId: THREAD, message: 'x', environmentId: '-e' },
      'steer_environment_invalid',
    ],
  ])
    await assert.rejects(steerThread(session.call, input), { code });
  assert.equal(calls().length, before);
  // Real T3 thread ids are accepted.
  for (const threadId of [
    'mcp:launch:aa2c14dad0844b6449bcfde707e00309104684725255049f681e951f7d0b5f5e',
    'thread:project:mcp%3Acd239ce1-94f3-4592-bdf6-3624bc90e41e:b5389d54-8e6e-4ab2-8d7a-4e3f8c187a1f',
    'thread:delegated-task:command%3Amcp%3A30d5533c-9766-4365-850e-22f20badde8e%3Adelegate-task%3A0c461315',
  ])
    await assert.rejects(
      steerThread(session.call, { threadId, message: 'x' }),
      {
        code: 't3_tool_error',
      }
    );
});
