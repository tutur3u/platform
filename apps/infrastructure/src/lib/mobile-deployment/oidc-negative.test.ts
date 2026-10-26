// @vitest-environment node
import type { JWTPayload } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { jwtVerifyMock, remoteJwkSetMock } = vi.hoisted(() => ({
  jwtVerifyMock: vi.fn(),
  remoteJwkSetMock: vi.fn(() => 'jwks-resolver'),
}));

vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>();
  return {
    ...actual,
    createRemoteJWKSet: remoteJwkSetMock,
    jwtVerify: jwtVerifyMock,
  };
});

import { errors } from 'jose';
import {
  MOBILE_DEPLOYMENT_GITHUB_ENVIRONMENT,
  MOBILE_DEPLOYMENT_OIDC_AUDIENCE,
  MOBILE_DEPLOYMENT_REF,
  MOBILE_DEPLOYMENT_REPOSITORY,
  MOBILE_DEPLOYMENT_WORKFLOW_REF,
} from './constants';
import {
  MobileDeploymentOidcError,
  validateGitHubOidcClaims,
  verifyGitHubOidcToken,
} from './oidc';

const validClaims: JWTPayload = {
  actor: 'synthetic-actor',
  environment: MOBILE_DEPLOYMENT_GITHUB_ENVIRONMENT,
  event_name: 'push',
  ref: MOBILE_DEPLOYMENT_REF,
  repository: MOBILE_DEPLOYMENT_REPOSITORY,
  run_attempt: '1',
  run_id: '1234567890',
  sha: '0123456789abcdef0123456789abcdef01234567',
  workflow_ref: MOBILE_DEPLOYMENT_WORKFLOW_REF,
};

function rejection(payload: JWTPayload) {
  try {
    validateGitHubOidcClaims(payload);
  } catch (error) {
    return error;
  }
  throw new Error('Expected claims to be rejected');
}

describe('mobile deployment OIDC strict negative claims', () => {
  it.each([
    ['repository', 'invalid_repository'],
    ['ref', 'invalid_ref'],
    ['environment', 'invalid_environment'],
    ['workflow_ref', 'invalid_workflow'],
  ])('rejects a missing %s claim with %s', (key, code) => {
    const { [key]: _removed, ...payload } = validClaims;
    const error = rejection(payload);

    expect(error).toBeInstanceOf(MobileDeploymentOidcError);
    expect((error as MobileDeploymentOidcError).code).toBe(code);
  });

  it.each([
    [
      'repository',
      `${MOBILE_DEPLOYMENT_REPOSITORY}-fork`,
      'invalid_repository',
    ],
    [
      'repository',
      MOBILE_DEPLOYMENT_REPOSITORY.toUpperCase(),
      'invalid_repository',
    ],
    ['repository', ` ${MOBILE_DEPLOYMENT_REPOSITORY}`, 'invalid_repository'],
    ['repository', `${MOBILE_DEPLOYMENT_REPOSITORY}/`, 'invalid_repository'],
    ['ref', 'refs/heads/production-hotfix', 'invalid_ref'],
    ['ref', 'refs/heads/Production', 'invalid_ref'],
    ['ref', 'refs/tags/production', 'invalid_ref'],
    ['ref', 'refs/pull/1/merge', 'invalid_ref'],
    ['environment', 'mobile-store-beta-2', 'invalid_environment'],
    ['environment', 'Mobile-Store-Beta', 'invalid_environment'],
    ['environment', '', 'invalid_environment'],
    [
      'workflow_ref',
      `${MOBILE_DEPLOYMENT_REPOSITORY}/.github/workflows/mobile-deploy-stores.yaml@refs/heads/main`,
      'invalid_workflow',
    ],
    [
      'workflow_ref',
      `${MOBILE_DEPLOYMENT_WORKFLOW_REF}.evil`,
      'invalid_workflow',
    ],
    [
      'workflow_ref',
      `attacker/platform/.github/workflows/mobile-deploy-stores.yaml@${MOBILE_DEPLOYMENT_REF}`,
      'invalid_workflow',
    ],
  ])('rejects near-miss %s value %j', (key, value, code) => {
    const error = rejection({ ...validClaims, [key]: value });

    expect(error).toBeInstanceOf(MobileDeploymentOidcError);
    expect((error as MobileDeploymentOidcError).code).toBe(code);
  });

  it.each([
    ['number', 42],
    ['boolean', true],
    ['array', [MOBILE_DEPLOYMENT_REPOSITORY]],
    ['object', { value: MOBILE_DEPLOYMENT_REPOSITORY }],
    ['null', null],
  ])('does not coerce a %s repository claim', (_label, value) => {
    const error = rejection({
      ...validClaims,
      repository: value as unknown as string,
    });

    expect((error as MobileDeploymentOidcError).code).toBe(
      'invalid_repository'
    );
  });

  it.each([
    ['run_id', undefined],
    ['run_id', ''],
    ['run_id', 1234567890],
    ['run_attempt', undefined],
    ['run_attempt', ''],
    ['run_attempt', 1],
  ])(
    'rejects run identity %s=%j that is not a non-empty string',
    (key, value) => {
      const error = rejection({ ...validClaims, [key]: value });

      expect((error as MobileDeploymentOidcError).code).toBe('invalid_run');
    }
  );

  it.each([
    'pull_request',
    'pull_request_target',
    'schedule',
    'repository_dispatch',
    'PUSH',
  ])(
    'rejects event_name %s even when every other claim matches',
    (eventName) => {
      const error = rejection({ ...validClaims, event_name: eventName });

      expect((error as MobileDeploymentOidcError).code).toBe('invalid_event');
    }
  );

  it('reports every claim failure with the same generic message', () => {
    const messages = [
      { ...validClaims, repository: 'attacker/platform' },
      { ...validClaims, ref: 'refs/heads/main' },
      { ...validClaims, environment: 'production' },
      { ...validClaims, workflow_ref: 'other' },
      { ...validClaims, event_name: 'schedule' },
      { ...validClaims, run_id: undefined },
    ].map((payload) => (rejection(payload) as Error).message);

    expect(new Set(messages)).toEqual(new Set(['Unauthorized']));
  });

  it('returns only the validated identity and never forwards unknown claims', () => {
    const claims = validateGitHubOidcClaims({
      ...validClaims,
      extra_claim: 'ignored',
      sub: 'repo:synthetic',
    });

    expect(Object.keys(claims).sort()).toEqual([
      'actor',
      'environment',
      'ref',
      'repository',
      'runAttempt',
      'runId',
      'sha',
      'workflowRef',
    ]);
    expect(claims.runId).toBe('1234567890');
  });
});

