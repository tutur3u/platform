import { randomUUID } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { VaultRpc } from './machine-repository';
import { createSecretsIssuance } from './secrets-issuance';
import {
  GITHUB_ISSUER,
  GITHUB_JWKS,
  type GitHubPolicy,
  OIDC_AUDIENCE,
  parsePolicies,
  verifyGitHubPolicy,
} from './secrets-oidc';
import {
  CREDENTIALS_PATH,
  EXCHANGE_PATH,
  SECRETS_ORIGIN,
} from './secrets-protocol';

const now = Date.UTC(2026, 9, 25, 12);
const seconds = now / 1000;
const policy: GitHubPolicy = {
  sub: 'repo:operator/repo:environment:production',
  repository_id: '123456',
  repository: 'operator/repo',
  ref: 'refs/heads/main',
  workflow_ref: 'operator/repo/.github/workflows/release.yml@refs/heads/main',
  environment: 'production',
  grantId: randomUUID(),
  issuerUserId: randomUUID(),
  wsId: randomUUID(),
  vaultId: randomUUID(),
};
let pair: Awaited<ReturnType<typeof generateKeyPair>>;
let jwks: { keys: Awaited<ReturnType<typeof exportJWK>>[] };
beforeAll(async () => {
  pair = await generateKeyPair('RS256');
  jwks = {
    keys: [
      { ...(await exportJWK(pair.publicKey)), kid: 'fixture', alg: 'RS256' },
    ],
  };
});
async function sign(overrides: Record<string, unknown> = {}, kid = 'fixture') {
  return new SignJWT({
    event_name: 'push',
    iss: GITHUB_ISSUER,
    aud: OIDC_AUDIENCE,
    sub: 'repo:operator/repo:environment:production',
    iat: seconds,
    nbf: seconds,
    exp: seconds + 300,
    repository_id: policy.repository_id,
    repository: policy.repository,
    ref: policy.ref,
    workflow_ref: policy.workflow_ref,
    environment: policy.environment,
    ...overrides,
  })
    .setProtectedHeader({ alg: 'RS256', kid })
    .sign(pair.privateKey);
}
function deps() {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(jwks));
  return {
    fetch: fetcher,
    enabled: () => true,
    now: () => now,
    signal: new AbortController().signal,
  };
}

