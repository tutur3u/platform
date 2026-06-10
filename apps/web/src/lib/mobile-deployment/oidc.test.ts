import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  MOBILE_DEPLOYMENT_GITHUB_ENVIRONMENT,
  MOBILE_DEPLOYMENT_REF,
  MOBILE_DEPLOYMENT_REPOSITORY,
  MOBILE_DEPLOYMENT_WORKFLOW_REF,
} from './constants';
import { MobileDeploymentOidcError, validateGitHubOidcClaims } from './oidc';

const validClaims = {
  actor: 'octocat',
  environment: MOBILE_DEPLOYMENT_GITHUB_ENVIRONMENT,
  event_name: 'push',
  ref: MOBILE_DEPLOYMENT_REF,
  repository: MOBILE_DEPLOYMENT_REPOSITORY,
  run_attempt: '1',
  run_id: '123',
  sha: 'abc123',
  workflow_ref: MOBILE_DEPLOYMENT_WORKFLOW_REF,
};

describe('mobile deployment OIDC claims', () => {
  it('accepts the production mobile deployment workflow claims', () => {
    expect(validateGitHubOidcClaims(validClaims).runId).toBe('123');
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
});
