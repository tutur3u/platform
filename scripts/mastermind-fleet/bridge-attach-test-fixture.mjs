// Shared helpers for the attachment bridge tests: a v2 reply sealed and
// signed the way Web does it (apps/web/src/lib/mastermind/fleet/
// reply-attachments.ts), files with their digests, and a fake store.
import {
  createCipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import {
  BRIDGE_BUNDLE_KEY_INFO,
  BRIDGE_SEAL_KEY_INFO_V2,
  bridgeBundleString,
  bridgeReplyV2SealContext,
  bridgeReplyV2SigningString,
} from '../../packages/utils/src/mastermind-store/reply-attachments.ts';
import { ACTOR, NOW, SECRET, uuid } from './bridge-test-fixture.mjs';

const derive = (secret, info) =>
  Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), info, 32));

/** A file of `bytes` as the sealed manifest describes it. */
export function manifestFile(n, bytes, over = {}) {
  return {
    id: uuid(500 + n),
    kind: 'text',
    mime: 'text/plain',
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    name: `notes-${n}.txt`,
    ...over,
  };
}

/** A v2 reply frame sealed and signed as Web does. */
export function replyV2Frame(n = 1, over = {}, secret = SECRET) {
  const { text = `see file ${n}`, files, ...fields } = over;
  const head = {
    id: uuid(n),
    machineId: 'skr-m4',
    threadId: `thread:project:mcp%3Aabc:${n}`,
    actorId: ACTOR,
    issuedAt: NOW - 1000,
    expiresAt: NOW + 3_600_000,
    ...fields,
  };
  const payload = { text, files };
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    derive(secret, BRIDGE_SEAL_KEY_INFO_V2),
    iv
  );
  cipher.setAAD(Buffer.from(bridgeReplyV2SealContext(head.id, head.machineId)));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const envelope = {
    ...head,
    box: { iv: iv.toString('base64url'), data: data.toString('base64url') },
    textDigest: createHmac('sha256', derive(secret, BRIDGE_BUNDLE_KEY_INFO))
      .update(bridgeBundleString(head, payload))
      .digest('hex'),
    objects: files.map((file) => file.id),
  };
  return {
    v: 2,
    t: 'reply',
    envelope,
    sig: createHmac('sha256', secret)
      .update(bridgeReplyV2SigningString(envelope))
      .digest('hex'),
  };
}

/**
 * A fake store fetch: serves `objects` (id -> bytes) at the store origin,
 * recording each request. `respond` may override the answer per request.
 */
export function fakeStore(origin, objects, respond) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    const custom = respond?.(url, init);
    if (custom) return custom;
    const id = new URL(url).searchParams.get('id');
    const bytes = objects.get(id);
    if (!url.startsWith(`${origin}/`) || !bytes)
      return new Response(null, { status: 404 });
    return new Response(bytes, {
      status: 200,
      headers: { 'content-length': String(bytes.length) },
    });
  };
  return { fetchImpl, requests };
}
