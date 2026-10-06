import { generateKeyPair, type JWTPayload, SignJWT } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  DESKTOP_DEPLOYMENT_AUDIENCE,
  DESKTOP_DEPLOYMENT_ENVIRONMENT,
  DESKTOP_DEPLOYMENT_ISSUER,
  DESKTOP_DEPLOYMENT_REF,
  DESKTOP_DEPLOYMENT_REPOSITORY,
  DESKTOP_DEPLOYMENT_SUBJECT,
  DESKTOP_DEPLOYMENT_WORKFLOW_REF,
  DesktopDeploymentContractError,
} from './contract';
import { verifyDesktopGitHubOidcToken } from './oidc';
import { validateDesktopOidcClaims } from './oidc-claims';

const claims = {
  iss: DESKTOP_DEPLOYMENT_ISSUER,
  aud: DESKTOP_DEPLOYMENT_AUDIENCE,
  sub: DESKTOP_DEPLOYMENT_SUBJECT,
  environment: DESKTOP_DEPLOYMENT_ENVIRONMENT,
  ref: DESKTOP_DEPLOYMENT_REF,
  repository: DESKTOP_DEPLOYMENT_REPOSITORY,
  workflow_ref: DESKTOP_DEPLOYMENT_WORKFLOW_REF,
  runner_environment: 'github-hosted',
  event_name: 'push',
  run_id: '123',
  run_attempt: '1',
  sha: 'a'.repeat(40),
  actor: 'fixture-actor',
};

describe('fixed desktop production trust', () => {
  it.each(['push', 'workflow_dispatch'])('accepts desktop %s', (event_name) => {
    expect(validateDesktopOidcClaims({ ...claims, event_name })).toMatchObject({
      runId: '123',
      sha: 'a'.repeat(40),
    });
  });
  it.each([
    ['aud', 'tuturuuu-mobile-deployment'],
    ['aud', [DESKTOP_DEPLOYMENT_AUDIENCE, 'other']],
    ['iss', 'https://attacker.invalid'],
    ['sub', 'repo:tutur3u/platform:pull_request'],
    ['repository', 'attacker/platform'],
    ['ref', 'refs/heads/main'],
    ['environment', 'desktop-diagnostics'],
    ['environment', 'mobile-store-beta'],
    [
      'workflow_ref',
      'tutur3u/platform/.github/workflows/mobile-deploy-stores.yaml@refs/heads/production',
    ],
    [
      'workflow_ref',
      'tutur3u/platform/.github/workflows/desktop-store-draft.yaml@refs/heads/production',
    ],
    ['event_name', 'pull_request'],
    ['event_name', 'pull_request_target'],
    ['event_name', undefined],
    ['runner_environment', 'self-hosted'],
    ['job_workflow_ref', DESKTOP_DEPLOYMENT_WORKFLOW_REF],
    ['sha', 'short'],
    ['sha', 'A'.repeat(40)],
    ['run_id', '0'],
    ['run_id', '-1'],
    ['run_attempt', '1\n'],
    ['run_attempt', 1],
    ['run_attempt', undefined],
  ])('rejects invalid %s=%s', (key, value) => {
    expect(() =>
      validateDesktopOidcClaims({ ...claims, [key]: value })
    ).toThrow(DesktopDeploymentContractError);
  });
});

describe('signed desktop OIDC boundary', () => {
  let keys: Awaited<ReturnType<typeof generateKeyPair>>;
  let otherKeys: Awaited<ReturnType<typeof generateKeyPair>>;
  beforeAll(async () => {
    [keys, otherKeys] = await Promise.all([
      generateKeyPair('RS256'),
      generateKeyPair('RS256'),
    ]);
  });
  const issue = (
    payload: JWTPayload = claims,
    expired = false,
    other = false
  ) =>
    new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt(expired ? Math.floor(Date.now() / 1000) - 900 : undefined)
      .setExpirationTime(expired ? '0s' : '5m')
      .sign((other ? otherKeys : keys).privateKey);
  const resolver = async () => keys.publicKey;

  it('verifies the actual signature before returning claims', async () => {
    expect(
      await verifyDesktopGitHubOidcToken(await issue(), resolver)
    ).toMatchObject({ runId: '123' });
  });
  it.each([
    ['aud', 'tuturuuu-mobile-deployment'],
    ['iss', 'https://attacker.invalid'],
    ['sub', 'repo:tutur3u/platform:environment:desktop-diagnostics'],
    ['event_name', 'pull_request'],
  ])('rejects a signed wrong %s', async (key, value) => {
    await expect(
      verifyDesktopGitHubOidcToken(
        await issue({ ...claims, [key]: value }),
        resolver
      )
    ).rejects.toBeInstanceOf(DesktopDeploymentContractError);
  });
  it('rejects another signing key without exposing token bytes', async () => {
    const token = await issue(claims, false, true);
    await expect(
      verifyDesktopGitHubOidcToken(token, resolver)
    ).rejects.toMatchObject({
      code: 'invalid_oidc',
      message: 'Desktop deployment contract rejected',
    });
  });
  it('rejects stale/expired tokens', async () => {
    await expect(
      verifyDesktopGitHubOidcToken(await issue(claims, true), resolver)
    ).rejects.toBeInstanceOf(DesktopDeploymentContractError);
  });
  it('requires an expiration even on a correctly signed token', async () => {
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .sign(keys.privateKey);
    await expect(
      verifyDesktopGitHubOidcToken(token, resolver)
    ).rejects.toMatchObject({ code: 'invalid_oidc' });
  });
  it('requires issued-at even on a correctly signed token', async () => {
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256' })
      .setExpirationTime('5m')
      .sign(keys.privateKey);
    await expect(
      verifyDesktopGitHubOidcToken(token, resolver)
    ).rejects.toMatchObject({ code: 'invalid_oidc' });
  });
  it('rejects old tokens even before expiration', async () => {
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 900)
      .setExpirationTime('5m')
      .sign(keys.privateKey);
    await expect(
      verifyDesktopGitHubOidcToken(token, resolver)
    ).rejects.toMatchObject({ code: 'invalid_oidc' });
  });
  it('rejects future issued-at tokens', async () => {
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) + 60)
      .setExpirationTime('5m')
      .sign(keys.privateKey);
    await expect(
      verifyDesktopGitHubOidcToken(token, resolver)
    ).rejects.toMatchObject({ code: 'invalid_oidc' });
  });
  it('rejects empty and malformed tokens', async () => {
    for (const token of ['', 'not-a-token'])
      await expect(
        verifyDesktopGitHubOidcToken(token, resolver)
      ).rejects.toBeInstanceOf(DesktopDeploymentContractError);
  });
});
