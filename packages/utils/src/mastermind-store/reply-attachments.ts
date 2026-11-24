/**
 * Contract of owner reply attachments on the fleet bridge (envelope v2).
 * Framework-free; Web, the store Worker and the machine bridge all follow it.
 *
 * An upload record, minted by the store, authorizes everything: it is bound
 * to the owner, the credential (session) that reserved it, the target
 * machine and thread, and the reply id. Web enforces the byte cap where the
 * bytes arrive, re-encodes images and checks text, and finalizes the record
 * once against the derived bytes. A v2 reply names its records by id; its
 * signature, the store's idempotency digest and the machine's acknowledgement
 * all cover the canonical manifest, the object ids, the actor, the exact
 * target, the reply id and the expiry. The machine fetches each object from
 * the store with a capability only the addressed machine can derive.
 * See apps/docs/platform/features/mastermind-thread-replies.mdx#attachments.
 */
import { z } from 'zod';

/**
 * Advertised by a machine in its `hello`; checked by the store at send time.
 * Equal to `BRIDGE_ATTACHMENT_CAPABILITY` in bridge-protocol.ts.
 */
export const ATTACHMENT_CAPABILITY = 'reply-attachments-v2';
export const BRIDGE_REPLY_V2_VERSION = 2;
/** First signed line of a v2 reply; no v1 signature fits it. */
export const BRIDGE_REPLY_V2_DOMAIN = 'mastermind-fleet-reply-v2';
/** First line of the keyed bundle digest (text and manifest together). */
export const BRIDGE_BUNDLE_DOMAIN = 'mastermind-fleet-reply-bundle-v2';
/** First line of a fetch capability. */
export const BRIDGE_FETCH_DOMAIN = 'mastermind-fleet-attachment-fetch-v1';
/** HKDF labels of the keys derived from the fleet secret. */
export const BRIDGE_SEAL_KEY_INFO_V2 = 'mastermind-fleet-reply-enc-v2';
export const BRIDGE_FETCH_KEY_INFO = 'mastermind-fleet-attachment-fetch-v1';
export const BRIDGE_CREDENTIAL_KEY_INFO = 'mastermind-fleet-attachment-cred-v1';
export const BRIDGE_ATTACHMENT_META_KEY_INFO =
  'mastermind-fleet-attachment-meta-v1';
/** Authorization scheme of a machine's object fetch. */
export const ATTACHMENT_FETCH_SCHEME = 'MM-Fetch';

export const ATTACHMENT_LIMITS = {
  maxFileBytes: 10 * 1024 * 1024,
  maxFiles: 6,
  maxReplyBytes: 25 * 1024 * 1024,
  /** Re-encoded images fit inside this box; larger ones are scaled down. */
  maxImageEdge: 2048,
  /** Decoder refusal threshold, before any pixel is processed. */
  maxImageInputPixels: 40_000_000,
  maxNameChars: 120,
  /** A reserved upload must be finalized within this long. */
  reserveTtlMs: 30 * 60 * 1000,
  /** A finalized, unsent upload (and any reply it joins) lives this long. */
  recordTtlMs: 24 * 60 * 60 * 1000,
  /** Released and expired records are kept this long for retries. */
  recordRetentionMs: 7 * 24 * 60 * 60 * 1000,
  /** A v2 reply must have at least this long left when it is sent. */
  minRemainingMs: 5 * 60 * 1000,
  /** Store-wide bounds on bytes held and on new reservations. */
  maxOutstandingBytes: 150 * 1024 * 1024,
  maxOutstandingUploads: 60,
  maxHourlyBytes: 300 * 1024 * 1024,
  maxHourlyUploads: 120,
  /** Fetches the store serves per object before refusing. */
  maxFetchesPerObject: 8,
  /** Bytes per stored chunk row (the Durable Object row cap is 2 MB). */
  chunkBytes: 512 * 1024,
  /** Bytes the machine bridge delivers per hour. */
  machineHourlyBytes: 200 * 1024 * 1024,
} as const;

export const attachmentKinds = ['image', 'text'] as const;
export type AttachmentKind = (typeof attachmentKinds)[number];
/** What the machine receives: images are re-encoded, text is checked as-is. */
export const ATTACHMENT_MIME: Record<AttachmentKind, string> = {
  image: 'image/webp',
  text: 'text/plain',
};

