import type { EnvironmentName } from './projects';

export type DeploymentKind = 'deploy' | 'promotion' | 'rollback';

export type DeploymentStatus =
  | 'queued'
  | 'publishing'
  | 'succeeded'
  | 'failed'
  | 'superseded'
  | 'cancelled'
  | 'unknown';

export const TERMINAL_STATUSES: readonly DeploymentStatus[] = [
  'succeeded',
  'failed',
  'superseded',
  'cancelled',
  'unknown',
];

export type PlanRef = {
  source: string;
  digest: string;
  url: string | null;
};

export type Artifact = {
  kind: string;
  id: string;
  digest: string | null;
};

// Same fields as the grant the offline queue adapter
// (scripts/ci/release-cf-queue.mjs) confirms before each phase.
export type Grant = {
  jobId: string;
  attemptId: string;
  workerId: string;
  epoch: number;
  targetLockId: string;
  stopRevision: number;
  leaseDeadline: string;
};

export type Attempt = Grant & {
  startedAt: number;
  leaseDeadlineMs: number;
};

export type Deployment = {
  id: string;
  project: string;
  environment: EnvironmentName;
  lane: string;
  seq: number;
  kind: DeploymentKind;
  status: DeploymentStatus;
  sha: string;
  ref: string;
  plan: PlanRef | null;
  sourceDeploymentId: string | null;
  artifact: Artifact | null;
  url: string | null;
  logsUrl: string | null;
  actor: string | null;
  // GitHub run that created the deployment; orders deploys and binds CI calls.
  runId: number | null;
  supersededBy: string | null;
  attempt: Attempt | null;
  reconciled: boolean;
  failureReason: string | null;
  // Operator who cancelled or resolved the deployment.
  closedBy: string | null;
  idempotencyKey: string;
  bodyDigest: string;
  createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
};

export type Lane = {
  lane: string;
  epoch: number;
  lockDeploymentId: string | null;
  held: boolean;
  holdReason: string | null;
  updatedAt: number;
};

export type EnvironmentMeta = {
  stopped: boolean;
  stopRevision: number;
  stopReason: string | null;
  stoppedBy: string | null;
  updatedAt: number;
};

export type CreateInput = {
  project: string;
  environment: EnvironmentName;
  lane: string;
  kind: DeploymentKind;
  sha: string;
  ref: string;
  plan: PlanRef | null;
  sourceDeploymentId: string | null;
  artifact: Artifact | null;
  logsUrl: string | null;
  actor: string | null;
  runId: number | null;
  idempotencyKey: string;
  bodyDigest: string;
};

export type CompleteInput = {
  grant: Pick<Grant, 'attemptId' | 'epoch'>;
  outcome: 'succeeded' | 'failed';
  url: string | null;
  artifact: Artifact | null;
  failureReason: string | null;
};

export type ClaimDecision =
  | { decision: 'granted'; grant: Grant; deployment: Deployment }
  | { decision: 'wait'; retryAfterSeconds: number; blockedBy: string }
  | { decision: 'held'; retryAfterSeconds: number; reason: string | null }
  | { decision: 'stopped'; retryAfterSeconds: number; stopRevision: number }
  | { decision: 'superseded'; supersededBy: string | null }
  | { decision: 'terminal'; status: DeploymentStatus };

export type CoordinatorErrorCode =
  | 'BUDGET_EXHAUSTED'
  | 'CAPACITY'
  | 'CONFLICT'
  | 'INVALID_STATE'
  | 'LEASE_EXPIRED'
  | 'NOT_FOUND'
  | 'RUN_MISMATCH'
  | 'STALE_GRANT';

export class CoordinatorError extends Error {
  constructor(
    readonly code: CoordinatorErrorCode,
    message: string = code
  ) {
    super(message);
  }
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; code: CoordinatorErrorCode; message: string };

export type EnvironmentSnapshot = {
  meta: EnvironmentMeta;
  lanes: Array<
    Lane & {
      current: Deployment | null;
      deployments: Deployment[];
    }
  >;
};
