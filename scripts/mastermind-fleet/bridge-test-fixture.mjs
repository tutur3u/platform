// Shared helpers for the bridge tests: a reply sealed and signed the way Web
// does it, and the acknowledgement the machine would sign for an outcome.
import {
  createCipheriv,
  createHmac,
  createPrivateKey,
  hkdfSync,
  randomBytes,
  sign,
} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BRIDGE_ACK_KEY_INFO,
  BRIDGE_DIGEST_KEY_INFO,
  BRIDGE_SEAL_KEY_INFO,
  bridgeAckSigningString,
  bridgeReplySigningString,
  bridgeSealContext,
} from '../../packages/utils/src/mastermind-store/bridge-protocol.ts';

export const SECRET = 'fleet-publisher-secret-for-tests-0123456789';
export const NOW = Date.UTC(2026, 10, 21, 5, 0, 0);
export const ACTOR = '00000000-0000-4000-8000-0000000000aa';
export const uuid = (n) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const tempDir = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), 'mm-bridge-'));

const derive = (secret, info) =>
  Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), info, 32));

/** A reply sealed and signed the way Web does it (apps/web/.../fleet/bridge.ts). */
export function replyFrame(n = 1, over = {}, secret = SECRET) {
  const { text = `reply ${n}`, ...fields } = over;
  const base = {
    id: uuid(n),
    machineId: 'skr-m4',
    threadId: `thread:project:mcp%3Aabc:${n}`,
    actorId: ACTOR,
    issuedAt: NOW - 1000,
    expiresAt: NOW + 60_000,
    ...fields,
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    derive(secret, BRIDGE_SEAL_KEY_INFO),
    iv
  );
  cipher.setAAD(Buffer.from(bridgeSealContext(base.id, base.machineId)));
  const data = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const envelope = {
    ...base,
    box: { iv: iv.toString('base64url'), data: data.toString('base64url') },
    textDigest: createHmac('sha256', derive(secret, BRIDGE_DIGEST_KEY_INFO))
      .update(text, 'utf8')
      .digest('hex'),
  };
  return {
    v: 1,
    t: 'reply',
    envelope,
    sig: createHmac('sha256', secret)
      .update(bridgeReplySigningString(envelope))
      .digest('hex'),
  };
}

/** The acknowledgement Web and the store would accept for this outcome. */
export function signedAck(frame, outcome, secret = SECRET) {
  const { id, machineId, textDigest: digest } = frame.envelope;
  const key = createPrivateKey({
    key: Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'),
      derive(secret, BRIDGE_ACK_KEY_INFO),
    ]),
    format: 'der',
    type: 'pkcs8',
  });
  return {
    v: 1,
    t: 'ack',
    id,
    ...outcome,
    sig: sign(
      null,
      Buffer.from(
        bridgeAckSigningString({
          id,
          machineId,
          textDigest: digest,
          ...outcome,
        })
      ),
      key
    ).toString('hex'),
  };
}