describe('GitHub OIDC', () => {
  it('verifies signature and exact operator mapping with one bounded fetch', async () => {
    const d = deps();
    expect(
      await verifyGitHubPolicy(
        await sign(),
        parsePolicies(JSON.stringify([policy])),
        d
      )
    ).toEqual(policy);
    expect(d.fetch).toHaveBeenCalledTimes(1);
    expect(d.fetch.mock.calls[0]?.[0]).toBe(GITHUB_JWKS);
    expect(d.fetch.mock.calls[0]?.[1]).toMatchObject({
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
    });
  });
  it.each([
    'sub',
    'repository_id',
    'repository',
    'ref',
    'workflow_ref',
    'environment',
    'iss',
    'aud',
  ])('rejects mismatch in %s', async (field) => {
    await expect(
      verifyGitHubPolicy(await sign({ [field]: 'different' }), [policy], deps())
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
  it.each([
    { event_name: 'pull_request' },
    { event_name: 'pull_request_target' },
    { event_name: undefined },
    { ref: 'refs/pull/42/merge' },
  ])('rejects pull-request and missing event contexts', async (claims) => {
    await expect(
      verifyGitHubPolicy(await sign(claims), [policy], deps())
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
  it.each([
    { exp: seconds - 1 },
    { iat: seconds + 60 },
    { exp: seconds + 901 },
    { exp: undefined },
    { nbf: seconds + 60 },
  ])('rejects invalid token time', async (override) => {
    await expect(
      verifyGitHubPolicy(await sign(override), [policy], deps())
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
  it('unknown kid is one attempt without refresh or retry', async () => {
    const d = deps();
    await expect(
      verifyGitHubPolicy(await sign({}, 'unknown'), [policy], d)
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(d.fetch).toHaveBeenCalledTimes(1);
  });
  it('invalid signatures cannot authorize a policy', async () => {
    const other = await generateKeyPair('RS256');
    const d = deps();
    d.fetch.mockResolvedValue(
      Response.json({
        keys: [{ ...(await exportJWK(other.publicKey)), kid: 'fixture' }],
      })
    );
    await expect(
      verifyGitHubPolicy(await sign(), [policy], d)
    ).rejects.toThrow();
  });
  it('fails closed on unavailable or oversized JWKS without raw failure text', async () => {
    const d = deps();
    d.fetch.mockRejectedValue(new Error('sensitive injected claims'));
    await expect(
      verifyGitHubPolicy(await sign(), [policy], d)
    ).rejects.toMatchObject({ message: 'UNAUTHENTICATED' });
    expect(d.fetch).toHaveBeenCalledTimes(1);
    const oversized = deps();
    oversized.fetch.mockResolvedValue(
      Response.json({ keys: [], padding: 'x'.repeat(65536) })
    );
    await expect(
      verifyGitHubPolicy(await sign(), [policy], oversized)
    ).rejects.toThrow();
  });
  it('rejects ambiguous, wildcard and caller actor policy configurations', () => {
    for (const value of [
      [policy, policy],
      [{ ...policy, ref: '*' }],
      [{ ...policy, actor: randomUUID() }],
    ])
      expect(() => parsePolicies(JSON.stringify(value))).toThrow();
  });
  it('disabled makes ZERO OIDC calls', async () => {
    const d = deps();
    d.enabled = () => false;
    await expect(
      verifyGitHubPolicy(await sign(), [policy], d)
    ).rejects.toMatchObject({ code: 'STOPPED' });
    expect(d.fetch).not.toHaveBeenCalled();
  });
});

describe('credential issuance', () => {
  function setup() {
    const d = deps();
    const rpc = vi.fn<VaultRpc>(async () => ({ replayed: false }));
    const vault = vi.fn(async () => ({ role: 'owner', revision: 4 }));
    const human = vi.fn(async () => ({
      token: 'humanSignedSessionFixture',
      expiresAt: now + 300000,
    }));
    const handle = createSecretsIssuance({
      ...d,
      origin: SECRETS_ORIGIN,
      policies: JSON.stringify([policy]),
      rpc: () => rpc,
      vault,
      human,
    });
    return { ...d, rpc, vault, human, handle };
  }
  async function request(extra: Record<string, unknown> = {}) {
    return new Request(`${SECRETS_ORIGIN}${EXCHANGE_PATH}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await sign()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ requestId: randomUUID(), ...extra }),
    });
  }
  it('returns exact six-field CLI file and only digest reaches SQL', async () => {
    const d = setup();
    const response = (await d.handle(await request()))!;
    expect(response.status).toBe(200);
    const value = await response.json();
    expect(Object.keys(value).sort()).toEqual([
      'endpoint',
      'expiresAt',
      'token',
      'vaultId',
      'version',
      'workspaceId',
    ]);
    expect(value).toMatchObject({
      workspaceId: policy.wsId,
      vaultId: policy.vaultId,
      version: 1,
      endpoint: SECRETS_ORIGIN,
    });
    expect(Date.parse(value.expiresAt) - now).toBeLessThanOrEqual(900000);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('content-disposition')).toContain('attachment');
    const args = d.rpc.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
    expect(args).toMatchObject({
      p_actor: policy.issuerUserId,
      p_ws: policy.wsId,
      p_vault: policy.vaultId,
      p_action: 'token.issue',
    });
    expect(JSON.stringify(args)).not.toContain(value.token);
  });
  it('rejects caller-selected privileged identities before JWKS/SQL', async () => {
    const d = setup();
    expect(
      (await d.handle(await request({ issuerUserId: randomUUID() })))?.status
    ).toBe(400);
    expect(d.fetch).not.toHaveBeenCalled();
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it('lost issuance response stays UNKNOWN with exactly one SQL attempt', async () => {
    const d = setup();
    d.rpc.mockRejectedValue(new Error('possibly committed'));
    const response = (await d.handle(await request()))!;
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      code: 'operation_uncertain',
    });
    expect(d.rpc).toHaveBeenCalledTimes(1);
  });
  it('human download requires same-origin POST and returns same format', async () => {
    const d = setup();
    const init = {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: SECRETS_ORIGIN },
      body: JSON.stringify({
        workspaceId: policy.wsId,
        vaultId: policy.vaultId,
      }),
    };
    const response = (await d.handle(
      new Request(`${SECRETS_ORIGIN}${CREDENTIALS_PATH}`, init)
    ))!;
    expect(response.status).toBe(200);
    expect((await response.json()).token).toBe('humanSignedSessionFixture');
    expect(d.fetch).not.toHaveBeenCalled();
    const denied = await d.handle(
      new Request(`${SECRETS_ORIGIN}${CREDENTIALS_PATH}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          origin: 'https://elsewhere.test',
        },
      })
    );
    expect(denied?.status).toBe(403);
    expect(d.human).toHaveBeenCalledTimes(1);
  });
});
