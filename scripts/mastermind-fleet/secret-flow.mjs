// The two Mastermind secret entry flows on the machine: pairing a phone and
// answering one secret request. Each is one process with one state
// (waiting, claimed, then exactly one outcome). Every answer is read from
// the publisher's spool for this request only and checked under the
// owner-key lock before it can claim the request.
// Design: apps/docs/build/devops/mastermind-secret-entry.mdx.
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { opaqueId } from './fleet-state.mjs';
import { writePrivateFile } from './private-files.mjs';
import { deliver } from './secret-deliver.mjs';
import { startHpke } from './secret-hpke-child.mjs';
import {
  addOwnerKey,
  audit,
  machineIdentity,
  machineKey,
  openSecretFiles,
  ownerKeys,
  readSpool,
  removeExpiredOpen,
  removeFiles,
  resolveOperation,
  spoolFiles,
  verifyPlatform,
  withOwnerKeysLock,
} from './secret-machine.mjs';
import {
  macEqual,
  machineMac,
  newPairingCode,
  ownerMac,
  pairingKey,
  parsePairingCode,
} from './secret-pairing.mjs';
import {
  ANSWER_DOMAIN,
  b64url,
  bindingBytes,
  decodeSecretPlaintext,
  fromB64url,
  ownerKeyId,
  ownerTranscript,
  requestCode,
  sealedShapeOk,
  sha256Hex,
  signerFingerprint,
  signOutcome,
  signRequest,
  verifyEd25519,
} from './secret-protocol.mjs';

export const EXIT = {
  ok: 0,
  commandFailed: 1,
  declined: 3,
  expired: 4,
  cancelled: 5,
  notDelivered: 6,
  refused: 64,
};
const OUTCOME_EXIT = {
  declined: EXIT.declined,
  expired: EXIT.expired,
  cancelled: EXIT.cancelled,
  failed: EXIT.notDelivered,
  paired: EXIT.ok,
};
const LABELS = {
  delivered: 'Delivered',
  failed: 'Failed',
  declined: 'Declined',
  expired: 'Expired',
  cancelled: 'Cancelled',
  paired: 'Paired',
};
export const MAX_OPEN_REQUESTS = 3;
const PAIR_TTL_MS = 10 * 60 * 1000;
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const KEY_ID = /^[0-9a-f]{32}$/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex24 = () => randomBytes(12).toString('hex');

function writeOpen(paths, decision) {
  writePrivateFile(
    path.join(paths.openDir, `${decision.id}.json`),
    `${JSON.stringify(decision, null, 2)}\n`
  );
}

function settle(paths, ctx, outcome, answerDigest = '') {
  removeFiles([path.join(paths.openDir, `${ctx.id}.json`)]);
  removeFiles(spoolFiles(paths, ctx.id));
  const now = ctx.now();
  writePrivateFile(
    path.join(paths.resolvedDir, `${ctx.id}.json`),
    `${JSON.stringify(
      {
        id: ctx.id,
        kind: 'secret',
        title: ctx.title,
        ...(['delivered', 'failed', 'declined', 'paired'].includes(outcome)
          ? { answeredVia: 'mobile' }
          : {}),
        outcome: LABELS[outcome],
        resolvedAt: new Date(now).toISOString(),
        secretOutcome: {
          outcome,
          answerDigest,
          sig: b64url(signOutcome(ctx.signer, ctx.id, outcome, answerDigest)),
        },
      },
      null,
      2
    )}\n`
  );
  audit(paths, ctx.id, outcome, new Date(now));
}

/**
 * Waits until `check(file)` returns a truthy claim for one spool file of
 * this request, `deadlineMs` passes, or `signal` aborts. Each file is read
 * once and removed. Returns `{ claim }`, `{ expired: true }` or
 * `{ cancelled: true }`.
 */
async function waitForClaim(paths, ctx, check) {
  for (;;) {
    if (ctx.signal?.aborted) return { cancelled: true };
    if (ctx.now() >= ctx.deadlineMs) return { expired: true };
    for (const file of spoolFiles(paths, ctx.id)) {
      const record = readSpool(file);
      removeFiles([file]);
      const claim = record ? check(record) : null;
      if (claim) return { claim };
    }
    await sleep(ctx.pollMs);
  }
}

