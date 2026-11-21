// Reply handling of the Mastermind fleet bridge, without any I/O of its own:
// verify a reply Web signed, open its sealed text, refuse replays, apply the
// local rate limit, hand it to the steer helper and answer with a signed
// receipt from a closed set. The daemon (bridge.mjs) feeds it frames from the
// bridge socket.
// Wire contract: packages/utils/src/mastermind-store/bridge-protocol.ts
// (bridge.test.mjs keeps the signed bytes and labels identical to it).
import {
  createDecipheriv,
  createHmac,
  createPrivateKey,
  hkdfSync,
  sign,
  timingSafeEqual,
} from 'node:crypto';
import {
  appendPrivateLine,
  readPrivateFile,
  writePrivateFile,
} from './private-files.mjs';

export const BRIDGE_PROTOCOL_VERSION = 1;
export const BRIDGE_SUBPROTOCOL = 'mm-bridge.v1';
export const REPLY_DOMAIN = 'mastermind-fleet-reply-v1';
export const ACK_DOMAIN = 'mastermind-fleet-ack-v1';
export const SEAL_KEY_INFO = 'mastermind-fleet-reply-enc-v1';
export const DIGEST_KEY_INFO = 'mastermind-fleet-reply-digest-v1';
export const ACK_KEY_INFO = 'mastermind-fleet-ack-sign-v1';
/** PKCS#8 wrapping of a raw 32-byte Ed25519 seed. */
const ED25519_PKCS8_PREFIX = Buffer.from(
  '302e020100300506032b657004220420',
  'hex'
);
const MAX_TEXT_CHARS = 4000;
const MAX_LIFETIME_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const PER_THREAD_PER_MINUTE = 6;
const PER_HOUR = 60;
/** A reply the local T3 server cannot take yet is retried this long. */
export const RETRY_WINDOW_MS = 10 * 60 * 1000;
const LEDGER_KEEP = 5000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MACHINE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
// Never a leading dash: these travel on as T3 identifiers.
const THREAD_ID = /^[\w:%.][\w:%.-]{0,399}$/;
const ENVIRONMENT_ID = /^\w[\w-]{0,99}$/;
const SIGNATURE = /^[0-9a-f]{64}$/;
const SEAL_IV = /^[\w-]{16}$/;
const SEAL_DATA = /^[\w-]{23,22000}$/;
const ENVELOPE_KEYS = new Set([
  'id',
  'machineId',
  'environmentId',
  'threadId',
  'box',
  'textDigest',
  'actorId',
  'issuedAt',
  'expiresAt',
]);

const derive = (secret, info) =>
  Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), info, 32));

/** Keyed digest of a reply text: the audit hash, useless without the secret. */
export const textDigest = (secret, text) =>
  createHmac('sha256', derive(secret, DIGEST_KEY_INFO))
    .update(text, 'utf8')
    .digest('hex');

/** The bytes Web signs for a reply; identical to `bridgeReplySigningString`. */
export function replySigningString(envelope) {
  return [
    REPLY_DOMAIN,
    envelope.id,
    envelope.machineId,
    envelope.environmentId ?? '',
    envelope.threadId,
    envelope.actorId,
    String(envelope.issuedAt),
    String(envelope.expiresAt),
    envelope.textDigest,
  ].join('\n');
}

/** The bytes this machine signs for an acknowledgement; see `bridgeAckSigningString`. */
export function ackSigningString(ack) {
  return [
    ACK_DOMAIN,
    ack.id,
    ack.machineId,
    ack.state,
    ack.delivery ?? '',
    ack.code ?? '',
    ack.textDigest,
  ].join('\n');
}

const sameBytes = (a, b) => a.length === b.length && timingSafeEqual(a, b);
const isTime = (value) => Number.isSafeInteger(value) && value >= 0;

