import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { EXIT, runPair, runRequest } from './secret-flow.mjs';
import {
  ownerKeys,
  revokeOwnerKey,
  verifyPlatform,
  withOwnerKeysLock,
} from './secret-machine.mjs';
import { ownerMac, pairingKey, parsePairingCode } from './secret-pairing.mjs';
import {
  ANSWER_DOMAIN,
  b64url,
  bindingBytes,
  fromB64url,
  outcomeBytes,
  ownerKeyId,
  ownerTranscript,
  rawPublicKey,
  sha256Hex,
  verifyEd25519,
  verifyRequest,
} from './secret-protocol.mjs';
import {
  anotherOwner,
  auditLines,
  makeWorld,
  openDecision,
  resolved,
  signedAnswer,
  TEST_VALUE,
  writeSpool,
} from './secret-test-world.mjs';

let world;
afterEach(() => world?.cleanup());

const start = (overrides = {}) =>
  runRequest({
    paths: world.paths,
    operationId: 'test-stdin',
    checkPlatform: () => world.helper,
    pollMs: 10,
    threadId: 'thread-under-test',
    print: () => {},
    ...overrides,
  });

function verifyOutcome(paths, id, outcome, digest) {
  const record = resolved(paths, id);
  assert.equal(record.secretOutcome.outcome, outcome);
  assert.equal(record.secretOutcome.answerDigest, digest);
  return record;
}

test('a signed answer is opened and handed only to the command, then everything is cleaned up', async () => {
  world = makeWorld();
  const run = start();
  const decision = await openDecision(world.paths);
  const { mode, sig, ...request } = decision.secret;
  assert.equal(mode, 'request');
  assert.equal(decision.id, request.requestId);
  assert.equal(verifyRequest(request, fromB64url(sig, 64)), true);
  assert.match(request.requester, /^lane-[0-9a-f]{16}$/);
  assert.equal(request.output, 'withheld');
  assert.equal(request.audience, ownerKeyId(world.ownerRaw));
  assert.equal(
    fs.statSync(path.join(world.paths.openDir, `${decision.id}.json`)).mode &
      0o777,
    0o600
  );

  const answer = signedAnswer(request, world.owner);
  writeSpool(world.paths, decision.id, 1, answer);
  assert.equal(await run, EXIT.ok);

  assert.equal(fs.readFileSync(world.received, 'utf8'), `${TEST_VALUE}\n`);
  const seen = JSON.parse(fs.readFileSync(`${world.helper}.seen`, 'utf8'));
  assert.deepEqual(
    Buffer.from(seen.aad, 'base64url'),
    bindingBytes(ANSWER_DOMAIN, request)
  );
  const digest = sha256Hex(
    ownerTranscript(request, {
      action: 'secret',
      enc: answer.sealed.enc,
      ct: answer.sealed.ct,
      signedAt: answer.owner.signedAt,
      keyId: answer.owner.keyId,
    })
  );
  const record = verifyOutcome(world.paths, decision.id, 'delivered', digest);
  assert.equal(record.outcome, 'Written to command');
  assert.equal(
    verifyEd25519(
      fromB64url(request.signerKey, 32),
      outcomeBytes(decision.id, 'delivered', digest),
      fromB64url(record.secretOutcome.sig, 64)
    ),
    true
  );
  assert.deepEqual(fs.readdirSync(world.paths.openDir), []);
  assert.deepEqual(fs.readdirSync(world.paths.answersDir), []);
  const lines = auditLines(world.paths);
  assert.deepEqual(
    lines.map((l) => l.outcome),
    ['requested', 'delivered']
  );
  for (const line of lines)
    assert.deepEqual(Object.keys(line).sort(), ['at', 'outcome', 'requestId']);
  assert.equal(
    fs.readFileSync(world.paths.auditFile, 'utf8').includes(TEST_VALUE),
    false
  );
});

test('fd3 delivery writes the value on descriptor 3 without a newline', async () => {
  world = makeWorld();
  const run = start({ operationId: 'test-fd3' });
  const { secret } = await openDecision(world.paths);
  const { mode: _m, sig: _s, ...request } = secret;
  writeSpool(
    world.paths,
    request.requestId,
    1,
    signedAnswer(request, world.owner)
  );
  assert.equal(await run, EXIT.ok);
  assert.equal(fs.readFileSync(world.received, 'utf8'), TEST_VALUE);
});

test('a command that fails after receiving the value exits 1, still delivered', async () => {
  world = makeWorld();
  const run = start({ operationId: 'test-fail' });
  const { secret } = await openDecision(world.paths);
  const { mode: _m, sig: _s, ...request } = secret;
  writeSpool(
    world.paths,
    request.requestId,
    1,
    signedAnswer(request, world.owner)
  );
  assert.equal(await run, EXIT.commandFailed);
  assert.equal(
    resolved(world.paths, request.requestId).secretOutcome.outcome,
    'delivered'
  );
});

