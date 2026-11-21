import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  MOBILE_DEPLOYMENT_GITHUB_ENVIRONMENT,
  MOBILE_DEPLOYMENT_JOB_WORKFLOW_REF,
  MOBILE_DEPLOYMENT_REF,
  MOBILE_DEPLOYMENT_REPOSITORY,
  MOBILE_DEPLOYMENT_REPOSITORY_ID,
  MOBILE_DEPLOYMENT_REPOSITORY_OWNER_ID,
  MOBILE_DEPLOYMENT_RUNNER_ENVIRONMENT,
  MOBILE_DEPLOYMENT_WORKFLOW_REF,
} from './constants';
import { MobileDeploymentOidcError, validateGitHubOidcClaims } from './oidc';

const validClaims = {
  actor: 'octocat',
  environment: MOBILE_DEPLOYMENT_GITHUB_ENVIRONMENT,
  event_name: 'push',
  job_workflow_ref: MOBILE_DEPLOYMENT_JOB_WORKFLOW_REF,
  ref: MOBILE_DEPLOYMENT_REF,
  repository: MOBILE_DEPLOYMENT_REPOSITORY,
  repository_id: MOBILE_DEPLOYMENT_REPOSITORY_ID,
  repository_owner_id: MOBILE_DEPLOYMENT_REPOSITORY_OWNER_ID,
  runner_environment: MOBILE_DEPLOYMENT_RUNNER_ENVIRONMENT,
  run_attempt: '1',
  run_id: '123',
  sha: 'abc123',
  workflow_ref: MOBILE_DEPLOYMENT_WORKFLOW_REF,
};

describe('mobile deployment OIDC claims', () => {
  it('accepts the production mobile deployment workflow claims', () => {
    expect(validateGitHubOidcClaims(validClaims).runId).toBe('123');
    expect(
      validateGitHubOidcClaims({
        ...validClaims,
        event_name: 'workflow_dispatch',
      }).runId
    ).toBe('123');
  });

  it('rejects other events even from the production workflow', () => {
    expect(() =>
      validateGitHubOidcClaims({ ...validClaims, event_name: 'schedule' })
    ).toThrow(MobileDeploymentOidcError);
  });

  it.each([
    ['repository', 'attacker/platform'],
    ['ref', 'refs/heads/main'],
    ['environment', 'production'],
    [
      'workflow_ref',
      'tutur3u/platform/.github/workflows/other.yaml@refs/heads/production',
    ],
  ])('rejects invalid %s', (key, value) => {
    expect(() =>
      validateGitHubOidcClaims({ ...validClaims, [key]: value })
    ).toThrow(MobileDeploymentOidcError);
  });

  it.each([
    ['repository_id', '1', 'invalid_repository'],
    ['repository_id', undefined, 'invalid_repository'],
    ['repository_id', 536896722, 'invalid_repository'],
    ['repository_owner_id', '2', 'invalid_repository'],
    ['repository_owner_id', undefined, 'invalid_repository'],
    ['repository_owner_id', 107694301, 'invalid_repository'],
    ['event_name', undefined, 'invalid_event'],
    ['event_name', '', 'invalid_event'],
    ['event_name', 'schedule', 'invalid_event'],
    ['runner_environment', 'self-hosted', 'invalid_runner'],
    ['runner_environment', undefined, 'invalid_runner'],
    [
      'job_workflow_ref',
      `${MOBILE_DEPLOYMENT_REPOSITORY}/.github/workflows/reusable.yaml@${MOBILE_DEPLOYMENT_REF}`,
      'invalid_workflow',
    ],
    ['job_workflow_ref', undefined, 'invalid_workflow'],
  ])('rejects %s=%j with %s', (key, value, code) => {
    try {
      validateGitHubOidcClaims({ ...validClaims, [key]: value });
    } catch (error) {
      expect(error).toBeInstanceOf(MobileDeploymentOidcError);
      expect((error as MobileDeploymentOidcError).code).toBe(code);
      return;
    }
    throw new Error('Expected claims to be rejected');
  });
});