function openText(secret, envelope) {
  const data = Buffer.from(envelope.box.data, 'base64url');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    derive(secret, SEAL_KEY_INFO),
    Buffer.from(envelope.box.iv, 'base64url')
  );
  decipher.setAAD(Buffer.from(`${envelope.id}\n${envelope.machineId}`, 'utf8'));
  decipher.setAuthTag(data.subarray(data.length - 16));
  return Buffer.concat([
    decipher.update(data.subarray(0, data.length - 16)),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Checks a `reply` frame end to end: shape, the HMAC over every field,
 * addressee, lifetime, then the sealed text against its signed digest.
 * `{ ok: true, envelope, text }` or `{ ok: false, code, id?, textDigest? }`.
 */
export function verifyReply(frame, { secret, machineId, now = Date.now() }) {
  const envelope = frame?.envelope;
  const id = UUID.test(String(envelope?.id ?? '')) ? envelope.id : undefined;
  const digest = SIGNATURE.test(String(envelope?.textDigest ?? ''))
    ? envelope.textDigest
    : undefined;
  const bad = (code) => ({
    ok: false,
    code,
    ...(id ? { id } : {}),
    ...(digest ? { textDigest: digest } : {}),
  });
  if (
    frame?.v !== BRIDGE_PROTOCOL_VERSION ||
    frame.t !== 'reply' ||
    !id ||
    !digest ||
    typeof envelope !== 'object' ||
    Object.keys(envelope).some((key) => !ENVELOPE_KEYS.has(key)) ||
    !MACHINE_ID.test(String(envelope.machineId ?? '')) ||
    !THREAD_ID.test(String(envelope.threadId ?? '')) ||
    !UUID.test(String(envelope.actorId ?? '')) ||
    (envelope.environmentId !== undefined &&
      !ENVIRONMENT_ID.test(String(envelope.environmentId))) ||
    typeof envelope.box !== 'object' ||
    envelope.box === null ||
    Object.keys(envelope.box).length !== 2 ||
    !SEAL_IV.test(String(envelope.box.iv ?? '')) ||
    !SEAL_DATA.test(String(envelope.box.data ?? '')) ||
    !isTime(envelope.issuedAt) ||
    !isTime(envelope.expiresAt) ||
    !SIGNATURE.test(String(frame.sig ?? ''))
  )
    return bad('bad_signature');
  const expected = createHmac('sha256', secret)
    .update(replySigningString(envelope), 'utf8')
    .digest();
  if (!sameBytes(expected, Buffer.from(frame.sig, 'hex')))
    return bad('bad_signature');
  // Signed for another machine: never deliver it here.
  if (envelope.machineId !== machineId) return bad('bad_signature');
  if (
    envelope.issuedAt > now + CLOCK_SKEW_MS ||
    envelope.expiresAt <= now ||
    envelope.expiresAt - envelope.issuedAt > MAX_LIFETIME_MS
  )
    return bad('expired');
  let text;
  try {
    text = openText(secret, envelope);
  } catch {
    return bad('bad_signature');
  }
  // The text that was sealed must be the text that was signed.
  if (
    !text.trim() ||
    text.length > MAX_TEXT_CHARS ||
    !sameBytes(
      Buffer.from(textDigest(secret, text), 'hex'),
      Buffer.from(digest, 'hex')
    )
  )
    return bad('bad_signature');
  return { ok: true, envelope, text };
}

/**
 * Append-only record of every reply this machine settled: the replay fence
 * and the local audit trail (who, when, which thread, the text's keyed
 * digest; never the text). A private file (see private-files.mjs), trimmed
 * to the newest entries when it is loaded.
 */
export function createLedger(file) {
  const settled = new Map();
  const lines = (readPrivateFile(file) ?? '').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      if (UUID.test(String(row?.id))) settled.set(row.id, row);
    } catch {
      // A torn last line from a crash: skip it.
    }
  }
  if (lines.length > LEDGER_KEEP * 2) {
    const kept = [...settled.values()].slice(-LEDGER_KEEP);
    settled.clear();
    for (const row of kept) settled.set(row.id, row);
    writePrivateFile(
      file,
      kept.map((row) => `${JSON.stringify(row)}\n`).join('')
    );
  }
  return {
    get: (id) => settled.get(id),
    /** Replies delivered since `sinceMs`, for the rate limit. */
    recent(sinceMs, threadId) {
      let count = 0;
      for (const row of settled.values())
        if (
          Date.parse(row.at) > sinceMs &&
          row.state === 'delivered' &&
          (threadId === undefined || row.threadId === threadId)
        )
          count++;
      return count;
    },
    record(row) {
      appendPrivateLine(file, JSON.stringify(row));
      settled.set(row.id, row);
    },
  };
}