export const attachmentStates = [
  'reserved',
  'ready',
  'bound',
  'released',
  'expired',
] as const;
export type AttachmentState = (typeof attachmentStates)[number];

const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
const machineId = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/u);
const threadId = z.string().regex(/^[\w:%.][\w:%.-]{0,399}$/u);
const hex64 = z.string().regex(/^[0-9a-f]{64}$/u);
const epochMs = z.number().int().min(0).max(8_640_000_000_000_000);
const sealed = z
  .object({
    iv: z.string().regex(/^[\w-]{16}$/u),
    data: z.string().regex(/^[\w-]{23,2000}$/u),
  })
  .strict();

export const attachmentIdSchema = uuid;

/** Web asks the store to reserve one upload; the store mints its id. */
export const attachmentReserveSchema = z
  .object({
    v: z.literal(1),
    actorId: uuid,
    /** Keyed digest of the session that reserved it. */
    credential: hex64,
    machineId,
    threadId,
    replyId: uuid,
    kind: z.enum(attachmentKinds),
    size: z.number().int().min(1).max(ATTACHMENT_LIMITS.maxFileBytes),
    /** The display name, sealed by Web; the store never reads it. */
    meta: sealed,
  })
  .strict();
export type AttachmentReserve = z.infer<typeof attachmentReserveSchema>;

/**
 * Sent with the derived bytes; finalizes a reserved record once. The store
 * computes the bytes' sha256 itself, so no digest travels in a header.
 */
export const attachmentFinalizeSchema = z
  .object({
    actorId: uuid,
    credential: hex64,
    mime: z.enum([ATTACHMENT_MIME.image, ATTACHMENT_MIME.text]),
  })
  .strict();
export type AttachmentFinalize = z.infer<typeof attachmentFinalizeSchema>;
/** Header that carries the finalize fields beside the raw body. */
export const ATTACHMENT_FINALIZE_HEADER = 'x-mm-attachment';

export const attachmentRecordSchema = z.object({
  id: uuid,
  actorId: uuid,
  credential: hex64,
  machineId,
  threadId,
  replyId: uuid,
  kind: z.enum(attachmentKinds),
  /** Bytes reserved; after finalization, the derived size. */
  size: z.number().int().min(0),
  state: z.enum(attachmentStates),
  meta: sealed,
  sha256: hex64.optional(),
  mime: z.string().max(40).optional(),
  createdAt: epochMs,
  finalizedAt: epochMs.optional(),
  expiresAt: epochMs,
});
export type AttachmentRecord = z.infer<typeof attachmentRecordSchema>;

export const attachmentRecordsRequestSchema = z
  .object({
    v: z.literal(1),
    ids: z.array(uuid).min(1).max(ATTACHMENT_LIMITS.maxFiles),
  })
  .strict();

/** One file as the sealed manifest describes it. */
export const attachmentFileSchema = z
  .object({
    id: uuid,
    kind: z.enum(attachmentKinds),
    mime: z.enum([ATTACHMENT_MIME.image, ATTACHMENT_MIME.text]),
    size: z.number().int().min(1).max(ATTACHMENT_LIMITS.maxFileBytes),
    sha256: hex64,
    name: z.string().min(1).max(ATTACHMENT_LIMITS.maxNameChars),
  })
  .strict();
export type AttachmentFile = z.infer<typeof attachmentFileSchema>;

/** What Web seals for the machine in a v2 reply. */
export const bridgeReplyV2PayloadSchema = z
  .object({
    text: z.string().max(4000),
    files: z.array(attachmentFileSchema).min(1).max(ATTACHMENT_LIMITS.maxFiles),
  })
  .strict();
export type BridgeReplyV2Payload = z.infer<typeof bridgeReplyV2PayloadSchema>;

/**
 * A v2 reply: thread replies on this machine only (no linked environment),
 * with the manifest sealed and the object ids in the clear for the store.
 */
export const bridgeReplyV2EnvelopeSchema = z
  .object({
    id: uuid,
    machineId,
    threadId,
    box: z
      .object({
        iv: z.string().regex(/^[\w-]{16}$/u),
        data: z.string().regex(/^[\w-]{23,22000}$/u),
      })
      .strict(),
    /** Keyed bundle digest: the store's idempotency key and the ack's subject. */
    textDigest: hex64,
    objects: z.array(uuid).min(1).max(ATTACHMENT_LIMITS.maxFiles),
    actorId: uuid,
    issuedAt: epochMs,
    expiresAt: epochMs,
  })
  .strict();
