import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  admitSignedRequest,
  canonicalRequestBytes,
  type PeoplePrincipalRpc,
  sha256Hex,
} from './request-signature';

const principalId = '11111111-1111-4111-8111-111111111111';
const wsId = '22222222-2222-4222-8222-222222222222';
const kid = 'responder-key-1';
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const rawPublicKey = publicKey
  .export({ format: 'der', type: 'spki' })
  .subarray(-32)
  .toString('base64');

function signedHeaders(
  body: Uint8Array,
  overrides: { path?: string; method?: string; timestamp?: number } = {}
) {
  const nonce = randomBytes(16).toString('base64url');
  const timestamp = overrides.timestamp ?? Date.now();
  const bytes = canonicalRequestBytes({
    method: overrides.method ?? 'POST',
    path: overrides.path ?? '/api/v1/people/recall',
    bodySha256: sha256Hex(body),
    principalId,
    kid,
    timestamp,
    nonce,
  });
  return new Headers({
    'x-people-principal': principalId,
    'x-people-key-id': kid,
    'x-people-timestamp': String(timestamp),
    'x-people-nonce': nonce,
    'x-people-signature': sign(null, bytes, privateKey).toString('base64url'),
  });
}

function registry(admitReason = 'admitted') {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const rpc: PeoplePrincipalRpc = vi.fn(async (fn, args) => {
    calls.push([fn, args]);
    if (fn === 'people_principal_key')
      return {
        data: {
          principalId,
          wsId,
          kind: 'responder',
          generation: 3,
          publicKey: rawPublicKey,
        },
        error: null,
      };
    return {
      data:
        admitReason === 'admitted'
          ? { reason: 'admitted', wsId, kind: 'responder', principalId }
          : { reason: admitReason },
      error: null,
    };
  });
  return { rpc, calls };
}

const body = new TextEncoder().encode('{"k":3}');
const admit = (headers: Headers, rpc: PeoplePrincipalRpc, extra = {}) =>
  admitSignedRequest({
    headers,
    method: 'POST',
    path: '/api/v1/people/recall',
    body,
    kinds: ['responder'],
    rpc,
    ...extra,
  });

describe('admitSignedRequest', () => {
  it('admits a valid signature with the generation read alongside the key', async () => {
    const { rpc, calls } = registry();
    await expect(admit(signedHeaders(body), rpc)).resolves.toEqual({
      ok: true,
      principal: { principalId, wsId, kind: 'responder' },
    });
    const [, args] = calls[1] ?? [];
    expect(args).toMatchObject({
      p_principal: principalId,
      p_kid: kid,
      p_generation: 3,
      p_kinds: ['responder'],
    });
    expect(String(args?.p_nonce)).toMatch(/^\\x[0-9a-f]{32}$/);
  });

  it.each([
    ['a different body', { body: new TextEncoder().encode('{"k":4}') }],
    ['a different path', { path: '/api/v1/people/events' }],
    ['a different method', { method: 'PUT' }],
  ])('refuses a signature replayed onto %s', async (_name, extra) => {
    const { rpc, calls } = registry();
    await expect(admit(signedHeaders(body), rpc, extra)).resolves.toEqual({
      ok: false,
      reason: 'signature_refused',
    });
    expect(calls.map(([fn]) => fn)).toEqual(['people_principal_key']);
  });

  it('refuses a key registered to another principal', async () => {
    const rpc: PeoplePrincipalRpc = async () => ({
      data: {
        principalId: '33333333-3333-4333-8333-333333333333',
        wsId,
        kind: 'responder',
        generation: 1,
        publicKey: rawPublicKey,
      },
      error: null,
    });
    await expect(admit(signedHeaders(body), rpc)).resolves.toEqual({
      ok: false,
      reason: 'signature_refused',
    });
  });

  it('refuses an unknown or revoked key', async () => {
    const rpc: PeoplePrincipalRpc = async () => ({ data: null, error: null });
    await expect(admit(signedHeaders(body), rpc)).resolves.toEqual({
      ok: false,
      reason: 'signature_refused',
    });
  });

  it('refuses bearer credentials and missing headers before any lookup', async () => {
    const { rpc } = registry();
    const headers = signedHeaders(body);
    headers.set('authorization', 'Bearer ttr_fleet_desk_x.y');
    await expect(admit(headers, rpc)).resolves.toEqual({
      ok: false,
      reason: 'unsigned',
    });
    await expect(admit(new Headers(), rpc)).resolves.toEqual({
      ok: false,
      reason: 'unsigned',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(['nonce_replayed', 'stale_request', 'rate_limited'])(
    'passes the %s refusal through',
    async (reason) => {
      const { rpc } = registry(reason);
      await expect(admit(signedHeaders(body), rpc)).resolves.toEqual({
        ok: false,
        reason,
      });
    }
  );

  it('maps unknown admission reasons and database errors to refusals', async () => {
    const { rpc } = registry('something_else');
    await expect(admit(signedHeaders(body), rpc)).resolves.toEqual({
      ok: false,
      reason: 'principal_refused',
    });
    const failing: PeoplePrincipalRpc = async () => ({
      data: null,
      error: { code: '08006' },
    });
    await expect(admit(signedHeaders(body), failing)).resolves.toEqual({
      ok: false,
      reason: 'registry_unavailable',
    });
  });
});
