/**
 * Wire protocol of the Mastermind fleet bridge: the push channel between the
 * store Worker's `FleetBridge` Durable Object, the orchestrator machine that
 * holds a WebSocket open to it, and the owner's clients. Framework-free; the
 * Worker, Web and the machine bridge all follow it.
 * See apps/docs/build/devops/mastermind-store.mdx#fleet-bridge.
 */
import { z } from 'zod';

export const BRIDGE_PROTOCOL_VERSION = 1;
/** WebSocket subprotocol; the single-use ticket rides as the second entry. */
export const BRIDGE_SUBPROTOCOL = 'mm-bridge.v1';
/** First line of the bytes Web signs for a reply, so no other fleet signature fits. */
export const BRIDGE_REPLY_DOMAIN = 'mastermind-fleet-reply-v1';
export const BRIDGE_ACK_DOMAIN = 'mastermind-fleet-ack-v1';
/** HKDF labels for the keys derived from the fleet secret. */
export const BRIDGE_SEAL_KEY_INFO = 'mastermind-fleet-reply-enc-v1';
export const BRIDGE_DIGEST_KEY_INFO = 'mastermind-fleet-reply-digest-v1';
/** Seed of the Ed25519 key the machine signs acknowledgements with. */
export const BRIDGE_ACK_KEY_INFO = 'mastermind-fleet-ack-sign-v1';

export const BRIDGE_LIMITS = {
  /** A thread reply is plain text, at most this many characters. */
  maxTextChars: 4000,
  /** Largest frame either side accepts. */
  maxFrameBytes: 32 * 1024,
  /** Undelivered replies kept for an offline machine. */
  outboxMaxRows: 200,
  /** An undelivered reply expires after this long and is never sent late. */
  outboxTtlMs: 24 * 60 * 60 * 1000,
  perThreadPerMinute: 6,
  perHour: 60,
  ticketTtlMs: 60_000,
  maxLiveTickets: 16,
  maxOwnerSockets: 8,
  /** Longest a send waits for the machine's acknowledgement. */
  maxWaitMs: 2500,
  /** Undelivered replies replayed per reconnect. */
  replayBatch: 50,
  /** Reply records (the audit trail) are kept this long. */
  auditRetentionMs: 90 * 24 * 60 * 60 * 1000,
  cleanupPerWrite: 20,
  /**
   * Messages a socket may send per minute before it is retired, counted
   * before they are parsed. A machine draining a full outbox sends 200
   * acknowledgements; an owner socket has nothing to say at all.
   */
  machineFramesPerMinute: 300,
  ownerFramesPerMinute: 10,
  /** A `hello` (outbox replay) is honoured at most this often per socket. */
  helloMinIntervalMs: 10_000,
} as const;

/** Closed set: a poke names a topic and a revision, never content. */
export const BRIDGE_POKE_TOPICS = [
  'state',
  'usage',
  'status',
  'threads',
] as const;
export type BridgePokeTopic = (typeof BRIDGE_POKE_TOPICS)[number];

const machineId = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/u);
const replyId = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
const actorId = replyId;
/**
 * T3 thread ids: word characters plus `:`, `%`, `.` and `-`; never whitespace
 * and never a leading dash, since the machine passes them on as identifiers.
 */
const threadId = z.string().regex(/^[\w:%.][\w:%.-]{0,399}$/u);
const environmentId = z.string().regex(/^\w[\w-]{0,99}$/u);
const epochMs = z.number().int().min(0).max(8_640_000_000_000_000);
const signature = z.string().regex(/^[0-9a-f]{64}$/u);
/** Ed25519 signature (hex) and raw public key (base64url). */
const ackSignature = z.string().regex(/^[0-9a-f]{128}$/u);
const ackKey = z.string().regex(/^[\w-]{43}$/u);
/**
 * The reply text, encrypted by Web for the machine (AES-256-GCM, 12-byte
 * nonce, ciphertext followed by its tag; base64url). The store Worker relays
 * and keeps it but holds no key for it.
 */
const sealedText = z
  .object({
    iv: z.string().regex(/^[\w-]{16}$/u),
    data: z.string().regex(/^[\w-]{23,22000}$/u),
  })
  .strict();

/** What Web signs and the machine verifies before it messages a thread. */
export const bridgeReplyEnvelopeSchema = z
  .object({
    id: replyId,
    machineId,
    environmentId: environmentId.optional(),
    threadId,
    box: sealedText,
    /** Keyed digest of the text (HMAC-SHA-256, hex): the audit hash. */
    textDigest: signature,
    actorId,
    issuedAt: epochMs,
    expiresAt: epochMs,
  })
  .strict();
export type BridgeReplyEnvelope = z.infer<typeof bridgeReplyEnvelopeSchema>;

/**
 * The bytes signed for a reply. The text goes in as its keyed digest, and no
 * field can contain a newline, so the layout is unambiguous.
 */