export type BridgeReplyV2Envelope = z.infer<typeof bridgeReplyV2EnvelopeSchema>;

export const bridgeSendV2Schema = z
  .object({
    v: z.literal(BRIDGE_REPLY_V2_VERSION),
    envelope: bridgeReplyV2EnvelopeSchema,
    sig: hex64,
    ackKey: z.string().regex(/^[\w-]{43}$/u),
    /** Per object, the sha256 of the capability its fetch must present. */
    fetch: z
      .array(z.object({ id: uuid, hash: hex64 }).strict())
      .min(1)
      .max(ATTACHMENT_LIMITS.maxFiles),
    waitMs: z.number().int().min(0).max(2500).default(0),
  })
  .strict();
export type BridgeSendV2Request = z.input<typeof bridgeSendV2Schema>;

/** The bytes Web signs (HMAC) for a v2 reply; no field holds a newline or comma. */
export function bridgeReplyV2SigningString(
  envelope: Omit<BridgeReplyV2Envelope, 'box'>
) {
  return [
    BRIDGE_REPLY_V2_DOMAIN,
    envelope.id,
    envelope.machineId,
    envelope.threadId,
    envelope.actorId,
    String(envelope.issuedAt),
    String(envelope.expiresAt),
    envelope.textDigest,
    envelope.objects.join(','),
  ].join('\n');
}

/** Bound into the v2 encryption; distinct from v1, so no box moves between them. */
export function bridgeReplyV2SealContext(id: string, machine: string) {
  return `v2\n${id}\n${machine}`;
}

/**
 * The canonical bytes under the bundle digest. JSON with fixed key order and
 * array layout, so Web and the machine compute it identically.
 */
export function bridgeBundleString(
  head: Pick<
    BridgeReplyV2Envelope,
    'id' | 'machineId' | 'threadId' | 'actorId' | 'issuedAt' | 'expiresAt'
  >,
  payload: BridgeReplyV2Payload
) {
  return [
    BRIDGE_BUNDLE_DOMAIN,
    JSON.stringify([
      head.id,
      head.machineId,
      head.threadId,
      head.actorId,
      head.issuedAt,
      head.expiresAt,
      payload.text,
      payload.files.map((file) => [
        file.id,
        file.kind,
        file.mime,
        file.size,
        file.sha256,
        file.name,
      ]),
    ]),
  ].join('\n');
}

/** What a fetch capability is the HMAC of; only the addressee derives it. */
export function bridgeFetchString(input: {
  replyId: string;
  machineId: string;
  objectId: string;
  sha256: string;
}) {
  return [
    BRIDGE_FETCH_DOMAIN,
    input.replyId,
    input.machineId,
    input.objectId,
    input.sha256,
  ].join('\n');
}

/** Bound into the encryption of a record's display name. */
export function attachmentMetaContext(replyId: string, machine: string) {
  return `meta\n${replyId}\n${machine}`;
}

const failure = z.object({ ok: z.literal(false), error: z.string().max(40) });

export const attachmentReserveResponseSchema = z.union([
  z.object({ ok: z.literal(true), id: uuid, expiresAt: epochMs }),
  failure,
]);
export const attachmentFinalizeResponseSchema = z.union([
  z.object({ ok: z.literal(true), record: attachmentRecordSchema }),
  failure,
]);
export const attachmentRecordsResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    records: z.array(attachmentRecordSchema.nullable()),
  }),
  failure,
]);

/** Display names: no path separators, controls or invisible characters. */
export function sanitizeAttachmentName(raw: string, kind: AttachmentKind) {
  const cleaned = raw
    .normalize('NFC')
    .replace(
      new RegExp(
        '[\\u0000-\\u001F\\u007F\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF/\\\\:*?"<>|]',
        'gu'
      ),
      ''
    )
    .replace(/\s+/gu, ' ')
    .replace(/^[.\s-]+/u, '')
    .trim();
  const extension = kind === 'image' ? '.webp' : '.txt';
  const stem = cleaned.replace(/\.[^.]{1,10}$/u, '') || 'attachment';
  return `${stem.slice(0, ATTACHMENT_LIMITS.maxNameChars - extension.length)}${extension}`;
}
