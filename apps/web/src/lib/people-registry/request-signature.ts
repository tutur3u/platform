import { createHash, createPublicKey, verify } from 'node:crypto';
import { z } from 'zod';

// Machine principals sign every registry request with Ed25519. There are no
// bearer tokens: the signature binds method, path, body, audience, principal,
// key, timestamp and nonce, so a copied header is useless. The database
// checks the principal's live status, generation and kind, consumes the nonce
// and applies the per-minute limit in one call. See
// apps/docs/platform/features/people-registry.mdx#principals.

export const PEOPLE_REQUEST_DOMAIN = 'people-registry-request-v1';
export const PEOPLE_REQUEST_AUDIENCE = 'people-registry';

export type PeoplePrincipalKind = 'responder' | 'fleet' | 'import' | 'drain';

export type PeopleSignedRequest = {
  method: string;
  path: string;
  bodySha256: string;
  principalId: string;
  kid: string;
  timestamp: number;
  nonce: string;
};

export type PeoplePrincipalRpc = (
  fn: string,
  args: Record<string, unknown>
) => Promise<{ data: unknown; error: { code?: string } | null }>;

export type PeoplePrincipal = {
  principalId: string;
  wsId: string;
  kind: PeoplePrincipalKind;
};

export type PeopleAdmission =
  | { ok: true; principal: PeoplePrincipal }
  | {
      ok: false;
      reason:
        | 'unsigned'
        | 'signature_refused'
        | 'stale_request'
        | 'principal_refused'
        | 'nonce_replayed'
        | 'rate_limited'
        | 'registry_unavailable';
    };

const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const kid = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const headersSchema = z.object({
  principalId: uuid,
  kid,
  timestamp: z.string().regex(/^[1-9][0-9]{12}$/),
  // 16 to 32 random bytes, base64url without padding.
  nonce: z.string().regex(/^[A-Za-z0-9_-]{22,43}$/),
  signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/),
});
const keySchema = z.object({
  principalId: uuid,
  wsId: uuid,
  kind: z.enum(['responder', 'fleet', 'import', 'drain']),
  generation: z.number().int().positive(),
  publicKey: z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
});
const admitSchema = z.object({
  reason: z.string(),
  wsId: uuid.optional(),
  kind: z.enum(['responder', 'fleet', 'import', 'drain']).optional(),
  principalId: uuid.optional(),
});
const refusals = new Set([
  'stale_request',
  'principal_refused',
  'nonce_replayed',
  'rate_limited',
]);

// DER prefix of an Ed25519 SubjectPublicKeyInfo; the raw 32-byte key follows.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export function sha256Hex(body: Uint8Array) {
  return createHash('sha256').update(body).digest('hex');
}

// A JSON array keeps every field delimited, so no field can absorb another.
export function canonicalRequestBytes(request: PeopleSignedRequest) {
  return Buffer.from(
    `${PEOPLE_REQUEST_DOMAIN}\n${JSON.stringify([
      PEOPLE_REQUEST_AUDIENCE,
      request.method.toUpperCase(),
      request.path,
      request.bodySha256,
      request.principalId,
      request.kid,
      String(request.timestamp),
      request.nonce,
    ])}`
  );
}

export function readSignatureHeaders(headers: Headers) {
  const parsed = headersSchema.safeParse({
    principalId: headers.get('x-people-principal') ?? '',
    kid: headers.get('x-people-key-id') ?? '',
    timestamp: headers.get('x-people-timestamp') ?? '',
    nonce: headers.get('x-people-nonce') ?? '',
    signature: headers.get('x-people-signature') ?? '',
  });
  if (!parsed.success) return null;
  const nonce = Buffer.from(parsed.data.nonce, 'base64url');
  if (nonce.length < 16 || nonce.length > 32) return null;
  return { ...parsed.data, timestamp: Number(parsed.data.timestamp), nonce };
}

function verifySignature(publicKey: string, bytes: Buffer, signature: string) {
  try {
    const raw = Buffer.from(publicKey, 'base64');
    if (raw.length !== 32) return false;
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
      format: 'der',
      type: 'spki',
    });
    return verify(null, bytes, key, Buffer.from(signature, 'base64url'));
  } catch {
    return false;
  }
}

// Verifies the signature against the key's registered principal, then admits
// the request. `path` is the pathname and search exactly as received.
export async function admitSignedRequest(input: {
  headers: Headers;
  method: string;
  path: string;
  body: Uint8Array;
  kinds: readonly PeoplePrincipalKind[];
  rpc: PeoplePrincipalRpc;
}): Promise<PeopleAdmission> {
  // Bearer credentials (including Fleet desk tokens) never reach registry
  // operations.
  if (input.headers.has('authorization'))
    return { ok: false, reason: 'unsigned' };
  const signed = readSignatureHeaders(input.headers);
  if (!signed) return { ok: false, reason: 'unsigned' };

  const lookup = await input.rpc('people_principal_key', { p_kid: signed.kid });
  if (lookup.error) return { ok: false, reason: 'registry_unavailable' };
  const key = keySchema.safeParse(lookup.data);
  if (!key.success || key.data.principalId !== signed.principalId)
    return { ok: false, reason: 'signature_refused' };

  const bytes = canonicalRequestBytes({
    method: input.method,
    path: input.path,
    bodySha256: sha256Hex(input.body),
    principalId: signed.principalId,
    kid: signed.kid,
    timestamp: signed.timestamp,
    nonce: signed.nonce.toString('base64url'),
  });
  if (!verifySignature(key.data.publicKey, bytes, signed.signature))
    return { ok: false, reason: 'signature_refused' };

  // The generation read with the key must still be live at admission, so a
  // key revoked between the two calls is refused.
  const admitted = await input.rpc('people_admit_request', {
    p_principal: signed.principalId,
    p_kid: signed.kid,
    p_generation: key.data.generation,
    p_nonce: `\\x${signed.nonce.toString('hex')}`,
    p_issued_at: new Date(signed.timestamp).toISOString(),
    p_kinds: [...input.kinds],
  });
  if (admitted.error) return { ok: false, reason: 'registry_unavailable' };
  const result = admitSchema.safeParse(admitted.data);
  if (!result.success) return { ok: false, reason: 'registry_unavailable' };
  if (
    result.data.reason === 'admitted' &&
    result.data.wsId &&
    result.data.kind &&
    result.data.principalId === signed.principalId
  )
    return {
      ok: true,
      principal: {
        principalId: result.data.principalId,
        wsId: result.data.wsId,
        kind: result.data.kind,
      },
    };
  return {
    ok: false,
    reason: refusals.has(result.data.reason)
      ? (result.data.reason as Exclude<PeopleAdmission, { ok: true }>['reason'])
      : 'principal_refused',
  };
}
