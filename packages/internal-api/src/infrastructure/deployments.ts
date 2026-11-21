import { getInternalApiClient, type InternalApiClientOptions } from '../client';

// Dashboard view of the deployment coordinator
// (apps/docs/build/devops/deployment-coordinator.mdx). The Infrastructure
// server routes call the coordinator with the operator token and return these
// shapes; grant secrets and idempotency material never reach the browser.

export const DEPLOY_ENVIRONMENTS = [
  'production',
  'staging',
  'preview',
] as const;
export type DeployEnvironmentName = (typeof DEPLOY_ENVIRONMENTS)[number];

export type DeployProvider = 'cloudflare' | 'store' | 'vercel';
export type DeployKind = 'deploy' | 'promotion' | 'rollback';
export type DeployStatus =
  | 'queued'
  | 'publishing'
  | 'succeeded'
  | 'failed'
  | 'superseded'
  | 'cancelled'
  | 'unknown';

export interface DeployProject {
  id: string;
  provider: DeployProvider;
  workflows: Record<DeployEnvironmentName, string[]>;
}

export interface DeployRecord {
  id: string;
  project: string;
  environment: DeployEnvironmentName;
  lane: string;
  kind: DeployKind;
  status: DeployStatus;
  sha: string;
  ref: string;
  sourceDeploymentId: string | null;
  url: string | null;
  logsUrl: string | null;
  actor: string | null;
  runId: number | null;
  supersededBy: string | null;
  reconciled: boolean;
  failureReason: string | null;
  closedBy: string | null;
  epoch: number | null;
  leaseDeadline: string | null;
  plan: { source: string; digest: string; url: string | null } | null;
  artifact: { kind: string; id: string; digest: string | null } | null;
  createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
}

export interface DeployLane {
  lane: string;
  epoch: number;
  lockDeploymentId: string | null;
  held: boolean;
  holdReason: string | null;
  updatedAt: number;
  current: DeployRecord | null;
  deployments: DeployRecord[];
}

export interface DeployEnvironmentState {
  stopped: boolean;
  stopRevision: number;
  stopReason: string | null;
  stoppedBy: string | null;
  lanes: DeployLane[];
}

export type DeployEnvironmentResult =
  | { ok: true; state: DeployEnvironmentState }
  | { ok: false; error: string };

export type DeployProjectsResponse =
  | { configured: false }
  | { configured: true; projects: DeployProject[] };

export type DeployProjectResponse =
  | { configured: false }
  | {
      configured: true;
      project: DeployProject;
      environments: Record<DeployEnvironmentName, DeployEnvironmentResult>;
    };

export type DeployAction =
  | { action: 'promote'; deploymentId: string }
  | { action: 'rollback'; deploymentId: string }
  | { action: 'cancel'; deploymentId: string }
  | {
      action: 'resolve';
      deploymentId: string;
      outcome: 'succeeded' | 'failed';
      url: string | null;
    }
  | { action: 'release-hold'; lane: string }
  | { action: 'stop'; reason: string }
  | { action: 'resume' };

// A deployment URL the coordinator accepts: https with no credentials.
export function isDeployUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

const base = '/api/v1/infrastructure/deployments';

export function getDeployProjects(options?: InternalApiClientOptions) {
  return getInternalApiClient(options).json<DeployProjectsResponse>(base, {
    cache: 'no-store',
  });
}

export function getDeployProject(
  project: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<DeployProjectResponse>(
    `${base}/${encodeURIComponent(project)}`,
    { cache: 'no-store' }
  );
}

export function runDeployAction(
  project: string,
  environment: DeployEnvironmentName,
  action: DeployAction,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ ok: true }>(
    `${base}/${encodeURIComponent(project)}/${environment}`,
    {
      method: 'POST',
      body: JSON.stringify(action),
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    }
  );
}
