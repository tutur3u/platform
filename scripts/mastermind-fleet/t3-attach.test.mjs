import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { AttachmentError, openSpool } from './attachment-spool.mjs';
import { handleReplyV2, replyMarker, verifyReplyV2 } from './bridge-attach.mjs';
import {
  fakeStore,
  manifestFile,
  replyV2Frame,
} from './bridge-attach-test-fixture.mjs';
import { createLedger } from './bridge-core.mjs';
import { NOW, SECRET, tempDir } from './bridge-test-fixture.mjs';
import { deliverBundle } from './t3-attach.mjs';
import { createSendJournal } from './t3-steer.mjs';

const STORE = 'https://store.example';
const T3 = 'http://127.0.0.1:3773';

/** A fake local T3: MCP calls and the loopback upload route. */
function fakeT3({ timeline = [], send } = {}) {
  const calls = [];
  const uploads = [];
  const call = async (name, args) => {
    calls.push({ name, args });
    if (name === 't3_attachment_prepare_upload')
      return {
        attachmentId: `pending-${calls.length}`,
        relativeUrl: `/api/attachments/upload/tok${calls.length}.sig`,
        expiresAt: NOW + 600_000,
        uploadUrl: 'https://evil.example/upload',
      };
    if (name === 't3_thread_send_attachments')
      return send
        ? send(args)
        : {
            threadId: args.threadId,
            messageId: 'm-1',
            runId: 'r-1',
            status: 'running',
          };
    if (name === 't3_thread_read')
      return { items: timeline, earlierPosition: null };
    throw new Error(`unexpected ${name}`);
  };
  return { call, calls, uploads };
}

function setup(files, bodies) {
  const dir = tempDir();
  const frame = replyV2Frame(1, { files });
  const verified = verifyReplyV2(frame, {
    secret: SECRET,
    machineId: 'skr-m4',
    now: NOW,
  });
  assert.equal(verified.ok, true);
  const objects = new Map(files.map((file, i) => [file.id, bodies[i]]));
  const store = fakeStore(STORE, objects, (url, init) => {
    if (url.startsWith(T3)) {
      store.t3Posts.push({ url, size: init.body.length });
      return new Response(null, { status: 204 });
    }
    return undefined;
  });
  store.t3Posts = [];
  return {
    frame,
    verified,
    store,
    spool: openSpool(path.join(dir, 'spool')),
    journal: createSendJournal(path.join(dir, 'journal.jsonl')),
    ledger: createLedger(path.join(dir, 'ledger.jsonl')),
  };
}

const options = (world, t3, now = () => NOW) => ({
  call: t3.call,
  journal: world.journal,
  bearerId: 'bearer-a',
  spool: world.spool,
  secret: SECRET,
  machineId: 'skr-m4',
  storeOrigin: STORE,
  t3Origin: T3,
  fetchImpl: world.store.fetchImpl,
  now,
});

