import { beforeAll, describe, expect, it } from 'vitest';
import {
  authorizeForEnvironment,
  type GithubClaims,
  githubKeySource,
  verifyGithubToken,
} from './oidc';
import { findProject } from './projects';
import { AUDIENCE, githubSigner, REPOSITORY_ID } from './test-support';

let signer: Awaited<ReturnType<typeof githubSigner>>;
beforeAll(async () => {
  signer = await githubSigner();
});

const verify = (token: string) =>
  verifyGithubToken(token, {
    audience: AUDIENCE,
    repositoryId: REPOSITORY_ID,
    keys: async (kid) => (kid === signer.jwk.kid ? signer.jwk : null),
    nowSeconds: Math.floor(Date.now() / 1000),
  });

describe('GitHub OIDC verification', () => {
  it('accepts a correctly signed token', async () => {
    const result = await verify(await signer.sign());
    expect(result).toMatchObject({
      ok: true,
      claims: { run_id: '1000', ref: 'refs/heads/production' },
    });
  });

  it.each([
    ['BAD_AUDIENCE', { aud: 'sts.amazonaws.com' }],
    ['BAD_ISSUER', { iss: 'https://example.com' }],
    ['EXPIRED', { exp: Math.floor(Date.now() / 1000) - 3600 }],
    ['NOT_YET_VALID', { nbf: Math.floor(Date.now() / 1000) + 3600 }],
    ['BAD_REPOSITORY', { repository_id: '1' }],
    ['BAD_EVENT', { event_name: 'pull_request' }],
    ['BAD_EVENT', { event_name: 'pull_request_target' }],
    ['MALFORMED', { run_id: 'not-a-number' }],
  ])('rejects %s', async (reason, claims) => {
    expect(await verify(await signer.sign(claims))).toEqual({
      ok: false,
      reason,
    });
  });

  it('rejects unsigned, re-signed and tampered tokens', async () => {
    const token = await signer.sign();
    const [header, payload, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload!, 'base64url').toString()),
        ref: 'refs/heads/attacker',
      })
    ).toString('base64url');
    expect(await verify(`${header}.${forged}.${signature}`)).toEqual({
      ok: false,
      reason: 'BAD_SIGNATURE',
    });
    expect(
      await verify(await signer.sign({}, { alg: 'none', kid: 'test-key' }))
    ).toEqual({ ok: false, reason: 'UNSUPPORTED_ALG' });
    const other = await githubSigner('other-key');
    expect(
      await verify(await other.sign({}, { alg: 'RS256', kid: 'other-key' }))
    ).toEqual({ ok: false, reason: 'UNKNOWN_KEY' });
    expect(await verify('not.a.jwt.at.all')).toEqual({
      ok: false,
      reason: 'MALFORMED',
    });
  });

  it('refetches signing keys at most once a minute', async () => {
    let now = 0;
    let fetches = 0;
    const keys = githubKeySource(
      async () => {
        fetches += 1;
        return { keys: [signer.jwk] };
      },
      () => now
    );
    expect(await keys('test-key')).toEqual(signer.jwk);
    expect(await keys('forged-1')).toBeNull();
    expect(await keys('forged-2')).toBeNull();
    expect(fetches).toBe(1);
    now = 61_000;
    expect(await keys('forged-3')).toBeNull();
    expect(fetches).toBe(2);
  });

  it('keeps cached keys when a refetch fails', async () => {
    let now = 0;
    let fail = false;
    const keys = githubKeySource(
      async () => {
        if (fail) throw new Error('offline');
        return { keys: [signer.jwk] };
      },
      () => now
    );
    await keys('test-key');
    fail = true;
    now = 11 * 60_000;
    expect(await keys('test-key')).toEqual(signer.jwk);
  });
});

describe('environment authorization', () => {
  const calendar = findProject('calendar')!;
  const base: GithubClaims = {
    repository: 'tutur3u/platform',
    repository_id: REPOSITORY_ID,
    ref: 'refs/heads/production',
    sha: 'a'.repeat(40),
    run_id: '1',
    run_attempt: '1',
    event_name: 'push',
    job_workflow_ref:
      'tutur3u/platform/.github/workflows/vercel-production-calendar.yaml@refs/heads/production',
    workflow_ref:
      'tutur3u/platform/.github/workflows/vercel-production.yaml@refs/heads/production',
    actor: 'bot',
  };

  it('requires the catalog workflow at the protected ref', () => {
    expect(authorizeForEnvironment(base, calendar, 'production')).toBeNull();
    expect(authorizeForEnvironment(base, calendar, 'staging')).toBe('BAD_REF');
    expect(
      authorizeForEnvironment(
        {
          ...base,
          job_workflow_ref:
            'tutur3u/platform/.github/workflows/vercel-production-mail.yaml@refs/heads/production',
        },
        calendar,
        'production'
      )
    ).toBe('BAD_WORKFLOW');
    expect(
      authorizeForEnvironment(
        {
          ...base,
          job_workflow_ref:
            'tutur3u/platform/.github/workflows/vercel-production-calendar.yaml@refs/heads/feature',
        },
        calendar,
        'production'
      )
    ).toBe('BAD_WORKFLOW');
  });

  it('rejects previews: no workflow reports one', () => {
    const preview = {
      ...base,
      ref: 'refs/heads/main',
      event_name: 'workflow_dispatch',
      job_workflow_ref:
        'tutur3u/platform/.github/workflows/vercel-preview-calendar.yaml@refs/heads/main',
    };
    expect(authorizeForEnvironment(preview, calendar, 'preview')).toBe(
      'BAD_WORKFLOW'
    );
    expect(authorizeForEnvironment(preview, calendar, 'staging')).toBe(
      'BAD_WORKFLOW'
    );
  });

  it('binds the shared staging publisher to its calling app workflow', () => {
    const staging = (caller: string) => ({
      ...base,
      ref: 'refs/heads/main',
      job_workflow_ref:
        'tutur3u/platform/.github/workflows/wave1-native-publish.yaml@refs/heads/main',
      workflow_ref: `tutur3u/platform/.github/workflows/${caller}@refs/heads/main`,
    });
    expect(
      authorizeForEnvironment(
        staging('calendar-cloudflare.yaml'),
        calendar,
        'staging'
      )
    ).toBeNull();
    // A publisher run started for another app cannot report for calendar.
    expect(
      authorizeForEnvironment(
        staging('mail-cloudflare.yaml'),
        calendar,
        'staging'
      )
    ).toBe('BAD_WORKFLOW');
    expect(
      authorizeForEnvironment(
        staging('calendar-cloudflare.yaml'),
        findProject('mail')!,
        'staging'
      )
    ).toBe('BAD_WORKFLOW');
  });
});
