import type { JWTPayload } from 'jose';
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

export interface DesktopDeploymentClaims {
  actor: string | null;
  runId: string;
  runAttempt: string;
  sha: string;
  workflowRef: typeof DESKTOP_DEPLOYMENT_WORKFLOW_REF;
}

/** Only call after JWT signature/expiry verification; fields cannot weaken the fixed policy. */
export function validateDesktopOidcClaims(
  payload: JWTPayload
): DesktopDeploymentClaims {
  const expected = {
    iss: DESKTOP_DEPLOYMENT_ISSUER,
    aud: DESKTOP_DEPLOYMENT_AUDIENCE,
    sub: DESKTOP_DEPLOYMENT_SUBJECT,
    repository: DESKTOP_DEPLOYMENT_REPOSITORY,
    ref: DESKTOP_DEPLOYMENT_REF,
    environment: DESKTOP_DEPLOYMENT_ENVIRONMENT,
    workflow_ref: DESKTOP_DEPLOYMENT_WORKFLOW_REF,
    runner_environment: 'github-hosted',
  };
  for (const [name, value] of Object.entries(expected)) {
    if (payload[name] !== value)
      throw new DesktopDeploymentContractError(`invalid_${name}`);
  }
  // This workflow currently runs directly; a new reusable signing workflow needs explicit policy.
  if (payload.job_workflow_ref !== undefined) {
    throw new DesktopDeploymentContractError('unexpected_reusable_workflow');
  }
  if (
    payload.event_name !== 'push' &&
    payload.event_name !== 'workflow_dispatch'
  ) {
    throw new DesktopDeploymentContractError('invalid_event');
  }
  if (
    typeof payload.run_id !== 'string' ||
    !/^[1-9]\d{0,19}$/u.test(payload.run_id) ||
    typeof payload.run_attempt !== 'string' ||
    !/^[1-9]\d{0,9}$/u.test(payload.run_attempt)
  )
    throw new DesktopDeploymentContractError('invalid_run');
  if (typeof payload.sha !== 'string' || !/^[a-f0-9]{40}$/u.test(payload.sha)) {
    throw new DesktopDeploymentContractError('invalid_sha');
  }
  return {
    actor: typeof payload.actor === 'string' ? payload.actor : null,
    runId: payload.run_id,
    runAttempt: payload.run_attempt,
    sha: payload.sha,
    workflowRef: DESKTOP_DEPLOYMENT_WORKFLOW_REF,
  };
}
