/**
 * Finalization permits. The service-only finalization path signs one permit
 * per transaction with a dedicated Ed25519 key held outside Postgres; this
 * Worker holds only the public key. A permit binds a SHA-256 of the
 * canonical JSON of every structured field (the kid included) plus the kid
 * itself, lives 60 seconds or less and is claimed once in `SignerReplay`.
 */
import { z } from 'zod';
import { kidSchema } from './input';
import {
  type Bytes,
  decodeBase64Url,
  encodeBase64Url,
  type KeySet,
  keysOf,
} from './key-set';
import { sha256 } from './request-auth';

export const MAX_PERMIT_LIFETIME_MS = 60_000;
/** Allowed lead of a permit's issue time over the Worker clock. */
export const PERMIT_ISSUE_SKEW_MS = 5_000;
const FIELDS_DOMAIN = 'ttr-sso-permit-fields-v1';
const PERMIT_DOMAIN = 'ttr-sso-permit-v1';

const instantMs = z
  .number()
  .int()
  .min(1_000_000_000_000)
  .max(9_999_999_999_999);
export const permitSchema = z
  .object({
    v: z.literal(1),
    id: z.string().regex(/^[A-Za-z0-9_-]{22,43}$/u),
    kid: kidSchema,
    iat: instantMs,
    exp: instantMs,
    fields: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
    sig: z.string().regex(/^[A-Za-z0-9_-]{86}$/u),
  })
  .strict();
export type Permit = z.infer<typeof permitSchema>;

export type PermitResult =
  | Readonly<{ ok: true; permit: Permit }>
  | Readonly<{
      ok: false;
      error: 'misconfigured' | 'permit_invalid' | 'permit_expired';
    }>;

const encoder = new TextEncoder();

/** Sorted-key JSON over plain objects, strings, booleans and integers. */
export function canonicalJson(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return JSON.stringify(value);
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const entries = Object.keys(value)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`
      );
    return `{${entries.join(',')}}`;
  }
  throw new TypeError('canonicalJson: unsupported value');
}

export async function fieldsHash(input: unknown): Promise<string> {
  return encodeBase64Url(
    await sha256(encoder.encode(`${FIELDS_DOMAIN}\n${canonicalJson(input)}`))
  );
}

function permitMessage(permit: Omit<Permit, 'sig'>): Bytes {
  return encoder.encode(
    `${PERMIT_DOMAIN}\n${JSON.stringify([permit.v, permit.id, permit.kid, permit.iat, permit.exp, permit.fields])}`
  );
}

function ed25519Key(raw: Bytes) {
  return crypto.subtle.importKey('raw', raw, { name: 'Ed25519' }, false, [
    'verify',
  ]);
}

/** Finalization-side helper: one permit over the structured input. */
export async function issuePermit(input: {
  privateKey: CryptoKey;
  fields: { kid: string } & Record<string, unknown>;
  id: string;
  nowMs: number;
  lifetimeMs?: number;
}): Promise<Permit> {
  const claims = {
    v: 1 as const,
    id: input.id,
    kid: input.fields.kid,
    iat: input.nowMs,
    exp: input.nowMs + (input.lifetimeMs ?? MAX_PERMIT_LIFETIME_MS),
    fields: await fieldsHash(input.fields),
  };
  const signature = await crypto.subtle.sign(
    'Ed25519',
    input.privateKey,
    permitMessage(claims)
  );
  return { ...claims, sig: encodeBase64Url(new Uint8Array(signature)) };
}

/**
 * Checks the signature first, then the kid, lifetime and field hash. The
 * caller still has to claim `permit.id` once before acting on it.
 */
export async function verifyPermit(input: {
  permit: unknown;
  fields: { kid: string } & Record<string, unknown>;
  keys: KeySet | null;
  nowMs: number;
}): Promise<PermitResult> {
  if (!input.keys) return { ok: false, error: 'misconfigured' };
  const parsed = permitSchema.safeParse(input.permit);
  if (!parsed.success) return { ok: false, error: 'permit_invalid' };
  const permit = parsed.data;
  const signature = decodeBase64Url(permit.sig, 64);
  if (signature?.length !== 64) return { ok: false, error: 'permit_invalid' };
  const message = permitMessage(permit);
  let signed = false;
  for (const key of keysOf(input.keys)) {
    signed ||= await crypto.subtle.verify(
      'Ed25519',
      await ed25519Key(key),
      signature,
      message
    );
  }
  if (!signed) return { ok: false, error: 'permit_invalid' };
  if (
    permit.kid !== input.fields.kid ||
    permit.fields !== (await fieldsHash(input.fields))
  ) {
    return { ok: false, error: 'permit_invalid' };
  }
  const lifetime = permit.exp - permit.iat;
  if (lifetime <= 0 || lifetime > MAX_PERMIT_LIFETIME_MS) {
    return { ok: false, error: 'permit_invalid' };
  }
  if (
    permit.iat > input.nowMs + PERMIT_ISSUE_SKEW_MS ||
    input.nowMs >= permit.exp
  ) {
    return { ok: false, error: 'permit_expired' };
  }
  return { ok: true, permit };
}
