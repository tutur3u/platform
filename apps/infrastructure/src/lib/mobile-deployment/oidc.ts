import 'server-only';

import { createRemoteJWKSet, type JWTPayload, jwtVerify } from 'jose';
import {
  MOBILE_DEPLOYMENT_GITHUB_ENVIRONMENT,
  MOBILE_DEPLOYMENT_OIDC_AUDIENCE,
  MOBILE_DEPLOYMENT_REF,
  MOBILE_DEPLOYMENT_REPOSITORY,
  MOBILE_DEPLOYMENT_WORKFLOW_REF,
} from './constants';

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const GITHUB_OIDC_JWKS = createRemoteJWKSet(
  new URL(`${GITHUB_OIDC_ISSUER}/.well-known/jwks`)
);

export class MobileDeploymentOidcError extends Error {
  constructor(
    message: string,
    public readonly code = 'invalid_oidc'
  ) {
    super(message);
    this.name = 'MobileDeploymentOidcError';
  }
}

export interface MobileDeploymentGitHubOidcClaims {
  actor: string | null;
  environment: string;
  ref: string;
  repository: string;
  runAttempt: string;
  runId: string;
  sha: string | null;
  workflowRef: string;
}

function claimString(payload: JWTPayload, key: string) {
  const value = payload[key];
  return typeof value === 'string' ? value : null;
}

function assertClaim(
  payload: JWTPayload,
  key: string,
  expected: string,
  code: string
) {
  const value = claimString(payload, key);
  if (value !== expected) {
    throw new MobileDeploymentOidcError('Unauthorized', code);
  }

  return value;
}

export function validateGitHubOidcClaims(
  payload: JWTPayload
): MobileDeploymentGitHubOidcClaims {
  const repository = assertClaim(
    payload,
    'repository',
    MOBILE_DEPLOYMENT_REPOSITORY,
    'invalid_repository'
  );
  const ref = assertClaim(payload, 'ref', MOBILE_DEPLOYMENT_REF, 'invalid_ref');
  const environment = assertClaim(
    payload,
    'environment',
    MOBILE_DEPLOYMENT_GITHUB_ENVIRONMENT,
    'invalid_environment'
  );
  const workflowRef = assertClaim(
    payload,
    'workflow_ref',
    MOBILE_DEPLOYMENT_WORKFLOW_REF,
    'invalid_workflow'
  );

  const eventName = claimString(payload, 'event_name');
  if (eventName && eventName !== 'push') {
    throw new MobileDeploymentOidcError('Unauthorized', 'invalid_event');
  }

  const runId = claimString(payload, 'run_id');
  const runAttempt = claimString(payload, 'run_attempt');
  if (!runId || !runAttempt) {
    throw new MobileDeploymentOidcError('Unauthorized', 'invalid_run');
  }

  return {
    actor: claimString(payload, 'actor'),
    environment,
    ref,
    repository,
    runAttempt,
    runId,
    sha: claimString(payload, 'sha'),
    workflowRef,
  };
}

export async function verifyGitHubOidcToken(token: string) {
  if (!token) {
    throw new MobileDeploymentOidcError('Unauthorized', 'missing_oidc');
  }

  let payload: JWTPayload;
  try {
    const verified = await jwtVerify(token, GITHUB_OIDC_JWKS, {
      audience: MOBILE_DEPLOYMENT_OIDC_AUDIENCE,
      issuer: GITHUB_OIDC_ISSUER,
    });
    payload = verified.payload;
  } catch {
    throw new MobileDeploymentOidcError('Unauthorized', 'invalid_signature');
  }

  return validateGitHubOidcClaims(payload);
}
