import { z } from 'zod';

/**
 * Signed tickets for the Cloudflare chat-realtime Worker.
 *
 * Wire format: `base64url(json).base64url(hmacSha256(DOMAIN + payload))`.
 * The domain prefix keeps these signatures distinct from every other HMAC
 * token that might share a secret. Uses WebCrypto only, so the same module runs
 * in Node (apps/web) and workerd (apps/chat-realtime).
 */
export const CHAT_REALTIME_TICKET_AUDIENCE = 'chat-realtime';
export const CHAT_REALTIME_SUBSCRIBE_MAX_TTL_SECONDS = 15 * 60;
export const CHAT_REALTIME_PUBLISH_MAX_TTL_SECONDS = 60;
export const CHAT_REALTIME_INBOX_MAX_TTL_SECONDS = 5 * 60;
export const CHAT_REALTIME_TICKET_MAX_LENGTH = 4096;
export const CHAT_REALTIME_SECRET_MIN_LENGTH = 32;
export const CHAT_REALTIME_TICKET_CLOCK_SKEW_SECONDS = 30;
const SIGNATURE_DOMAIN = 'tuturuuu.chat-realtime.ticket.v1.';
/** 32-byte HMAC as unpadded base64url whose last character has no spare bits. */
const CANONICAL_SIGNATURE = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u;

const uuid = z.string().uuid();
const epochSeconds = z.number().int().positive();

const subscribeTicketSchema = z
  .object({
    aud: z.literal(CHAT_REALTIME_TICKET_AUDIENCE),
    conversationId: uuid.optional(),
    exp: epochSeconds,
    iat: epochSeconds,
    kind: z.literal('subscribe'),
    room: z.enum(['inbox', 'conversation']),
    userId: uuid,
    v: z.literal(1),
    wsId: uuid,
  })
  .strict()
  .refine(
    (ticket) =>
      ticket.room === 'conversation'
        ? Boolean(ticket.conversationId)
        : ticket.conversationId === undefined,
    { message: 'conversationId must match the room' }
  );

const publishTicketSchema = z
  .object({
    aud: z.literal(CHAT_REALTIME_TICKET_AUDIENCE),
    bodySha256: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
    exp: epochSeconds,
    iat: epochSeconds,
    kind: z.literal('publish'),
    v: z.literal(1),
    wsId: uuid,
  })
  .strict();

export const chatRealtimeTicketSchema = z.union([
  subscribeTicketSchema,
  publishTicketSchema,
]);

export type ChatRealtimeSubscribeTicket = z.infer<typeof subscribeTicketSchema>;
export type ChatRealtimePublishTicket = z.infer<typeof publishTicketSchema>;
export type ChatRealtimeTicket = z.infer<typeof chatRealtimeTicketSchema>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/=+$/u, '')
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/u.test(value)) return null;
  try {
    const binary = atob(value.replace(/-/gu, '+').replace(/_/gu, '/'));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function requireSecret(secret: string | undefined) {
  const trimmed = secret?.trim() ?? '';
  if (trimmed.length < CHAT_REALTIME_SECRET_MIN_LENGTH) {
    throw new Error(
      `Chat realtime tickets require a secret of at least ${CHAT_REALTIME_SECRET_MIN_LENGTH} characters`
    );
  }
  return trimmed;
}

async function hmacKey(secret: string, usage: 'sign' | 'verify') {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    [usage]
  );
}

/** SHA-256 of a publish body, base64url without padding. */
export async function chatRealtimeBodyDigest(body: string | Uint8Array) {
  const bytes = typeof body === 'string' ? encoder.encode(body) : body;
  const digest = await crypto.subtle.digest(
    'SHA-256',
    bytes as Uint8Array<ArrayBuffer>
  );
  return toBase64Url(new Uint8Array(digest));
}

function maxTtl(ticket: ChatRealtimeTicket) {
  if (ticket.kind === 'publish') return CHAT_REALTIME_PUBLISH_MAX_TTL_SECONDS;
  return ticket.room === 'inbox'
    ? CHAT_REALTIME_INBOX_MAX_TTL_SECONDS
    : CHAT_REALTIME_SUBSCRIBE_MAX_TTL_SECONDS;
}

function withinLifetime(ticket: ChatRealtimeTicket, nowSeconds: number) {
  return (
    ticket.exp > nowSeconds &&
    ticket.iat <= nowSeconds + CHAT_REALTIME_TICKET_CLOCK_SKEW_SECONDS &&
    ticket.exp > ticket.iat &&
    ticket.exp - ticket.iat <= maxTtl(ticket)
  );
}

export async function signChatRealtimeTicket(
  ticket: ChatRealtimeTicket,
  secret: string | undefined
) {
  const parsed = chatRealtimeTicketSchema.parse(ticket);
  if (parsed.exp - parsed.iat > maxTtl(parsed) || parsed.exp <= parsed.iat) {
    throw new Error('Chat realtime ticket lifetime exceeds its kind limit');
  }
  const encoded = toBase64Url(encoder.encode(JSON.stringify(parsed)));
  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(requireSecret(secret), 'sign'),
    encoder.encode(SIGNATURE_DOMAIN + encoded)
  );
  return `${encoded}.${toBase64Url(new Uint8Array(signature))}`;
}

function verificationSecrets(
  secrets: string | undefined | readonly (string | undefined)[]
) {
  const [current, ...previous] = Array.isArray(secrets) ? secrets : [secrets];
  const keys = [requireSecret(current)];
  for (const candidate of previous) {
    // An unset previous secret is the steady state; a set one must be strong.
    if (candidate?.trim()) keys.push(requireSecret(candidate));
  }
  return keys;
}

/**
 * Returns the verified ticket, or null for any malformed, forged, expired or
 * over-long ticket. Throws only when the verifier itself is misconfigured.
 *
 * `secrets` is the current secret, optionally followed by previous secrets
 * that stay valid during a rotation. Signers always use the current secret.
 */
export async function verifyChatRealtimeTicket(
  token: string,
  secrets: string | undefined | readonly (string | undefined)[],
  nowMs = Date.now()
): Promise<ChatRealtimeTicket | null> {
  const keys = await Promise.all(
    verificationSecrets(secrets).map((secret) => hmacKey(secret, 'verify'))
  );
  if (!token || token.length > CHAT_REALTIME_TICKET_MAX_LENGTH) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [encoded, signature] = parts as [string, string];
  if (!CANONICAL_SIGNATURE.test(signature)) return null;
  const signatureBytes = fromBase64Url(signature);
  const payloadBytes = fromBase64Url(encoded);
  if (!signatureBytes || !payloadBytes) return null;

  const signed = encoder.encode(SIGNATURE_DOMAIN + encoded);
  let valid = false;
  // Check every key so timing does not reveal which key matched.
  for (const key of keys) {
    if (await crypto.subtle.verify('HMAC', key, signatureBytes, signed)) {
      valid = true;
    }
  }
  if (!valid) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(decoder.decode(payloadBytes));
  } catch {
    return null;
  }
  const parsed = chatRealtimeTicketSchema.safeParse(payload);
  if (!parsed.success) return null;
  return withinLifetime(parsed.data, Math.floor(nowMs / 1000))
    ? parsed.data
    : null;
}

/** Constant-time comparison of two base64url SHA-256 digests. */
export function chatRealtimeDigestsEqual(left: string, right: string) {
  const a = fromBase64Url(left);
  const b = fromBase64Url(right);
  if (!a || !b || a.length !== 32 || b.length !== 32) return false;
  let diff = 0;
  for (let index = 0; index < 32; index += 1)
    diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return diff === 0;
}