test('unsigned, foreign, revoked and late answers can neither answer nor cancel', async () => {
  world = makeWorld();
  const now = Date.now();
  const controller = new AbortController();
  const run = start({ ttlMs: 60_000, signal: controller.signal });
  const { secret } = await openDecision(world.paths);
  const { mode: _m, sig: _s, ...request } = secret;
  const id = request.requestId;
  const good = signedAnswer(request, world.owner);
  writeSpool(world.paths, id, 1, {
    ...good,
    owner: { ...good.owner, sig: b64url(Buffer.alloc(64)) },
  });
  writeSpool(
    world.paths,
    id,
    2,
    signedAnswer(request, world.owner, { signWith: anotherOwner() })
  );
  const stranger = anotherOwner();
  writeSpool(world.paths, id, 3, signedAnswer(request, stranger));
  writeSpool(
    world.paths,
    id,
    4,
    signedAnswer(request, world.owner, {
      signedAt: new Date(now + 3_600_000).toISOString(),
    })
  );
  writeSpool(world.paths, id, 5, {
    ...signedAnswer(request, world.owner, { action: 'decline' }),
    action: 'approve',
  });
  writeSpool(world.paths, id, 6, {
    ...good,
    sealed: { enc: good.sealed.enc, ct: b64url(Buffer.alloc(100)) },
  });
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.ok(
    fs.existsSync(path.join(world.paths.openDir, `${id}.json`)),
    'request still open'
  );
  assert.deepEqual(fs.readdirSync(world.paths.answersDir), []);
  // Revoked before the claim: refused even though it is in the audience.
  withOwnerKeysLock(world.paths, () =>
    revokeOwnerKey(world.paths, ownerKeyId(world.ownerRaw))
  );
  writeSpool(world.paths, id, 7, good);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(fs.existsSync(path.join(world.paths.openDir, `${id}.json`)));
  assert.equal(fs.existsSync(world.received), false);
  controller.abort();
  assert.equal(await run, EXIT.cancelled);
  assert.equal(fs.existsSync(world.received), false);
});

test('expiry with no valid answer destroys the key and reports expired', async () => {
  world = makeWorld();
  let clock = Date.now();
  const run = start({ now: () => clock });
  const { secret } = await openDecision(world.paths);
  const { mode: _m, sig: _s, ...request } = secret;
  clock = Date.parse(request.expiresAt);
  // A valid answer that only arrives at the deadline does not count.
  writeSpool(
    world.paths,
    request.requestId,
    1,
    signedAnswer(request, world.owner)
  );
  assert.equal(await run, EXIT.expired);
  assert.equal(
    resolved(world.paths, request.requestId).secretOutcome.outcome,
    'expired'
  );
  assert.equal(
    resolved(world.paths, request.requestId).secretOutcome.answerDigest,
    ''
  );
  assert.equal(fs.existsSync(world.received), false);
  assert.deepEqual(fs.readdirSync(world.paths.openDir), []);
});

test('a signed decline ends the request; a cancel while waiting withdraws it', async () => {
  world = makeWorld();
  let run = start();
  let { secret } = await openDecision(world.paths);
  let { mode: _m, sig: _s, ...request } = secret;
  writeSpool(
    world.paths,
    request.requestId,
    1,
    signedAnswer(request, world.owner, { action: 'decline' })
  );
  assert.equal(await run, EXIT.declined);
  assert.equal(
    resolved(world.paths, request.requestId).secretOutcome.outcome,
    'declined'
  );

  const controller = new AbortController();
  run = start({ signal: controller.signal });
  ({ secret } = await openDecision(world.paths));
  ({ mode: _m, sig: _s, ...request } = secret);
  controller.abort();
  assert.equal(await run, EXIT.cancelled);
  assert.equal(
    resolved(world.paths, request.requestId).secretOutcome.outcome,
    'cancelled'
  );
  assert.equal(fs.existsSync(world.received), false);
});

test('only the first valid answer is used', async () => {
  world = makeWorld();
  const run = start();
  const { secret } = await openDecision(world.paths);
  const { mode: _m, sig: _s, ...request } = secret;
  writeSpool(
    world.paths,
    request.requestId,
    1,
    signedAnswer(request, world.owner, { action: 'decline' })
  );
  writeSpool(
    world.paths,
    request.requestId,
    2,
    signedAnswer(request, world.owner)
  );
  assert.equal(await run, EXIT.declined);
  assert.equal(fs.existsSync(world.received), false);
  assert.deepEqual(fs.readdirSync(world.paths.answersDir), []);
});

test('a box the helper cannot open is not delivered', async () => {
  world = makeWorld();
  // The stub reads its config when it starts: make it expect another box.
  const helperConfig = `${world.helper}.json`;
  const config = JSON.parse(fs.readFileSync(helperConfig, 'utf8'));
  fs.writeFileSync(
    helperConfig,
    JSON.stringify({ ...config, ct: 'something-else' })
  );
  const run = start();
  const { secret } = await openDecision(world.paths);
  const { mode: _m, sig: _s, ...request } = secret;
  writeSpool(
    world.paths,
    request.requestId,
    1,
    signedAnswer(request, world.owner)
  );
  assert.equal(await run, EXIT.notDelivered);
  assert.equal(
    resolved(world.paths, request.requestId).secretOutcome.outcome,
    'failed'
  );
  assert.equal(fs.existsSync(world.received), false);
});