export function bridgeReplySigningString(
  envelope: Omit<BridgeReplyEnvelope, 'box'>
) {
  return [
    BRIDGE_REPLY_DOMAIN,
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

/** Bound into the encryption, so a sealed text cannot be moved to another reply. */
export function bridgeSealContext(id: string, machine: string) {
  return `${id}\n${machine}`;
}

/**
 * The bytes the machine signs (Ed25519) for an acknowledgement. The key pair
 * comes from the fleet secret; Web hands the store the public half with each
 * reply. So the store can check an acknowledgement and refuse a forged one,
 * Web checks it again before reporting it, and neither the store nor anyone
 * holding its token can produce one.
 */
export function bridgeAckSigningString(ack: {
  id: string;
  machineId: string;
  state: 'delivered' | 'failed';
  delivery?: string;
  code?: string;
  textDigest: string;
}) {
  return [
    BRIDGE_ACK_DOMAIN,
    ack.id,
    ack.machineId,
    ack.state,
    ack.delivery ?? '',
    ack.code ?? '',
    ack.textDigest,
  ].join('\n');
}

export const bridgeDeliveries = ['steered', 'started', 'queued'] as const;
export type BridgeDelivery = (typeof bridgeDeliveries)[number];
/**
 * `sent`: stored, waiting for the machine. `delivered`: the machine put it in
 * the thread (`delivery` says how). `failed`: the machine refused it.
 * `expired`: the machine stayed away past the outbox lifetime.
 */
export const bridgeReceiptStates = [
  'sent',
  'delivered',
  'failed',
  'expired',
] as const;
export type BridgeReceiptState = (typeof bridgeReceiptStates)[number];

/** Why the machine refused a reply; closed set, never free text. */
export const bridgeFailureCodes = [
  'bad_signature',
  'expired',
  'unknown_thread',
  'rate_limited',
  'thread_refused',
  'unavailable',
] as const;

export const bridgeReceiptSchema = z.object({
  id: replyId,
  machineId,
  threadId,
  environmentId: environmentId.optional(),
  state: z.enum(bridgeReceiptStates),
  delivery: z.enum(bridgeDeliveries).optional(),
  code: z.enum(bridgeFailureCodes).optional(),
  createdAt: epochMs,
  settledAt: epochMs.optional(),
  textDigest: signature,
  /** The machine's signature over the settled state; absent until it settles. */
  ackSig: ackSignature.optional(),
});
export type BridgeReceipt = z.infer<typeof bridgeReceiptSchema>;

const v = z.literal(BRIDGE_PROTOCOL_VERSION);

/** Frames a machine may send. Anything else closes nothing and is dropped. */
export const bridgeMachineFrameSchema = z.discriminatedUnion('t', [
  z.object({ v, t: z.literal('hello') }),
  z.object({
    v,
    t: z.literal('ack'),
    id: replyId,
    state: z.enum(['delivered', 'failed']),
    delivery: z.enum(bridgeDeliveries).optional(),
    code: z.enum(bridgeFailureCodes).optional(),
    sig: ackSignature,
  }),
  z.object({
    v,
    t: z.literal('poke'),
    topic: z.enum(BRIDGE_POKE_TOPICS),
    revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    observedAt: z.iso.datetime(),
  }),
]);
export type BridgeMachineFrame = z.infer<typeof bridgeMachineFrameSchema>;

export const bridgePokeSchema = z.object({
  machineId,
  topic: z.enum(BRIDGE_POKE_TOPICS),
  revision: z.number().int().min(0),
  observedAt: z.string(),
});
export type BridgePoke = z.infer<typeof bridgePokeSchema>;

export const bridgeMachineStatusSchema = z.object({
  machineId,
  connected: z.boolean(),
  connectedAt: epochMs.optional(),
  lastSeenAt: epochMs.optional(),
  disconnectedAt: epochMs.optional(),
});
export type BridgeMachineStatus = z.infer<typeof bridgeMachineStatusSchema>;

/** Frames pushed to a machine socket. */
export type BridgeToMachineFrame = {
  v: typeof BRIDGE_PROTOCOL_VERSION;
  t: 'reply';
  envelope: BridgeReplyEnvelope;
  sig: string;
};

/** Frames pushed to an owner socket. */
export const bridgeOwnerFrameSchema = z.discriminatedUnion('t', [
  z.object({ v, t: z.literal('receipt'), receipt: bridgeReceiptSchema }),
  z.object({ v, t: z.literal('poke'), poke: bridgePokeSchema }),
  z.object({ v, t: z.literal('machine'), machine: bridgeMachineStatusSchema }),
]);
export type BridgeOwnerFrame = z.infer<typeof bridgeOwnerFrameSchema>;

export const bridgeTicketRequestSchema = z.discriminatedUnion('role', [
  z.object({ v, role: z.literal('machine'), machineId }),
  z.object({ v, role: z.literal('owner') }),
]);
export type BridgeTicketRequest = z.infer<typeof bridgeTicketRequestSchema>;

export const bridgeSendRequestSchema = z.object({
  v,
  envelope: bridgeReplyEnvelopeSchema,
  sig: signature,
  /** Public key the machine's acknowledgement of this reply must verify under. */
  ackKey,
  waitMs: z.number().int().min(0).max(BRIDGE_LIMITS.maxWaitMs).default(0),
});
export type BridgeSendRequest = z.input<typeof bridgeSendRequestSchema>;

export const bridgeErrorCodes = [
  'bad_request',
  'unauthorized',
  'stopped',
  'budget',
  'full',
  'rate_limited',
  'conflict',
  'unavailable',
] as const;
export type BridgeErrorCode = (typeof bridgeErrorCodes)[number];

const failure = z.object({
  ok: z.literal(false),
  error: z.enum(bridgeErrorCodes),
});

export const bridgeTicketResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    ticket: z.string().regex(/^[\w-]{32,128}$/u),
    expiresAt: epochMs,
  }),
  failure,
]);
export const bridgeSendResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    receipt: bridgeReceiptSchema,
    replayed: z.boolean(),
  }),
  failure,
]);
export const bridgeReceiptResponseSchema = z.union([
  z.object({ ok: z.literal(true), receipt: bridgeReceiptSchema.nullable() }),
  failure,
]);
export const bridgeLiveSchema = z.object({
  machines: z.array(bridgeMachineStatusSchema),
  pokes: z.array(bridgePokeSchema),
});
export type BridgeLive = z.infer<typeof bridgeLiveSchema>;
export const bridgeLiveResponseSchema = z.union([
  z.object({ ok: z.literal(true), live: bridgeLiveSchema }),
  failure,
]);
