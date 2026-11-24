import 'server-only';

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';
import { BRIDGE_DIGEST_KEY_INFO } from '@tuturuuu/utils/mastermind-store/bridge-protocol';
import {
  ATTACHMENT_LIMITS,
  ATTACHMENT_MIME,
  type AttachmentFile,
  type AttachmentKind,
  attachmentMetaContext,
  BRIDGE_ATTACHMENT_META_KEY_INFO,
  BRIDGE_CREDENTIAL_KEY_INFO,
  BRIDGE_FETCH_KEY_INFO,
  BRIDGE_SEAL_KEY_INFO_V2,
  type BridgeReplyV2Envelope,
  bridgeBundleString,
  bridgeFetchString,
  bridgeReplyV2SealContext,
  bridgeReplyV2SigningString,
} from '@tuturuuu/utils/mastermind-store/reply-attachments';
import {
  getImageTransformer,
  type ImageTransformer,
} from '@/lib/image-transform';
import { derive, fleetAckKey } from './bridge';

/**
 * The `mastermind_reply_attachments` flag: off unless the deployment sets
 * `MASTERMIND_REPLY_ATTACHMENTS_ENABLED=true`. Off, every attachment route
 * answers 404 and a reply that names attachments is refused.
 */
export function replyAttachmentsEnabled(
  env: Record<string, string | undefined> = process.env
) {
  return env.MASTERMIND_REPLY_ATTACHMENTS_ENABLED?.trim() === 'true';
}

/** Keyed digest of the session that reserves, uploads and sends. */
export function attachmentCredential(secret: string, sessionId: string) {
  return createHmac('sha256', derive(secret, BRIDGE_CREDENTIAL_KEY_INFO))
    .update(sessionId, 'utf8')
    .digest('hex');
}

function seal(key: Buffer, context: string, plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const data = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return { iv: iv.toString('base64url'), data: data.toString('base64url') };
}

/** A display name sealed for the store, which keeps it without a key for it. */
export function sealAttachmentName(
  secret: string,
  target: { replyId: string; machineId: string },
  name: string
) {
  return seal(
    derive(secret, BRIDGE_ATTACHMENT_META_KEY_INFO),
    attachmentMetaContext(target.replyId, target.machineId),
    name
  );
}