export async function runPair({
  paths,
  now = () => Date.now(),
  pollMs = 1000,
  signal,
  checkPlatform = verifyPlatform,
  print = (line) => process.stdout.write(`${line}\n`),
}) {
  checkPlatform(paths);
  removeExpiredOpen(paths, now());
  const { machineId, machineLabel } = machineIdentity(paths);
  const { key: signer, publicKey } = machineKey(paths, { create: true });
  const pairingId = `pair-${hex24()}`;
  const codeBytes = randomBytes(10);
  const code = newPairingCode(codeBytes);
  const expiresAt = new Date(now() + PAIR_TTL_MS).toISOString();
  const fields = {
    pairingId,
    machineId,
    machineLabel,
    signerKey: b64url(publicKey),
    expiresAt,
  };
  const key = pairingKey(parsePairingCode(code), pairingId);
  codeBytes.fill(0);
  writeOpen(paths, {
    id: pairingId,
    kind: 'secret',
    title: `Pair ${machineLabel}`,
    urgency: 'high',
    createdAt: new Date(now()).toISOString(),
    deadlineAt: expiresAt,
    secret: {
      mode: 'pair',
      v: '1',
      ...fields,
      machineMac: b64url(machineMac(key, fields)),
    },
  });
  print(`Pairing code: ${code}`);
  print(`Machine key: ${signerFingerprint(publicKey)}`);
  print(
    'Give this code to the owner through T3 or a terminal, never through Mastermind.'
  );
  print(`It expires at ${expiresAt}.`);
  const ctx = {
    id: pairingId,
    title: `Pair ${machineLabel}`,
    signer,
    now,
    pollMs,
    signal,
    deadlineMs: Date.parse(expiresAt),
  };
  try {
    const result = await waitForClaim(paths, ctx, (record) => {
      if (record.action !== 'pair') return null;
      const ownerKey = fromB64url(record.pair?.ownerKey, 32);
      const mac = fromB64url(record.pair?.ownerMac, 32);
      if (!ownerKey || !mac) return null;
      if (
        !macEqual(
          ownerMac(key, { ...fields, ownerKey: record.pair.ownerKey }),
          mac
        )
      )
        return null;
      return withOwnerKeysLock(paths, () =>
        addOwnerKey(paths, ownerKey, new Date(now()))
      );
    });
    const outcome = result.claim
      ? 'paired'
      : result.expired
        ? 'expired'
        : 'cancelled';
    settle(paths, ctx, outcome, result.claim ?? '');
    print(
      outcome === 'paired'
        ? `Paired owner key ${result.claim}.`
        : `Pairing ${outcome}.`
    );
    return OUTCOME_EXIT[outcome];
  } finally {
    key.fill(0);
  }
}

/**
 * Verifies a spool record against this request. Returns the claim, or null
 * for anything not signed by an owner key enrolled now and in `audience`,
 * signed after `expiresAt`, or seen after `expiresAt` on this clock.
 */
export function checkAnswer(paths, request, record, nowMs) {
  const owner = record.owner;
  const publicKey = fromB64url(owner?.publicKey, 32);
  const sig = fromB64url(owner?.sig, 64);
  if (!publicKey || !sig || !KEY_ID.test(owner?.keyId ?? '')) return null;
  if (owner.keyId !== ownerKeyId(publicKey)) return null;
  if (!request.audience.split(',').includes(owner.keyId)) return null;
  const expiresMs = Date.parse(request.expiresAt);
  if (
    !ISO_MS.test(owner.signedAt ?? '') ||
    Date.parse(owner.signedAt) > expiresMs
  )
    return null;
  if (nowMs >= expiresMs) return null;
  let enc = '';
  let ct = '';
  if (record.action === 'secret') {
    const encBytes = fromB64url(record.sealed?.enc, 32);
    const ctBytes = fromB64url(record.sealed?.ct);
    if (!encBytes || !ctBytes || !sealedShapeOk(encBytes, ctBytes)) return null;
    ({ enc, ct } = record.sealed);
  } else if (record.action !== 'decline') {
    return null;
  }
  const transcript = ownerTranscript(request, {
    action: record.action,
    enc,
    ct,
    signedAt: owner.signedAt,
    keyId: owner.keyId,
  });
  if (!verifyEd25519(publicKey, transcript, sig)) return null;
  const enrolled = ownerKeys(paths).some(
    (entry) => entry.id === owner.keyId && entry.publicKey.equals(publicKey)
  );
  if (!enrolled) return null;
  return { action: record.action, enc, ct, digest: sha256Hex(transcript) };
}

