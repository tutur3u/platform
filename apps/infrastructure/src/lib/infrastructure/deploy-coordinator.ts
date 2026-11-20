import {
  DEPLOY_ENVIRONMENTS,
  type DeployAction,
  type DeployEnvironmentName,
  type DeployEnvironmentResult,
  type DeployLane,
  type DeployProject,
  type DeployProjectResponse,
  type DeployProjectsResponse,
  type DeployRecord,
  isDeployUrl,
} from '@tuturuuu/internal-api/infrastructure';

// Server-side client for the deployment coordinator Worker
// (apps/docs/build/devops/deployment-coordinator.mdx). It holds the operator
// token, names the signed-in user in X-Deploy-Actor and maps coordinator
// records to dashboard views without grant secrets or idempotency material.

export type CoordinatorConfig = { origin: string; token: string };

type Env = Record<string, string | undefined>;
type Fetch = typeof globalThis.fetch;

const TIMEOUT_MS = 10_000;
const PROJECT = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DEPLOYMENT_ID = /^[0-9a-f-]{36}$/;
const LANE = /^[A-Za-z0-9._/-]{1,200}$/;

export class CoordinatorRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code);
  }
}

// The coordinator stays unconfigured until both values are set. Plain http is
// accepted only for a loopback origin used in local runtime checks.
export function readCoordinatorConfig(
  env: Env = process.env
): CoordinatorConfig | null {
  const origin = env.DEPLOY_COORDINATOR_ORIGIN?.trim().replace(/\/+$/, '');
  const token = env.DEPLOY_COORDINATOR_OPERATOR_TOKEN?.trim();
  if (!origin || !token) return null;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
    return null;
  return { origin: url.origin, token };
}

export function isDeployEnvironment(
  value: string
): value is DeployEnvironmentName {
  return (DEPLOY_ENVIRONMENTS as readonly string[]).includes(value);
}

export function isProjectId(value: string) {
  return PROJECT.test(value);
}

// A shared reusable publisher is bound to the workflow that calls it.
type CoordinatorWorkflow = string | { reusable: string; caller: string };
type CoordinatorProject = Omit<DeployProject, 'workflows'> & {
  workflows: {
    production: CoordinatorWorkflow[];
    staging: CoordinatorWorkflow[];
    preview: CoordinatorWorkflow[];
  };
};

const workflowLabel = (rule: CoordinatorWorkflow) =>
  typeof rule === 'string' ? rule : `${rule.caller} → ${rule.reusable}`;

type CoordinatorDeployment = Omit<DeployRecord, 'epoch' | 'leaseDeadline'> & {
  attempt: { epoch: number; leaseDeadline: string } | null;
};

type CoordinatorSnapshot = {
  meta: {
    stopped: boolean;
    stopRevision: number;
    stopReason: string | null;
    stoppedBy: string | null;
  };
  lanes: Array<
    Omit<DeployLane, 'current' | 'deployments'> & {
      current: CoordinatorDeployment | null;
      deployments: CoordinatorDeployment[];
    }
  >;
};

export function toDeployRecord(value: CoordinatorDeployment): DeployRecord {
  return {
    id: value.id,
    project: value.project,
    environment: value.environment,
    lane: value.lane,
    kind: value.kind,
    status: value.status,
    sha: value.sha,
    ref: value.ref,
    sourceDeploymentId: value.sourceDeploymentId,
    url: value.url,
    logsUrl: value.logsUrl,
    actor: value.actor,
    runId: value.runId,
    supersededBy: value.supersededBy,
    reconciled: value.reconciled,
    failureReason: value.failureReason,
    closedBy: value.closedBy,
    epoch: value.attempt?.epoch ?? null,
    leaseDeadline:
      value.status === 'publishing'
        ? (value.attempt?.leaseDeadline ?? null)
        : null,
    plan: value.plan
      ? {
          source: value.plan.source,
          digest: value.plan.digest,
          url: value.plan.url,
        }
      : null,
    artifact: value.artifact
      ? {
          kind: value.artifact.kind,
          id: value.artifact.id,
          digest: value.artifact.digest,
        }
      : null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    finishedAt: value.finishedAt,
  };
}

function toEnvironmentResult(
  snapshot: CoordinatorSnapshot
): DeployEnvironmentResult {
  return {
    ok: true,
    state: {
      stopped: snapshot.meta.stopped,
      stopRevision: snapshot.meta.stopRevision,
      stopReason: snapshot.meta.stopReason,
      stoppedBy: snapshot.meta.stoppedBy,
      lanes: snapshot.lanes.map((lane) => ({
        lane: lane.lane,
        epoch: lane.epoch,
        lockDeploymentId: lane.lockDeploymentId,
        held: lane.held,
        holdReason: lane.holdReason,
        updatedAt: lane.updatedAt,
        current: lane.current ? toDeployRecord(lane.current) : null,
        deployments: lane.deployments.map(toDeployRecord),
      })),
    },
  };
}

