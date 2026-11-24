import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  BRIDGE_ATTACHMENT_CAPABILITY,
  bridgeMachineFrameSchema,
} from '../../packages/utils/src/mastermind-store/bridge-protocol.ts';
import {
  ATTACHMENT_CAPABILITY as WEB_CAPABILITY,
  BRIDGE_BUNDLE_DOMAIN,
  BRIDGE_FETCH_DOMAIN,
  BRIDGE_FETCH_KEY_INFO,
  BRIDGE_REPLY_V2_DOMAIN,
  BRIDGE_BUNDLE_KEY_INFO,
  BRIDGE_SEAL_KEY_INFO_V2,
  bridgeReplyV2SigningString,
} from '../../packages/utils/src/mastermind-store/reply-attachments.ts';
import {
  ATTACHMENT_CAPABILITY,
  attachmentMessage,
  BUNDLE_DOMAIN,
  BUNDLE_KEY_INFO,
  FETCH_DOMAIN,
  FETCH_KEY_INFO,
  fetchCapability,
  handleReplyV2,
  REPLY_V2_DOMAIN,
  replyV2SigningString,
  SEAL_KEY_INFO_V2,
  verifyReplyV2,
} from './bridge-attach.mjs';
import { manifestFile, replyV2Frame } from './bridge-attach-test-fixture.mjs';
import { createLedger, handleReply } from './bridge-core.mjs';
import { NOW, SECRET, tempDir } from './bridge-test-fixture.mjs';

const text = (value) => Buffer.from(value, 'utf8');

function harness(deliver) {
  const dir = tempDir();
  const calls = [];
  const cleaned = [];
  const clock = { now: NOW };
  const deps = {
    secret: SECRET,
    machineId: 'skr-m4',
    ledger: createLedger(path.join(dir, 'bridge-replies.jsonl')),
    deliver: async (input) => {
      calls.push(input);
      return deliver ? deliver(input) : { delivery: 'steered' };
    },
    cleanup: (id) => cleaned.push(id),
    now: () => clock.now,
    firstSeen: new Map(),
  };
  return { deps, calls, cleaned, clock };
}

test('the machine and Web agree on the v2 labels, signed bytes and capability', () => {
  assert.equal(ATTACHMENT_CAPABILITY, WEB_CAPABILITY);
  assert.equal(ATTACHMENT_CAPABILITY, BRIDGE_ATTACHMENT_CAPABILITY);
  assert.equal(REPLY_V2_DOMAIN, BRIDGE_REPLY_V2_DOMAIN);
  assert.equal(BUNDLE_DOMAIN, BRIDGE_BUNDLE_DOMAIN);
  assert.equal(SEAL_KEY_INFO_V2, BRIDGE_SEAL_KEY_INFO_V2);
  assert.equal(BUNDLE_KEY_INFO, BRIDGE_BUNDLE_KEY_INFO);
  assert.equal(FETCH_DOMAIN, BRIDGE_FETCH_DOMAIN);
  assert.equal(FETCH_KEY_INFO, BRIDGE_FETCH_KEY_INFO);
  const frame = replyV2Frame(1, { files: [manifestFile(1, text('hello'))] });
  assert.equal(
    replyV2SigningString(frame.envelope),
    bridgeReplyV2SigningString(frame.envelope)
  );
  const verified = verifyReplyV2(frame, {
    secret: SECRET,
    machineId: 'skr-m4',
    now: NOW,
  });
  assert.equal(verified.ok, true);
  assert.equal(verified.files[0].name, 'notes-1.txt');
});

test('a reply signed for one machine or thread never verifies anywhere else', () => {
  const files = [manifestFile(1, text('hello'))];
  const frame = replyV2Frame(1, { files });
  const deps = { secret: SECRET, now: NOW };
  // Another machine with the same fleet secret refuses it.
  assert.equal(
    verifyReplyV2(frame, { ...deps, machineId: 'skr-m3' }).code,
    'bad_signature'
  );
  // The same files moved to another thread, or object list, break the HMAC.
  for (const envelope of [
    { ...frame.envelope, threadId: 'thread:other' },
    { ...frame.envelope, objects: [manifestFile(2, text('x')).id] },
  ])
    assert.equal(
      verifyReplyV2({ ...frame, envelope }, { ...deps, machineId: 'skr-m4' })
        .code,
      'bad_signature'
    );
  // A sealed manifest lifted from another reply does not open under this id.
  const other = replyV2Frame(2, { files });
  assert.equal(
    verifyReplyV2(
      { ...frame, envelope: { ...frame.envelope, box: other.envelope.box } },
      { ...deps, machineId: 'skr-m4' }
    ).code,
    'bad_signature'
  );
});

test('each machine derives its own fetch capability for an object', () => {
  const input = {
    replyId: replyV2Frame(1, { files: [manifestFile(1, text('a'))] }).envelope
      .id,
    objectId: manifestFile(1, text('a')).id,
    sha256: manifestFile(1, text('a')).sha256,
  };
  assert.notEqual(
    fetchCapability(SECRET, { ...input, machineId: 'skr-m4' }),
    fetchCapability(SECRET, { ...input, machineId: 'skr-m3' })
  );
});

test('a repeated reply id with other files never collects the first receipt', async () => {
  const { deps, calls } = harness();
  const first = replyV2Frame(1, { files: [manifestFile(1, text('one'))] });
  const firstAck = await handleReplyV2(first, deps);
  assert.equal(firstAck.state, 'delivered');
  const swapped = replyV2Frame(1, { files: [manifestFile(2, text('two'))] });
  assert.notEqual(swapped.envelope.textDigest, first.envelope.textDigest);
  const ack = await handleReplyV2(swapped, deps);
  assert.deepEqual([ack.state, ack.code], ['failed', 'bad_signature']);
  // The same bundle replays the first answer without delivering again.
  assert.deepEqual(await handleReplyV2(first, deps), firstAck);
  assert.equal(calls.length, 1);
});