export function openAttachmentName(
  secret: string,
  target: { replyId: string; machineId: string },
  box: { iv: string; data: string }
) {
  try {
    const data = Buffer.from(box.data, 'base64url');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      derive(secret, BRIDGE_ATTACHMENT_META_KEY_INFO),
      Buffer.from(box.iv, 'base64url')
    );
    decipher.setAAD(
      Buffer.from(
        attachmentMetaContext(target.replyId, target.machineId),
        'utf8'
      )
    );
    decipher.setAuthTag(data.subarray(data.length - 16));
    return Buffer.concat([
      decipher.update(data.subarray(0, data.length - 16)),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Reads exactly `size` bytes of the request body, cancelling the stream as
 * soon as it goes past them; null for a short or long body.
 */
export async function readExactBody(request: Request, size: number) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const bytes = new Uint8Array(size);
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (total + value.byteLength > size) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    bytes.set(value, total);
    total += value.byteLength;
  }
  return total === size ? bytes : null;
}

export type IngestError =
  | 'attachment_type_unsupported'
  | 'attachment_invalid'
  | 'attachment_too_large'
  | 'attachments_unavailable';

const RASTER_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif']);
/** C0 controls other than tab, line feed, form feed and carriage return. */
const TEXT_CONTROLS = /[\u0000-\u0008\u000B\u000E-\u001F\u007F]/u;

function isRaster(input: Buffer) {
  return (
    input.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ||
    input
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    ['GIF87a', 'GIF89a'].includes(input.subarray(0, 6).toString('ascii')) ||
    (input.subarray(0, 4).toString('ascii') === 'RIFF' &&
      input.subarray(8, 12).toString('ascii') === 'WEBP')
  );
}

/**
 * What the machine will receive for an upload. An image is sniffed, decoded
 * (first frame, bounded pixels), oriented, scaled into the bounding box and
 * re-encoded as WebP without metadata; the original bytes are never kept.
 * Text must be strict UTF-8 without control characters, and is kept as is.
 */
export async function ingestAttachment(
  kind: AttachmentKind,
  input: Uint8Array,
  transformer?: ImageTransformer
): Promise<
  | { ok: true; bytes: Uint8Array; mime: string }
  | { ok: false; error: IngestError }
> {
  if (kind === 'text') {
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(input);
    } catch {
      return { ok: false, error: 'attachment_type_unsupported' };
    }
    if (!text.trim() || TEXT_CONTROLS.test(text))
      return { ok: false, error: 'attachment_type_unsupported' };
    return { ok: true, bytes: input, mime: ATTACHMENT_MIME.text };
  }
  const buffer = Buffer.from(input);
  if (!isRaster(buffer))
    return { ok: false, error: 'attachment_type_unsupported' };
  let resolved: ImageTransformer;
  try {
    resolved = await getImageTransformer(transformer);
  } catch {
    return { ok: false, error: 'attachments_unavailable' };
  }
  const image = resolved.decode(buffer, {
    limitInputPixels: ATTACHMENT_LIMITS.maxImageInputPixels,
    failOn: 'warning',
    pages: 1,
  });
  try {
    const metadata = await image.metadata();
    if (!metadata.format || !RASTER_FORMATS.has(metadata.format))
      return { ok: false, error: 'attachment_type_unsupported' };
    for (const quality of [82, 70]) {
      const output = await image.webp({
        width: ATTACHMENT_LIMITS.maxImageEdge,
        height: ATTACHMENT_LIMITS.maxImageEdge,
        quality,
        effort: 4,
      });
      if (output.length <= ATTACHMENT_LIMITS.maxFileBytes)
        return {
          ok: true,
          bytes: new Uint8Array(output),
          mime: ATTACHMENT_MIME.image,
        };
    }
    return { ok: false, error: 'attachment_too_large' };
  } catch {
    return { ok: false, error: 'attachment_invalid' };
  } finally {
    image.destroy();
  }
}

/** The capability a machine presents to fetch one object of one reply. */
export function fetchCapability(
  secret: string,
  input: Parameters<typeof bridgeFetchString>[0]
) {
  return createHmac('sha256', derive(secret, BRIDGE_FETCH_KEY_INFO))
    .update(bridgeFetchString(input), 'utf8')
    .digest('hex');
}

export interface FleetReplyV2Input {
  id: string;
  machineId: string;
  threadId: string;
  actorId: string;
  text: string;
  files: AttachmentFile[];
  issuedAt: number;
  expiresAt: number;
}

/**
 * Seals and signs a reply with attachments. The manifest (names, sizes,
 * digests) is sealed with the text; the store sees only the opaque object
 * ids and a keyed bundle digest, which is also its idempotency key and what
 * the machine's acknowledgement signs, so a repeated reply id with other
 * files can never collect the first receipt.
 */
export function sealFleetReplyV2(secret: string, input: FleetReplyV2Input) {
  const { text, files, ...head } = input;
  const payload = { text, files };
  const textDigest = createHmac(
    'sha256',
    derive(secret, BRIDGE_DIGEST_KEY_INFO)
  )
    .update(bridgeBundleString(head, payload), 'utf8')
    .digest('hex');
  const envelope: BridgeReplyV2Envelope = {
    ...head,
    box: seal(
      derive(secret, BRIDGE_SEAL_KEY_INFO_V2),
      bridgeReplyV2SealContext(input.id, input.machineId),
      JSON.stringify(payload)
    ),
    textDigest,
    objects: files.map((file) => file.id),
  };
  return {
    envelope,
    sig: createHmac('sha256', secret)
      .update(bridgeReplyV2SigningString(envelope), 'utf8')
      .digest('hex'),
    ackKey: fleetAckKey(secret),
    fetch: files.map((file) => ({
      id: file.id,
      hash: createHash('sha256')
        .update(
          fetchCapability(secret, {
            replyId: input.id,
            machineId: input.machineId,
            objectId: file.id,
            sha256: file.sha256,
          }),
          'utf8'
        )
        .digest('hex'),
    })),
  };
}