describe('mobile deployment OIDC token verification', () => {
  beforeEach(() => {
    jwtVerifyMock.mockReset();
  });

  it('rejects an empty token before any signature work happens', async () => {
    await expect(verifyGitHubOidcToken('')).rejects.toMatchObject({
      code: 'missing_oidc',
    });
    expect(jwtVerifyMock).not.toHaveBeenCalled();
  });

  it('pins the GitHub issuer and the dedicated audience for signature verification', async () => {
    jwtVerifyMock.mockResolvedValue({ payload: validClaims });

    const claims = await verifyGitHubOidcToken('synthetic.jwt.token');

    expect(claims.workflowRef).toBe(MOBILE_DEPLOYMENT_WORKFLOW_REF);
    expect(jwtVerifyMock).toHaveBeenCalledWith(
      'synthetic.jwt.token',
      expect.anything(),
      {
        audience: MOBILE_DEPLOYMENT_OIDC_AUDIENCE,
        issuer: 'https://token.actions.githubusercontent.com',
      }
    );
  });

  it('still rejects a validly signed token whose claims are not the production workflow', async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: { ...validClaims, ref: 'refs/heads/main' },
    });

    await expect(
      verifyGitHubOidcToken('synthetic.jwt.token')
    ).rejects.toMatchObject({
      code: 'invalid_ref',
      message: 'Unauthorized',
    });
  });

  it.each([
    ['JWKS timeout', new errors.JWKSTimeout(), 'jwks_timeout'],
    ['unknown key id', new errors.JWKSNoMatchingKey(), 'key_unavailable'],
    ['expired token', new errors.JWTExpired('expired', {}), 'token_expired'],
    [
      'bad signature',
      new errors.JWSSignatureVerificationFailed(),
      'invalid_signature',
    ],
    [
      'wrong audience',
      new errors.JWTClaimValidationFailed(
        'unexpected "aud" claim',
        {},
        'aud',
        'check_failed'
      ),
      'invalid_signature',
    ],
    ['unexpected failure', new Error('socket hang up'), 'invalid_signature'],
  ])(
    'maps %s to %s without leaking the cause',
    async (_label, failure, code) => {
      jwtVerifyMock.mockRejectedValue(failure);

      const error = await verifyGitHubOidcToken('synthetic.jwt.token').catch(
        (caught: unknown) => caught
      );

      expect(error).toBeInstanceOf(MobileDeploymentOidcError);
      expect((error as MobileDeploymentOidcError).code).toBe(code);
      expect((error as MobileDeploymentOidcError).message).toBe('Unauthorized');
    }
  );
});