test('a v1 bridge refuses a v2 reply with a closed code, never as text', async () => {
  const frame = replyV2Frame(1, { files: [manifestFile(1, text('one'))] });
  const dir = tempDir();
  const steered = [];
  const ack = await handleReply(frame, {
    secret: SECRET,
    machineId: 'skr-m4',
    ledger: createLedger(path.join(dir, 'ledger.jsonl')),
    steer: async (input) => steered.push(input),
    now: () => NOW,
  });
  assert.deepEqual([ack.state, ack.code], ['failed', 'bad_signature']);
  assert.equal(steered.length, 0);
  // Relabelled as v1, the v2 envelope still fails the closed v1 shape.
  const relabelled = await handleReply(
    { ...frame, v: 1 },
    {
      secret: SECRET,
      machineId: 'skr-m4',
      ledger: createLedger(path.join(dir, 'ledger2.jsonl')),
      steer: async (input) => steered.push(input),
      now: () => NOW,
    }
  );
  assert.equal(relabelled.state, 'failed');
  assert.equal(steered.length, 0);
});

test('outcomes settle with closed codes, and spool cleanup follows the record', async () => {
  const { AttachmentError } = await import('./attachment-spool.mjs');
  const cases = [
    [new AttachmentError('attachment_invalid'), 'attachment_invalid'],
    [new AttachmentError('attachment_ambiguous'), 'unavailable'],
    [
      Object.assign(new Error('x'), {
        code: 't3_tool_error',
        detail: 'Thread was not found',
      }),
      'unknown_thread',
    ],
  ];
  for (const [index, [error, code]] of cases.entries()) {
    const { deps, cleaned } = harness(() => {
      throw error;
    });
    const frame = replyV2Frame(10 + index, {
      files: [manifestFile(1, text('x'))],
    });
    const ack = await handleReplyV2(frame, deps);
    assert.deepEqual([ack.state, ack.code], ['failed', code]);
    assert.deepEqual(cleaned, [frame.envelope.id]);
  }
  // A transient failure keeps the spool and waits for a retry.
  const { deps, cleaned, clock } = harness(() => {
    throw new Error('t3 restarting');
  });
  const frame = replyV2Frame(20, { files: [manifestFile(1, text('x'))] });
  assert.equal(await handleReplyV2(frame, deps), null);
  assert.deepEqual(cleaned, []);
  clock.now += 11 * 60 * 1000;
  assert.equal((await handleReplyV2(frame, deps)).code, 'unavailable');
  assert.deepEqual(cleaned, [frame.envelope.id]);
});

test('the byte budget refuses past the hourly limit', async () => {
  const { deps } = harness();
  const big = () =>
    Array.from({ length: 2 }, (_, n) =>
      manifestFile(n, Buffer.alloc(1), { size: 10 * 1024 * 1024 })
    );
  let refused = 0;
  for (let n = 0; n < 12; n++) {
    const ack = await handleReplyV2(
      replyV2Frame(100 + n, { threadId: `thread:${n}`, files: big() }),
      deps
    );
    if (ack.code === 'rate_limited') refused++;
  }
  assert.ok(refused >= 2);
});

test('the T3 message carries the reply marker first and treats files as data', () => {
  const message = attachmentMessage(
    '00000000-0000-4000-8000-000000000001',
    'ab'.repeat(32),
    'Look at this',
    [
      manifestFile(1, text('x'), { name: '../a‮b.txt' }),
      manifestFile(2, text('y'), {
        kind: 'image',
        mime: 'image/webp',
        name: 'shot.webp',
        size: 2 * 1024 * 1024,
      }),
    ]
  );
  const [first, second, , body] = message.split('\n');
  assert.match(
    first,
    /^\[mm-reply 00000000-0000-4000-8000-000000000001 abababababababab\] /
  );
  assert.match(first, /\.\.ab\.txt|ab\.txt/);
  assert.doesNotMatch(first, /[‮/]/);
  assert.match(second, /data/);
  assert.equal(body, 'Look at this');
  fs.rmSync(tempDir(), { recursive: true, force: true });
});

test('no v1 text digest can equal a v2 bundle digest', async () => {
  const { textDigest } = await import('./bridge-core.mjs');
  const { bundleString } = await import('./bridge-attach.mjs');
  const frame = replyV2Frame(1, { files: [manifestFile(1, text('one'))] });
  const payload = verifyReplyV2(frame, {
    secret: SECRET,
    machineId: 'skr-m4',
    now: NOW,
  });
  // A v1 reply whose text is exactly the bundle bytes digests under another key.
  assert.notEqual(
    textDigest(SECRET, bundleString(frame.envelope, payload)),
    frame.envelope.textDigest
  );
});

test('a hello may name unknown capabilities, within bounds', () => {
  const hello = (caps) =>
    bridgeMachineFrameSchema.safeParse({ v: 1, t: 'hello', caps }).success;
  assert.equal(hello([ATTACHMENT_CAPABILITY, 'future-cap.v3']), true);
  assert.equal(hello(Array.from({ length: 9 }, (_, n) => `cap-${n}`)), false);
  assert.equal(hello(['x'.repeat(49)]), false);
  assert.equal(hello(['Bad Cap']), false);
});