test('stages every file, uploads over loopback only, and submits once', async () => {
  const bodies = [Buffer.from('first'), Buffer.from('second file')];
  const files = bodies.map((body, n) => manifestFile(n, body));
  const world = setup(files, bodies);
  const t3 = fakeT3();
  const receipt = await deliverBundle(world.verified, options(world, t3));
  assert.equal(receipt.messageId, 'm-1');
  const sends = t3.calls.filter((c) => c.name === 't3_thread_send_attachments');
  assert.equal(sends.length, 1);
  assert.equal(sends[0].args.threadId, world.frame.envelope.threadId);
  assert.match(sends[0].args.message, /^\[mm-reply /);
  assert.deepEqual(
    sends[0].args.attachments.map((a) => [a.type, a.mimeType, a.sizeBytes]),
    [
      ['file', 'text/plain', 5],
      ['file', 'text/plain', 11],
    ]
  );
  // Bytes went to the loopback server, never to the URL T3 suggested.
  assert.deepEqual(
    world.store.t3Posts.map((post) => new URL(post.url).origin),
    [T3, T3]
  );
  // The spool keeps the files until the outcome is recorded.
  assert.equal(world.spool.list(world.frame.envelope.id).length, 2);
  // A second call returns the journaled receipt without sending again.
  await deliverBundle(world.verified, options(world, t3));
  assert.equal(
    t3.calls.filter((c) => c.name === 't3_thread_send_attachments').length,
    1
  );
});

test('a file that does not match its manifest is never submitted', async () => {
  const bodies = [Buffer.from('first')];
  const files = [manifestFile(0, bodies[0])];
  const world = setup(files, [Buffer.from('fifth')]);
  const t3 = fakeT3();
  await assert.rejects(
    deliverBundle(world.verified, options(world, t3)),
    (error) =>
      error instanceof AttachmentError && error.code === 'attachment_invalid'
  );
  assert.equal(t3.calls.length, 0);
  assert.deepEqual(world.spool.list(), []);
});

test('after a crash mid-send it reconciles from the thread before any retry', async () => {
  const bodies = [Buffer.from('first')];
  const files = [manifestFile(0, bodies[0])];

  // Begun, then the process died: within the grace period it only waits.
  const world = setup(files, bodies);
  const id = world.frame.envelope.id;
  world.journal.claim(`mm-attach:${id}`, 'bearer-old', NOW - 10_000);
  const quiet = fakeT3();
  await assert.rejects(deliverBundle(world.verified, options(world, quiet)));
  assert.equal(quiet.calls.length, 0);

  // Past the grace period, a quoted marker (agent output, owner text) is
  // not the submission; T3's own MCP item for this bundle is.
  const later = () => NOW + 120_000;
  const marker = replyMarker(id, world.frame.envelope.textDigest);
  const quoted = fakeT3({
    timeline: [
      {
        text: `${marker} quoted`,
        creationSource: 'provider',
        messageId: 'm-8',
      },
      {
        text: `[mm-reply ${id}] other bundle`,
        creationSource: 'mcp',
        messageId: 'm-7',
      },
    ],
  });
  await assert.rejects(
    deliverBundle(world.verified, options(world, quoted, later)),
    (error) => error.code === 'attachment_ambiguous'
  );
  const landed = fakeT3({
    timeline: [
      {
        text: `${marker} Owner reply`,
        creationSource: 'mcp',
        messageId: 'm-9',
        runId: 'r-9',
      },
    ],
  });
  const receipt = await deliverBundle(
    world.verified,
    options(world, landed, later)
  );
  assert.equal(receipt.messageId, 'm-9');
  assert.deepEqual(
    landed.calls.map((c) => c.name),
    ['t3_thread_read']
  );

  // Not found: it fails for good and is never submitted a second time.
  const other = setup(files, bodies);
  other.journal.claim(
    `mm-attach:${other.frame.envelope.id}`,
    'bearer-old',
    NOW - 10_000
  );
  const empty = fakeT3();
  const ack = await handleReplyV2(other.frame, {
    secret: SECRET,
    machineId: 'skr-m4',
    ledger: other.ledger,
    now: later,
    deliver: (input) => deliverBundle(input, options(other, empty, later)),
    cleanup: (replyId) => other.spool.clear(replyId),
  });
  assert.deepEqual([ack.state, ack.code], ['failed', 'unavailable']);
  assert.ok(!empty.calls.some((c) => c.name === 't3_thread_send_attachments'));
  assert.ok(
    !empty.calls.some((c) => c.name === 't3_attachment_prepare_upload')
  );
});

test('refuses to run without a loopback T3 origin', async () => {
  const bodies = [Buffer.from('first')];
  const world = setup([manifestFile(0, bodies[0])], bodies);
  await assert.rejects(
    deliverBundle(world.verified, {
      ...options(world, fakeT3()),
      t3Origin: 'http://10.0.0.5:3773',
    }),
    (error) => error.code === 't3_not_running'
  );
});