export async function runRequest({
  paths,
  operationId,
  extra = [],
  ttlMs,
  threadId = process.env.T3CODE_THREAD_ID,
  now = () => Date.now(),
  pollMs = 1000,
  signal,
  checkPlatform = verifyPlatform,
  spawn,
  env = process.env,
  print = (line) => process.stderr.write(`${line}\n`),
}) {
  const helper = checkPlatform(paths);
  removeExpiredOpen(paths, now());
  const { machineId } = machineIdentity(paths);
  const { key: signer, publicKey: signerKey } = machineKey(paths);
  const owners = ownerKeys(paths);
  if (!owners.length) throw new Error('secret_not_paired');
  const op = resolveOperation(paths, operationId, extra);
  const requests = openSecretFiles(paths).filter((name) =>
    name.startsWith('secret-')
  );
  if (requests.length >= MAX_OPEN_REQUESTS) throw new Error('secret_too_many');
  const maxTtl = op.maxTtlMinutes * 60_000;
  const ttl = Math.min(Math.max(ttlMs ?? 10 * 60_000, 60_000), maxTtl);
  const hpke = startHpke(helper, spawn ? { spawn } : undefined);
  try {
    const publicKey = await hpke.publicKey;
    const request = {
      v: '1',
      requestId: `secret-${hex24()}`,
      machineId,
      requester: threadId ? opaqueId('lane', threadId) : 'terminal',
      operation: op.id,
      command: op.command,
      output: op.output,
      purpose: op.purpose,
      expiresAt: new Date(now() + ttl).toISOString(),
      publicKey: b64url(publicKey),
      signerKey: b64url(signerKey),
      audience: owners
        .map((entry) => entry.id)
        .sort()
        .join(','),
    };
    const ctx = {
      id: request.requestId,
      title: op.purpose,
      signer,
      now,
      pollMs,
      signal,
      deadlineMs: Date.parse(request.expiresAt),
    };
    writeOpen(paths, {
      id: request.requestId,
      kind: 'secret',
      title: op.purpose,
      urgency: 'high',
      createdAt: new Date(now()).toISOString(),
      deadlineAt: request.expiresAt,
      secret: {
        mode: 'request',
        ...request,
        sig: b64url(signRequest(signer, request)),
      },
    });
    audit(paths, request.requestId, 'requested', new Date(now()));
    print(
      `Request ${requestCode(request)}: ${op.purpose}. Answer on Mastermind before ${request.expiresAt}.`
    );

    const result = await waitForClaim(paths, ctx, (record) =>
      withOwnerKeysLock(paths, () => checkAnswer(paths, request, record, now()))
    );
    if (!result.claim) {
      hpke.kill();
      const outcome = result.expired ? 'expired' : 'cancelled';
      settle(paths, ctx, outcome);
      return OUTCOME_EXIT[outcome];
    }
    const { claim } = result;
    if (claim.action === 'decline') {
      hpke.kill();
      settle(paths, ctx, 'declined', claim.digest);
      return EXIT.declined;
    }
    let plaintext;
    let delivered = false;
    let exit = Promise.resolve(1);
    try {
      plaintext = await hpke.open(
        Buffer.from(claim.enc, 'base64url'),
        Buffer.from(claim.ct, 'base64url'),
        bindingBytes(ANSWER_DOMAIN, request)
      );
      const value = decodeSecretPlaintext(plaintext);
      const run = deliver(op, value, { ...(spawn ? { spawn } : {}), env });
      delivered = await run.delivered;
      exit = run.exit;
    } catch {
      delivered = false;
    } finally {
      plaintext?.fill(0);
      hpke.kill();
    }
    settle(paths, ctx, delivered ? 'delivered' : 'failed', claim.digest);
    if (!delivered) return EXIT.notDelivered;
    return (await exit) === 0 ? EXIT.ok : EXIT.commandFailed;
  } catch (error) {
    hpke.kill();
    throw error;
  }
}
