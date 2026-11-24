/**
 * Finalization permits. The service-only finalization path signs one permit
 * per transaction with a dedicated Ed25519 key held outside Postgres; this
 * Worker holds only the public key. A permit binds a SHA-256 of the
 * canonical JSON of every structured field (the kid included), the kid
 * itself and its audience (the signer environment, `SSO_SIGNER_ENV`), lives
 * 60 seconds or less and is claimed once in `SignerReplay`.
 * The wire form lives in `@tuturuuu/sso/signer-permit`, which the issuer
 * imports too.
 */
import {
  canonicalJson,
  fieldsHash,
  permitMessage,
} from '@tuturuuu/sso/signer-permit';
import { z } from 'zod';
import { SIGNER_ENVIRONMENTS } from './environment';
import { kidSchema } from './input';
import {
  type Bytes,
  decodeBase64Url,
  encodeBase64Url,
  type KeySet,
  keysOf,
} from './key-set';

export const MAX_PERMIT_LIFETIME_MS = 60_000;
/** Allowed lead of a permit's issue time over the Worker clock. */
export const PERMIT_ISSUE_SKEW_MS = 5_000;

const instantMs = z
  .number()
  .int()
  .min(1_000_000_000_000)
  .max(9_999_999_999_999);
export const permitSchema = z
  .object({
    v: z.literal(2),
    aud: z.enum(SIGNER_ENVIRONMENTS),
    id: z.string().regex(/^[A-Za-z0-9_-]{22,43}$/u),
    kid: kidSchema,
    iat: instantMs,
    exp: instantMs,
    fields: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
    sig: z.string().regex(/^[A-Za-z0-9_-]{86}$/u),
  })
  .strict();
export type Permit = z.infer<typeof permitSchema>;
/** What the issuer produces; `aud` is checked only when verified. */
export type IssuedPermit = Omit<Permit, 'aud'> & { aud: string };

export type PermitResult =
  | Readonly<{ ok: true; permit: Permit }>
  | Readonly<{
      ok: false;
      error: 'misconfigured' | 'permit_invalid' | 'permit_expired';
    }>;

export { canonicalJson, fieldsHash };

function ed25519Key(raw: Bytes) {
  return crypto.subtle.importKey('raw', raw, { name: 'Ed25519' }, false, [
    'verify',
  ]);
}

/** Finalization-side helper: one permit over the structured input. */
export async function issuePermit(input: {
  privateKey: CryptoKey;
  audience: string;
  fields: { kid: string } & Record<string, unknown>;
  id: string;
  nowMs: number;
  lifetimeMs?: number;
}): Promise<IssuedPermit> {
  const claims = {
    v: 2 as const,
    aud: input.audience,
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
 * Checks the signature first, then the audience, kid, lifetime and field
 * hash. The caller still has to claim `permit.id` once before acting on it.
 */
export async function verifyPermit(input: {
  permit: unknown;
  fields: { kid: string } & Record<string, unknown>;
  keys: KeySet | null;
  /** This deployment's `SSO_SIGNER_ENV`; null refuses as misconfigured. */
  audience: string | null;
  nowMs: number;
}): Promise<PermitResult> {
  if (!input.keys || !input.audience) {
    return { ok: false, error: 'misconfigured' };
  }
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
  // Fields with no canonical form (an ill-formed string, an unsupported
  // value) cannot match any permit.
  let expected: string;
  try {
    expected = await fieldsHash(input.fields);
  } catch {
    return { ok: false, error: 'permit_invalid' };
  }
  if (
    permit.aud !== input.audience ||
    permit.kid !== input.fields.kid ||
    permit.fields !== expected
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