test('requests are refused before asking when unpaired, over the cap, or for unknown operations', async () => {
  world = makeWorld();
  await assert.rejects(start({ operationId: 'nope' }), /secret_operation/);
  await assert.rejects(start({ extra: ['x'] }), /secret_operation_args/);
  withOwnerKeysLock(world.paths, () =>
    revokeOwnerKey(world.paths, ownerKeyId(world.ownerRaw))
  );
  await assert.rejects(start(), /secret_not_paired/);
  assert.deepEqual(fs.readdirSync(world.paths.openDir), []);
});

test('pairing enrols exactly the owner key whose MAC proves the code', async () => {
  world = makeWorld();
  withOwnerKeysLock(world.paths, () =>
    revokeOwnerKey(world.paths, ownerKeyId(world.ownerRaw))
  );
  const printed = [];
  const run = runPair({
    paths: world.paths,
    checkPlatform: () => world.helper,
    pollMs: 10,
    print: (line) => printed.push(line),
  });
  const decision = await openDecision(world.paths, 'pair-');
  const code = printed.find((l) => l.startsWith('Pairing code: ')).slice(14);
  assert.match(code, /^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);
  assert.equal(JSON.stringify(decision).includes(code), false);
  const { mode, v: _v, machineMac: _mac, ...fields } = decision.secret;
  assert.equal(mode, 'pair');
  const key = pairingKey(parsePairingCode(code), fields.pairingId);
  const wrongKey = pairingKey(Buffer.alloc(10), fields.pairingId);
  const ownerKey = b64url(world.ownerRaw);
  const reply = (k, keyText) => ({
    action: 'pair',
    pair: {
      ownerKey: keyText,
      ownerMac: b64url(ownerMac(k, { ...fields, ownerKey: keyText })),
    },
  });
  const forged = b64url(rawPublicKey(anotherOwner()));
  writeSpool(world.paths, decision.id, 1, reply(wrongKey, forged));
  writeSpool(world.paths, decision.id, 2, reply(key, ownerKey));
  assert.equal(await run, EXIT.ok);
  assert.deepEqual(
    ownerKeys(world.paths).map((k) => k.id),
    [ownerKeyId(world.ownerRaw)]
  );
  const record = resolved(world.paths, decision.id);
  assert.equal(record.secretOutcome.outcome, 'paired');
  assert.equal(record.secretOutcome.answerDigest, ownerKeyId(world.ownerRaw));
  assert.equal(fs.statSync(world.paths.ownerKeysFile).mode & 0o777, 0o600);
  assert.equal(fs.statSync(world.paths.machineKeyFile).mode & 0o777, 0o600);
});

test('the platform check fails closed and never runs an unverified helper', () => {
  world = makeWorld();
  const ran = [];
  const runVersion = (file) => {
    ran.push(file);
    return '{"protocol":"1"}';
  };
  const ok = {
    platform: 'darwin',
    productVersion: () => '14.6.1\n',
    runVersion,
  };
  fs.chmodSync(world.paths.root, 0o700);
  fs.chmodSync(world.paths.binDir, 0o700);
  assert.throws(
    () => verifyPlatform(world.paths, { ...ok, platform: 'linux' }),
    /secret_unsupported_os/
  );
  assert.throws(
    () => verifyPlatform(world.paths, { ...ok, productVersion: () => '13.7' }),
    /secret_unsupported_os/
  );
  assert.throws(() => verifyPlatform(world.paths, ok), /secret_helper_missing/);
  const digest = createHash('sha256')
    .update(fs.readFileSync(world.helper))
    .digest('hex');
  fs.writeFileSync(world.paths.helperDigestFile, `${'0'.repeat(64)}\n`, {
    mode: 0o600,
  });
  assert.throws(
    () => verifyPlatform(world.paths, ok),
    /secret_helper_mismatch/
  );
  assert.deepEqual(ran, [], 'helper never ran before its digest matched');
  fs.writeFileSync(world.paths.helperDigestFile, `${digest}\n`);
  fs.chmodSync(world.helper, 0o722);
  assert.throws(() => verifyPlatform(world.paths, ok), /secret_helper_missing/);
  fs.chmodSync(world.helper, 0o700);
  assert.equal(verifyPlatform(world.paths, ok), world.helper);
  assert.deepEqual(ran, [world.helper]);
  assert.throws(
    () =>
      verifyPlatform(world.paths, {
        ...ok,
        runVersion: () => '{"protocol":"2"}',
      }),
    /secret_helper_mismatch/
  );
  const link = `${world.helper}-link`;
  fs.renameSync(world.helper, link);
  fs.symlinkSync(link, world.helper);
  assert.throws(() => verifyPlatform(world.paths, ok), /secret_helper_missing/);
});