const KNOWN_DELIVERIES = new Set(['steered', 'started', 'queued']);
/** A refusal is permanent only when T3 says the thread itself is not there. */
const THREAD_GONE =
  /\bthread\b[^.]*\b(was not found|not found|does not exist|no such)\b|\b(unknown|no such) thread\b/i;

/**
 * The Ed25519 key acknowledgements are signed with. Only a holder of the
 * fleet secret can derive it; Web and the store verify with the public half.
 */
export const ackPrivateKey = (secret) =>
  createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, derive(secret, ACK_KEY_INFO)]),
    format: 'der',
    type: 'pkcs8',
  });

/** The signed `ack` frame for an outcome; only this machine can make one. */
function ack(secret, machineId, id, digest, outcome) {
  const body = {
    id,
    state: outcome.state,
    ...(outcome.delivery ? { delivery: outcome.delivery } : {}),
    ...(outcome.code ? { code: outcome.code } : {}),
  };
  return {
    v: BRIDGE_PROTOCOL_VERSION,
    t: 'ack',
    ...body,
    sig: sign(
      null,
      Buffer.from(
        ackSigningString({ ...body, machineId, textDigest: digest }),
        'utf8'
      ),
      ackPrivateKey(secret)
    ).toString('hex'),
  };
}

/**
 * Handles one `reply` frame and returns the `ack` frame to send, or null
 * when nothing can be said yet (the frame names no reply, or the local T3
 * server is unavailable and the reply stays in the outbox for a retry).
 *
 * `steer({ threadId, message, clientRequestId, environmentId })` delivers;
 * it only ever addresses an existing thread, with text.
 */
export async function handleReply(
  frame,
  { secret, machineId, ledger, steer, now = Date.now, firstSeen = new Map() }
) {
  const verified = verifyReply(frame, { secret, machineId, now: now() });
  if (!verified.ok)
    // A frame without a usable id and digest cannot be acknowledged at all.
    return verified.id && verified.textDigest
      ? ack(secret, machineId, verified.id, verified.textDigest, {
          state: 'failed',
          code: verified.code,
        })
      : null;
  const { envelope, text } = verified;
  const { id, threadId } = envelope;
  const digest = envelope.textDigest;
  const answer = (outcome) => ack(secret, machineId, id, digest, outcome);

  const known = ledger.get(id);
  if (known)
    // Settled before: same answer, nothing is sent again. A reused id with
    // other content was never delivered under this id and is refused.
    return known.digest === digest &&
      known.threadId === threadId &&
      (known.environmentId ?? null) === (envelope.environmentId ?? null)
      ? answer(known)
      : answer({ state: 'failed', code: 'bad_signature' });

  const settle = (outcome) => {
    const row = {
      id,
      at: new Date(now()).toISOString(),
      actorId: envelope.actorId,
      threadId,
      ...(envelope.environmentId
        ? { environmentId: envelope.environmentId }
        : {}),
      digest,
      ...outcome,
    };
    ledger.record(row);
    firstSeen.delete(id);
    return answer(row);
  };

  if (
    ledger.recent(now() - 60_000, threadId) >= PER_THREAD_PER_MINUTE ||
    ledger.recent(now() - 3_600_000) >= PER_HOUR
  )
    return settle({ state: 'failed', code: 'rate_limited' });

  try {
    const receipt = await steer({
      threadId,
      message: text,
      clientRequestId: `mm-reply:${id}`,
      ...(envelope.environmentId
        ? { environmentId: envelope.environmentId }
        : {}),
    });
    // An interrupted send found in the thread is delivered, but how is unknown.
    return settle({
      state: 'delivered',
      ...(KNOWN_DELIVERIES.has(receipt.delivery)
        ? { delivery: receipt.delivery }
        : {}),
    });
  } catch (error) {
    if (error?.code === 't3_tool_error')
      return settle({
        state: 'failed',
        code: THREAD_GONE.test(String(error.detail ?? ''))
          ? 'unknown_thread'
          : 'thread_refused',
      });
    // The local server is down or restarting: keep the reply in the outbox
    // and say so only once the retry window has passed.
    const since = firstSeen.get(id) ?? now();
    firstSeen.set(id, since);
    return now() - since >= RETRY_WINDOW_MS
      ? settle({ state: 'failed', code: 'unavailable' })
      : null;
  }
}
