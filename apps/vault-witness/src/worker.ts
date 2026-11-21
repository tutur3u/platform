/**
 * Secrets vault witness Worker. The vault API calls it with a bearer token;
 * the token only meters and gates access, because every state change is
 * verified here against signatures the API cannot forge. Bodies and
 * responses are canonical CBOR.
 */
import {
  type CanonicalValue,
  decodeCanonical,
  encodeCanonical,
  sha256,
  toHex,
  VaultCryptoError,
} from '@tuturuuu/vault-crypto';
import {
  deploymentOf,
  isStopped,
  parseSigner,
  type WitnessEnv,
} from './config';
import type { KeyringCall, VaultCall } from './objects';
import { blob } from './store';
import {
  BadRequest,
  parseAppend,
  parseAttest,
  parseAudit,
  parseConfirm,
  parseHexId,
  parseInit,
  parseKeyringAttest,
  parseKeyringConfirm,
  parseKeyringPut,
  parseTransitions,
} from './protocol';

export { KeyringWitness, VaultWitness } from './objects';

type Env = WitnessEnv & {
  readonly VAULT_WITNESS: DurableObjectNamespace<
    import('./objects').VaultWitness
  >;
  readonly KEYRING_WITNESS: DurableObjectNamespace<
    import('./objects').KeyringWitness
  >;
};

const MAX_BODY_BYTES = 256 * 1024;

const STATUS: Record<string, number> = {
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  not_initialized: 404,
  method_not_allowed: 405,
  conflict: 409,
  stale_head: 409,
  challenge_invalid: 409,
  reattest_required: 409,
  not_reattesting: 409,
  too_large: 413,
  unsupported_media_type: 415,
  rejected: 422,
  limit: 422,
  rate_limited: 429,
  internal: 500,
  misconfigured: 503,
  stopped: 503,
};

function cbor(result: CanonicalValue & { ok?: boolean; error?: string }) {
  const status =
    result.ok === false ? (STATUS[result.error ?? ''] ?? 500) : 200;
  return new Response(blob(encodeCanonical(result)), {
    status,
    headers: {
      'content-type': 'application/cbor',
      'cache-control': 'no-store',
    },
  });
}

const failure = (error: string) => cbor({ ok: false, error });

/** Compares SHA-256 digests so timing reveals nothing about the token. */
function tokenMatches(request: Request, token: string | undefined): boolean {
  if (!token || token.length < 32) return false;
  const header = request.headers.get('authorization') ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = sha256(new TextEncoder().encode(given));
  const b = sha256(new TextEncoder().encode(token));
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

async function readBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) throw new RangeError('too_large');
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new RangeError('too_large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return decodeCanonical(bytes);
}

function vaultCall(
  op: string,
  body: unknown,
  deployment: string,
  vaultId: Uint8Array
): VaultCall | null {
  switch (op) {
    case 'init':
      return {
        op,
        input: { ...parseInit(body), vault_id: vaultId },
        deployment,
      };
    case 'challenge':
      return { op };
    case 'attest':
      return { op, input: parseAttest(body) };
    case 'append':
      return { op, input: parseAppend(body) };
    case 'transitions':
      return { op, input: parseTransitions(body) };
    case 'audit':
      return { op, input: parseAudit(body) };
    case 'confirm':
      return { op, input: parseConfirm(body) };
    default:
      return null;
  }
}

function keyringCall(
  op: string,
  body: unknown,
  deployment: string,
  id: Uint8Array
): KeyringCall | null {
  switch (op) {
    case 'put':
      return {
        op,
        input: { ...parseKeyringPut(body), deployment, vault_user_id: id },
      };
    case 'attest':
      return { op, input: { ...parseKeyringAttest(body), vault_user_id: id } };
    case 'confirm':
      return { op, input: parseKeyringConfirm(body) };
    default:
      return null;
  }
}

const ROUTE = /^\/v1\/(vaults|keyrings)\/([0-9a-f]+)\/([a-z]+)$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const signer = parseSigner(env.WITNESS_SIGNING_KEY);
    const deployment = deploymentOf(env);
    if (url.pathname === '/v1/health') {
      return Response.json(
        {
          ok: Boolean(signer && deployment) && !isStopped(env),
          stopped: isStopped(env),
          generation: signer?.generation ?? null,
          public_key: signer ? toHex(signer.publicKey) : null,
        },
        { headers: { 'cache-control': 'no-store' } }
      );
    }
    const match = ROUTE.exec(url.pathname);
    if (!match) return failure('not_found');
    if (request.method !== 'POST') return failure('method_not_allowed');
    if (!tokenMatches(request, env.WITNESS_API_TOKEN))
      return failure('unauthorized');
    if (isStopped(env)) return failure('stopped');
    if (!signer || !deployment) return failure('misconfigured');
    if (request.headers.get('content-type') !== 'application/cbor')
      return failure('unsupported_media_type');
    const [, kind, idHex, op] = match as unknown as [
      string,
      string,
      string,
      string,
    ];
    const id = parseHexId(idHex, kind === 'vaults' ? 32 : 16);
    if (!id) return failure('not_found');
    try {
      const body = await readBody(request);
      if (kind === 'vaults') {
        const call = vaultCall(op, body, deployment, id);
        if (!call) return failure('not_found');
        const stub = env.VAULT_WITNESS.get(
          env.VAULT_WITNESS.idFromName(`${deployment}:${idHex}`)
        );
        return cbor(
          (await stub.call(call)) as unknown as CanonicalValue & { ok: boolean }
        );
      }
      const call = keyringCall(op, body, deployment, id);
      if (!call) return failure('not_found');
      const stub = env.KEYRING_WITNESS.get(
        env.KEYRING_WITNESS.idFromName(`${deployment}:${idHex}`)
      );
      return cbor(
        (await stub.call(call)) as unknown as CanonicalValue & { ok: boolean }
      );
    } catch (error) {
      if (error instanceof RangeError && error.message === 'too_large')
        return failure('too_large');
      if (error instanceof BadRequest || error instanceof VaultCryptoError)
        return failure('bad_request');
      console.error('[vault-witness] request failed', error);
      return failure('internal');
    }
  },
};