export function createCoordinatorClient(
  config: CoordinatorConfig,
  actor: string,
  fetchImpl: Fetch = fetch
) {
  async function call<T>(
    path: string,
    init: { method?: 'GET' | 'POST'; body?: unknown } = {}
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${config.origin}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'X-Deploy-Actor': actor,
          ...(init.body === undefined
            ? {}
            : { 'Content-Type': 'application/json' }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new CoordinatorRequestError(502, 'COORDINATOR_UNREACHABLE');
    }
    const body = (await response.json().catch(() => null)) as
      | (T & { error?: string })
      | null;
    if (!response.ok)
      throw new CoordinatorRequestError(
        response.status,
        typeof body?.error === 'string' ? body.error : 'COORDINATOR_ERROR'
      );
    if (body === null)
      throw new CoordinatorRequestError(502, 'COORDINATOR_BAD_RESPONSE');
    return body as T;
  }

  const environmentPath = (project: string, environment: string) =>
    `/v1/projects/${project}/environments/${environment}`;

  async function projects(): Promise<DeployProject[]> {
    const body = await call<{ projects: CoordinatorProject[] }>('/v1/projects');
    return body.projects.map((project) => ({
      id: project.id,
      provider: project.provider,
      workflows: {
        production: project.workflows.production.map(workflowLabel),
        staging: project.workflows.staging.map(workflowLabel),
        preview: project.workflows.preview.map(workflowLabel),
      },
    }));
  }

  async function environment(
    project: string,
    name: DeployEnvironmentName
  ): Promise<DeployEnvironmentResult> {
    try {
      return toEnvironmentResult(
        await call<CoordinatorSnapshot>(environmentPath(project, name))
      );
    } catch (error) {
      if (error instanceof CoordinatorRequestError)
        return { ok: false, error: error.code };
      throw error;
    }
  }

  async function run(
    project: string,
    name: DeployEnvironmentName,
    action: DeployAction
  ) {
    const base = environmentPath(project, name);
    switch (action.action) {
      case 'promote':
      case 'rollback':
      case 'cancel':
        await call(
          `${base}/deployments/${action.deploymentId}/${action.action}`,
          {
            method: 'POST',
            body: {},
          }
        );
        return;
      case 'resolve':
        await call(`${base}/deployments/${action.deploymentId}/resolve`, {
          method: 'POST',
          body: { outcome: action.outcome, url: action.url },
        });
        return;
      case 'release-hold':
        await call(`${base}/hold/release`, {
          method: 'POST',
          body: { lane: action.lane },
        });
        return;
      case 'stop':
        await call(`${base}/stop`, {
          method: 'POST',
          body: { reason: action.reason },
        });
        return;
      case 'resume':
        await call(`${base}/resume`, { method: 'POST', body: {} });
        return;
    }
  }

  return { projects, environment, run };
}

export async function readDeployProjects(
  actor: string,
  config = readCoordinatorConfig(),
  fetchImpl?: Fetch
): Promise<DeployProjectsResponse> {
  if (!config) return { configured: false };
  const client = createCoordinatorClient(config, actor, fetchImpl);
  return { configured: true, projects: await client.projects() };
}

export async function readDeployProject(
  actor: string,
  projectId: string,
  config = readCoordinatorConfig(),
  fetchImpl?: Fetch
): Promise<DeployProjectResponse | null> {
  if (!config) return { configured: false };
  const client = createCoordinatorClient(config, actor, fetchImpl);
  const project = (await client.projects()).find(
    (entry) => entry.id === projectId
  );
  if (!project) return null;
  const [production, staging, preview] = await Promise.all([
    client.environment(project.id, 'production'),
    client.environment(project.id, 'staging'),
    client.environment(project.id, 'preview'),
  ]);
  return {
    configured: true,
    project,
    environments: { production, staging, preview },
  };
}

// Control characters are rejected, matching the coordinator's own bound.
const CONTROL = /[\u0000-\u001f\u007f]/;
const text = (value: unknown, max: number) =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= max &&
  !CONTROL.test(value)
    ? value.trim()
    : null;

// Validates an action body from the dashboard. Returns null when invalid.
export function parseDeployAction(
  environment: DeployEnvironmentName,
  value: unknown
): DeployAction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const deploymentId =
    typeof body.deploymentId === 'string' &&
    DEPLOYMENT_ID.test(body.deploymentId)
      ? body.deploymentId
      : null;
  switch (body.action) {
    case 'promote':
      return environment === 'staging' && deploymentId
        ? { action: 'promote', deploymentId }
        : null;
    case 'rollback':
      return environment !== 'preview' && deploymentId
        ? { action: 'rollback', deploymentId }
        : null;
    case 'cancel':
      return deploymentId ? { action: 'cancel', deploymentId } : null;
    case 'resolve': {
      if (!deploymentId) return null;
      if (body.outcome !== 'succeeded' && body.outcome !== 'failed')
        return null;
      let url: string | null = null;
      if (body.url != null && body.url !== '') {
        const raw = text(body.url, 2_048);
        if (!raw || !isDeployUrl(raw)) return null;
        url = raw;
      }
      return { action: 'resolve', deploymentId, outcome: body.outcome, url };
    }
    case 'release-hold': {
      const lane =
        environment === 'preview'
          ? typeof body.lane === 'string' &&
            LANE.test(body.lane) &&
            !body.lane.split('/').some((part) => part === '' || part === '..')
            ? body.lane
            : null
          : 'default';
      return lane ? { action: 'release-hold', lane } : null;
    }
    case 'stop': {
      const reason = text(body.reason, 200);
      return reason ? { action: 'stop', reason } : null;
    }
    case 'resume':
      return { action: 'resume' };
    default:
      return null;
  }
}
