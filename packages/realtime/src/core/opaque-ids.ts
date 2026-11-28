import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * The call socket's room alias: one person has one alias in presence, chat and
 * documents of a room (`<wsId>:<meetingId>`), and a different one elsewhere.
 */
export { meetRoomAccountAlias } from '../meet/room-account-alias';

/**
 * Opaque stand-ins for platform account ids on realtime surfaces that people
 * outside a workspace can read: Meet document tabs, document channels and
 * programming collaboration rooms. Every value is derived on the server from
 * `MEET_REALTIME_TOKEN_SECRET`, so a reader cannot recover or link the id.
 */

function secretKey(secret: string | undefined) {
  const value = secret?.trim();
  if (!value) throw new Error('Opaque realtime ids require a secret');
  return value;
}

/** An HMAC truncated to 128 bits and shaped as a UUID v4, for guid schemas. */
function uuidFromHmac(secret: string | undefined, input: string) {
  const bytes = createHmac('sha256', secretKey(secret))
    .update(input)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The id a programming room shows for a participant in presence frames. */
export function collaborationPresenceId(
  secret: string | undefined,
  roomId: string,
  userId: string
) {
  return uuidFromHmac(secret, `collaboration-presence:${roomId}:${userId}`);
}

/**
 * Stands in for the room owner's account id in a programming join ticket a
 * Meet participant holds. The room compares it with the owner it was seeded
 * with; the owner's id itself never reaches the browser.
 */
export function collaborationOwnerBinding(
  secret: string | undefined,
  roomId: string,
  ownerId: string
) {
  return uuidFromHmac(secret, `collaboration-owner:${roomId}:${ownerId}`);
}

/** Constant-time comparison of two ids; different lengths never match. */
function sameId(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Whether a programming room ticket names the room's owner: by account id, or,
 * for a browser join ticket only, by the owner binding.
 */
export function collaborationTicketOwnerMatches(
  secret: string | undefined,
  ticket: { kind: string; ownerId: string },
  room: { roomId: string; ownerId: string }
) {
  if (sameId(ticket.ownerId, room.ownerId)) return true;
  return (
    ticket.kind === 'join' &&
    sameId(
      ticket.ownerId,
      collaborationOwnerBinding(secret, room.roomId, room.ownerId)
    )
  );
}

const SEAL_IV_BYTES = 12;
const SEAL_TAG_BYTES = 16;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Encrypts an account id for a token its holder can read (AES-256-GCM with a
 * key derived per purpose from the secret, authenticated over `context`).
 */
function sealId(
  secret: string | undefined,
  purpose: string,
  context: string,
  id: string
) {
  const key = createHmac('sha256', secretKey(secret)).update(purpose).digest();
  const iv = randomBytes(SEAL_IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(id), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    'base64url'
  );
}

/** The id in a seal for this purpose and context, or null when it is invalid. */
function openId(
  secret: string | undefined,
  purpose: string,
  context: string,
  seal: string
) {
  try {
    const raw = Buffer.from(seal, 'base64url');
    if (raw.length <= SEAL_IV_BYTES + SEAL_TAG_BYTES || raw.length > 256)
      return null;
    const key = createHmac('sha256', secretKey(secret))
      .update(purpose)
      .digest();
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      raw.subarray(0, SEAL_IV_BYTES)
    );
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(
      raw.subarray(SEAL_IV_BYTES, SEAL_IV_BYTES + SEAL_TAG_BYTES)
    );
    const id = Buffer.concat([
      decipher.update(raw.subarray(SEAL_IV_BYTES + SEAL_TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
    return GUID.test(id) ? id : null;
  } catch {
    return null;
  }
}

const CHANNEL_SEAL = 'tuturuuu.channels.owner-seal.v1';

/**
 * Encrypts a document channel's owner id for a client-held ticket, bound to
 * the topic. Only the channel room, which holds the secret, opens it to bind
 * the room and sign its workspace checkpoint.
 */
export function sealChannelOwner(
  secret: string | undefined,
  topic: string,
  ownerId: string
) {
  return sealId(
    secret,
    CHANNEL_SEAL,
    `tuturuuu.channels.owner:${topic}`,
    ownerId
  );
}

/** The owner id in a seal minted for this topic, or null when it is invalid. */
export function openChannelOwner(
  secret: string | undefined,
  topic: string,
  seal: string
) {
  return openId(secret, CHANNEL_SEAL, `tuturuuu.channels.owner:${topic}`, seal);
}

/**
 * The owner a channel ticket names: the sealed owner when the ticket carries
 * one, otherwise its plain `ownerId` (service and member tickets).
 */
export function channelTicketOwner(
  secret: string | undefined,
  ticket: { topic: string; ownerId?: string; ownerSeal?: string }
) {
  if (ticket.ownerSeal)
    return openChannelOwner(secret, ticket.topic, ticket.ownerSeal);
  return ticket.ownerId ?? null;
}

const PREVIEW_SEAL = 'tuturuuu.playground-preview.owner-seal.v1';
type PreviewScope = { projectId: string; port: number; roomId?: string };
const previewContext = (scope: PreviewScope) =>
  `tuturuuu.playground-preview:${scope.projectId}:${scope.port}:${scope.roomId ?? ''}`;

/**
 * Encrypts a playground preview's owner id for the capability embedded in
 * preview URLs, bound to the project, port and room it authorizes.
 */
export function sealPreviewOwner(
  secret: string | undefined,
  scope: PreviewScope,
  ownerId: string
) {
  return sealId(secret, PREVIEW_SEAL, previewContext(scope), ownerId);
}

/** The owner id in a preview capability seal, or null when it is invalid. */
export function openPreviewOwner(
  secret: string | undefined,
  scope: PreviewScope,
  seal: string
) {
  return openId(secret, PREVIEW_SEAL, previewContext(scope), seal);
}
