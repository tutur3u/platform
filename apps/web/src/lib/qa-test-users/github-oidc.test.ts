import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  SignJWT,
} from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  QA_CI_JOB_WORKFLOW_REF,
  QA_CI_OIDC_AUDIENCE,
  QA_CI_OIDC_ISSUER,
  verifyQaCiToken,
} from './github-oidc';

type Keys = Awaited<ReturnType<typeof generateKeyPair>>;
let signing: Keys;
let other: Keys;
let keys: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  signing = await generateKeyPair('RS256');
  other = await generateKeyPair('RS256');
  keys = createLocalJWKSet({
    keys: [
      { ...(await exportJWK(signing.publicKey)), kid: 'k1', alg: 'RS256' },
    ],
  });
});

const GOOD_CLAIMS: JWTPayload = {
  repository: 'tutur3u/platform',
  repository_id: '536896722',
  repository_owner_id: '107694301',
  ref: 'refs/heads/main',
  job_workflow_ref: QA_CI_JOB_WORKFLOW_REF,
  workflow_ref: QA_CI_JOB_WORKFLOW_REF,
  environment: 'upskii-production-e2e',
  event_name: 'workflow_dispatch',
  run_id: '1234567890',
  run_attempt: '1',
  sha: 'a'.repeat(40),
  actor: 'vhpx',
};

async function token(
  claims: JWTPayload = {},
  {
    key = signing.privateKey,
    iss = QA_CI_OIDC_ISSUER,
    aud = QA_CI_OIDC_AUDIENCE as string | string[],
    iat = Math.floor(Date.now() / 1000),
    exp = iat + 300,
  }: {
    key?: CryptoKey;
    iss?: string;
    aud?: string | string[];
    iat?: number;
    exp?: number;
  } = {}
) {
  return new SignJWT({ ...GOOD_CLAIMS, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(iss)
    .setAudience(aud)
    .setIssuedAt(iat)
    .setNotBefore(iat)
    .setExpirationTime(exp)
    .sign(key);
}

describe('verifyQaCiToken', () => {
  it('admits the pinned workflow and returns only loggable claims', async () => {
    const result = await verifyQaCiToken(await token(), { keys });
    expect(result).toEqual({
      ok: true,
      claims: {
        repository: 'tutur3u/platform',
        runId: '1234567890',
        runAttempt: '1',
        sha: 'a'.repeat(40),
        eventName: 'workflow_dispatch',
        actor: 'vhpx',
      },
    });
  });

  it.each(['workflow_run', 'repository_dispatch', 'schedule'])(
    'admits the %s event',
    async (event_name) => {
      const result = await verifyQaCiToken(await token({ event_name }), {
        keys,
      });
      expect(result.ok).toBe(true);
    }
  );

  it.each([
    ['repository', { repository: 'tutur3u/fork' }],
    ['repository_id', { repository_id: '1' }],
    ['repository_owner_id', { repository_owner_id: '1' }],
    ['ref', { ref: 'refs/heads/feature' }],
    [
      'job_workflow_ref',
      {
        job_workflow_ref:
          'tutur3u/platform/.github/workflows/other.yaml@refs/heads/main',
      },
    ],
    [
      'job_workflow_ref',
      {
        job_workflow_ref:
          'tutur3u/platform/.github/workflows/upskii-production-e2e.yaml@refs/heads/feature',
      },
    ],
    ['environment', { environment: 'production' }],
    ['event_name', { event_name: 'pull_request' }],
    ['event_name', { event_name: 'push' }],
    ['event_name', { event_name: undefined }],
    ['run_id', { run_id: undefined }],
    ['run_id', { run_id: '12; drop' }],
    ['run_id', { run_attempt: '' }],
  ])('refuses a %s mismatch with 403', async (claim, claims) => {
    const result = await verifyQaCiToken(await token(claims), { keys });
    expect(result).toEqual({
      ok: false,
      status: 403,
      reason: `claim_${claim}`,
    });
  });

  it.each([
    ['the wrong issuer', { iss: 'https://token.actions.example.com' }],
    ['the wrong audience', { aud: 'https://tuturuuu.com/other' }],
    [
      'several audiences',
      { aud: [QA_CI_OIDC_AUDIENCE, 'https://tuturuuu.com/other'] },
    ],
  ])('refuses %s with 401', async (_label, options) => {
    const result = await verifyQaCiToken(await token({}, options), { keys });
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it('refuses a bad signature', async () => {
    const result = await verifyQaCiToken(
      await token({}, { key: other.privateKey }),
      { keys }
    );
    expect(result).toEqual({ ok: false, status: 401, reason: 'signature' });
  });

  it('refuses an expired token past the skew allowance', async () => {
    const iat = Math.floor(Date.now() / 1000) - 600;
    const result = await verifyQaCiToken(
      await token({}, { iat, exp: iat + 300 }),
      { keys }
    );
    expect(result).toEqual({ ok: false, status: 401, reason: 'expired' });
  });

  it('accepts small clock skew but refuses a not-yet-valid token', async () => {
    const soon = Math.floor(Date.now() / 1000) + 30;
    expect(
      (await verifyQaCiToken(await token({}, { iat: soon }), { keys })).ok
    ).toBe(true);
    const later = Math.floor(Date.now() / 1000) + 600;
    expect(
      await verifyQaCiToken(await token({}, { iat: later }), { keys })
    ).toMatchObject({ ok: false, status: 401 });
  });

  it('refuses a token older than an hour even before it expires', async () => {
    const iat = Math.floor(Date.now() / 1000) - 2 * 60 * 60;
    expect(
      await verifyQaCiToken(await token({}, { iat, exp: iat + 3 * 60 * 60 }), {
        keys,
      })
    ).toMatchObject({ ok: false, status: 401 });
  });

  it('refuses a token without nbf', async () => {
    const iat = Math.floor(Date.now() / 1000);
    const bare = await new SignJWT(GOOD_CLAIMS)
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(QA_CI_OIDC_ISSUER)
      .setAudience(QA_CI_OIDC_AUDIENCE)
      .setIssuedAt(iat)
      .setExpirationTime(iat + 300)
      .sign(signing.privateKey);
    expect(await verifyQaCiToken(bare, { keys })).toMatchObject({
      ok: false,
      status: 401,
      reason: 'claim_nbf',
    });
  });

  it('refuses an unsigned or symmetric token', async () => {
    const hs = await new SignJWT(GOOD_CLAIMS)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(QA_CI_OIDC_ISSUER)
      .setAudience(QA_CI_OIDC_AUDIENCE)
      .setIssuedAt()
      .setNotBefore('0s')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('x'.repeat(32)));
    expect(await verifyQaCiToken(hs, { keys })).toMatchObject({
      ok: false,
      status: 401,
    });
    const payload = (await token()).split('.')[1];
    const none = `${btoa(JSON.stringify({ alg: 'none' })).replace(/=+$/u, '')}.${payload}.`;
    expect(await verifyQaCiToken(none, { keys })).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it('refuses a missing or oversized token', async () => {
    expect(await verifyQaCiToken('', { keys })).toMatchObject({ status: 401 });
    expect(await verifyQaCiToken('a'.repeat(9000), { keys })).toMatchObject({
      status: 401,
    });
  });
});
