import type { EnvironmentName } from './projects';
import { defaultMeta, type EnvironmentStore } from './store';
import {
  type ClaimDecision,
  type CompleteInput,
  CoordinatorError,
  type CreateInput,
  type Deployment,
  type EnvironmentMeta,
  type EnvironmentSnapshot,
  type Grant,
  type Lane,
} from './types';

export const LIMITS = {
  leaseMs: 5 * 60_000,
  graceMs: 2 * 60_000,
  maxAttemptMs: 90 * 60_000,
  queueTtlMs: 6 * 60 * 60_000,
  // GitHub-hosted jobs end within six hours, so an unknown attempt older than
  // this can no longer report a reconciling completion.
  reconcileMs: 6 * 60 * 60_000,
  openPreviewLanes: 50,
  maxLanes: 200,
  retainPerLane: 100,
  dailyBudget: 5_000,
  retryAfterSeconds: 20,
  snapshotPerLane: 20,
} as const;

export const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);

function fail(code: CoordinatorError['code'], message?: string): never {
  throw new CoordinatorError(code, message);
}

// The deployment state machine for one project environment. Every method is
// synchronous over the injected store; the Durable Object provides the
// single-threaded execution that makes each call atomic.
export class EnvironmentCore {
  constructor(
    private readonly store: EnvironmentStore,
    private readonly project: string,
    private readonly environment: EnvironmentName,
    private readonly newId: () => string
  ) {}

  // Counts the call against the durable daily budget before any other work.
  // An exhausted budget rejects without writing. Exempt calls (operator stop,
  // resume and reads) are neither counted nor rejected, so they write no rows.
  charge(now: number, exempt = false) {
    if (exempt) return;
    const used = this.store.countRequest(
      utcDay(now),
      LIMITS.dailyBudget,
      false
    );
    if (used === null) fail('BUDGET_EXHAUSTED');
  }

  // Applies lease lapses and queue expiry. Runs at the start of every call so
  // nothing needs to be scheduled.
  settle(now: number) {
    for (const deployment of this.store.publishing()) {
      const attempt = deployment.attempt;
      if (!attempt || now <= attempt.leaseDeadlineMs + LIMITS.graceMs) continue;
      deployment.status = 'unknown';
      deployment.failureReason = 'LEASE_LAPSED';
      this.#finish(deployment, now);
    }
    for (const deployment of this.store.queuedBefore(now - LIMITS.queueTtlMs)) {
      deployment.status = 'cancelled';
      deployment.failureReason = 'QUEUE_EXPIRED';
      this.#finish(deployment, now);
    }
  }

  meta(): EnvironmentMeta {
    return this.store.readMeta();
  }

  get(id: string): Deployment {
    return this.store.readDeployment(id) ?? fail('NOT_FOUND');
  }

  create(input: CreateInput, now: number) {
    const existing = this.store.findByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      if (existing.bodyDigest !== input.bodyDigest)
        fail('CONFLICT', 'Idempotency key reused with a different body');
      return { deployment: existing, created: false };
    }
    const lane = this.#lane(input.lane, now);
    const laneIsOpen =
      lane.lockDeploymentId !== null ||
      this.store.queued(input.lane).length > 0;
    if (
      !laneIsOpen &&
      this.environment === 'preview' &&
      this.store.openLaneCount() >= LIMITS.openPreviewLanes
    )
      fail('CAPACITY', 'Too many open preview lanes');
    if (!this.store.readLane(input.lane)) this.#makeRoomForLane(now);

    const deployment: Deployment = {
      id: this.newId(),
      project: this.project,
      environment: this.environment,
      lane: input.lane,
      seq: this.store.nextSeq(),
      kind: input.kind,
      status: 'queued',
      sha: input.sha,
      ref: input.ref,
      plan: input.plan,
      sourceDeploymentId: input.sourceDeploymentId,
      artifact: input.artifact,
      url: null,
      logsUrl: input.logsUrl,
      actor: input.actor,
      runId: input.runId,
      supersededBy: null,
      attempt: null,
      reconciled: false,
      failureReason: null,
      closedBy: null,
      idempotencyKey: input.idempotencyKey,
      bodyDigest: input.bodyDigest,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
    };

    if (input.kind === 'deploy') {
      const newest = this.store.maxDeployRunId(input.lane);
      if (input.runId !== null && newest !== null && input.runId < newest) {
        deployment.status = 'superseded';
        deployment.failureReason = 'NEWER_RUN_EXISTS';
        deployment.finishedAt = now;
      } else {
        this.#supersedeQueuedDeploys(input.lane, deployment, now);
      }
    } else if (input.kind === 'rollback') {
      this.#supersedeQueuedDeploys(input.lane, deployment, now);
      lane.held = true;
      lane.holdReason = `rollback:${deployment.id}`;
    }
    lane.updatedAt = now;
    this.store.writeLane(lane);
    this.store.writeDeployment(deployment);
    return { deployment, created: true };
  }

  claim(id: string, workerId: string, runId: number | null, now: number) {
    const deployment = this.#owned(id, runId);
    const lane = this.#lane(deployment.lane, now);
    const meta = this.store.readMeta();
    const wait = LIMITS.retryAfterSeconds;
    if (deployment.status === 'superseded')
      return {
        decision: 'superseded',
        supersededBy: deployment.supersededBy,
      } satisfies ClaimDecision;
    if (deployment.status === 'publishing') {
      if (deployment.attempt?.workerId === workerId)
        return this.#granted(deployment);
      return {
        decision: 'wait',
        retryAfterSeconds: wait,
        blockedBy: deployment.id,
      } satisfies ClaimDecision;
    }
    if (deployment.status !== 'queued')
      return {
        decision: 'terminal',
        status: deployment.status,
      } satisfies ClaimDecision;
    if (meta.stopped)
      return {
        decision: 'stopped',
        retryAfterSeconds: wait,
        stopRevision: meta.stopRevision,
      } satisfies ClaimDecision;
    if (lane.held && deployment.kind === 'deploy')
      return {
        decision: 'held',
        retryAfterSeconds: wait,
        reason: lane.holdReason,
      } satisfies ClaimDecision;
    if (lane.lockDeploymentId && lane.lockDeploymentId !== deployment.id)
      return {
        decision: 'wait',
        retryAfterSeconds: wait,
        blockedBy: lane.lockDeploymentId,
      } satisfies ClaimDecision;
    // Oldest claimable first. Promotion and rollback markers are resolved by
    // operators rather than claimed by CI, so a queued marker never holds a
    // deploy behind it; resolving a marker requires a free lane instead.
    const first = this.store
      .queued(deployment.lane)
      .find(
        (queued) =>
          !(lane.held && queued.kind === 'deploy') &&
          (deployment.kind !== 'deploy' || queued.kind === 'deploy')
      );
    if (first && first.id !== deployment.id)
      return {
        decision: 'wait',
        retryAfterSeconds: wait,
        blockedBy: first.id,
      } satisfies ClaimDecision;

    lane.epoch += 1;
    lane.lockDeploymentId = deployment.id;
    lane.updatedAt = now;
    const leaseDeadlineMs = now + LIMITS.leaseMs;
    deployment.status = 'publishing';
    deployment.attempt = {
      jobId: deployment.id,
      attemptId: this.newId(),
      workerId,
      epoch: lane.epoch,
      targetLockId: `${this.project}:${this.environment}:${deployment.lane}`,
      stopRevision: meta.stopRevision,
      leaseDeadline: new Date(leaseDeadlineMs).toISOString(),
      startedAt: now,
      leaseDeadlineMs,
    };
    deployment.updatedAt = now;
    this.store.writeLane(lane);
    this.store.writeDeployment(deployment);
    return this.#granted(deployment);
  }

  heartbeat(id: string, grant: GrantRef, runId: number | null, now: number) {
    const deployment = this.#owned(id, runId);
    if (deployment.status === 'unknown') fail('LEASE_EXPIRED');
    if (deployment.status !== 'publishing') fail('INVALID_STATE');
    const attempt = this.#matching(deployment, grant);
    if (
      now > attempt.leaseDeadlineMs ||
      now - attempt.startedAt >= LIMITS.maxAttemptMs
    )
      fail('LEASE_EXPIRED');
    attempt.leaseDeadlineMs = Math.min(
      now + LIMITS.leaseMs,
      attempt.startedAt + LIMITS.maxAttemptMs
    );
    attempt.leaseDeadline = new Date(attempt.leaseDeadlineMs).toISOString();
    deployment.updatedAt = now;
    this.store.writeDeployment(deployment);
    return this.#granted(deployment).grant;
  }

  complete(
    id: string,
    input: CompleteInput,
    runId: number | null,
    now: number
  ) {
    const deployment = this.#owned(id, runId);
    if (deployment.status === 'publishing') {
      this.#matching(deployment, input.grant);
      this.#applyOutcome(deployment, input);
      this.#finish(deployment, now);
      return deployment;
    }
    if (
      (deployment.status === 'succeeded' || deployment.status === 'failed') &&
      deployment.attempt?.attemptId === input.grant.attemptId
    ) {
      if (deployment.status !== input.outcome)
        fail('CONFLICT', 'A different outcome is already recorded');
      return deployment;
    }
    if (deployment.status === 'unknown') {
      this.#matching(deployment, input.grant);
      this.#applyOutcome(deployment, input);
      deployment.reconciled = true;
      deployment.updatedAt = now;
      this.store.writeDeployment(deployment);
      return deployment;
    }
    fail('STALE_GRANT');
  }

  // CI gives up its own queued deployment (held, or nothing to publish).
  skip(id: string, runId: number | null, reason: string, now: number) {
    const deployment = this.#owned(id, runId);
    if (deployment.status === 'cancelled' || deployment.status === 'superseded')
      return deployment;
    if (deployment.status !== 'queued') fail('INVALID_STATE');
    deployment.status = 'cancelled';
    deployment.failureReason = reason;
    this.#finish(deployment, now);
    return deployment;
  }

  cancel(id: string, actor: string, now: number) {
    const deployment = this.get(id);
    if (deployment.status === 'cancelled') return deployment;
    if (deployment.status !== 'queued') fail('INVALID_STATE');
    deployment.status = 'cancelled';
    deployment.failureReason = 'CANCELLED_BY_OPERATOR';
    deployment.closedBy = actor;
    this.#finish(deployment, now);
    return deployment;
  }

  // Records the outcome of a promotion or rollback marker that an operator
  // carried out with the owning release tooling.
  resolve(
    id: string,
    outcome: 'succeeded' | 'failed',
    actor: string,
    url: string | null,
    now: number
  ) {
    const deployment = this.get(id);
    if (deployment.kind === 'deploy') fail('INVALID_STATE', 'Not a marker');
    if (deployment.status === outcome && deployment.closedBy === actor)
      return deployment;
    if (deployment.status !== 'queued') fail('INVALID_STATE');
    const lane = this.#lane(deployment.lane, now);
    if (lane.lockDeploymentId) fail('INVALID_STATE', 'Lane is publishing');
    lane.epoch += 1;
    lane.updatedAt = now;
    this.store.writeLane(lane);
    deployment.attempt = {
      jobId: deployment.id,
      attemptId: this.newId(),
      workerId: 'operator',
      epoch: lane.epoch,
      targetLockId: `${this.project}:${this.environment}:${deployment.lane}`,
      stopRevision: this.store.readMeta().stopRevision,
      leaseDeadline: new Date(now).toISOString(),
      startedAt: now,
      leaseDeadlineMs: now,
    };
    deployment.closedBy = actor;
    this.#applyOutcome(deployment, {
      grant: deployment.attempt,
      outcome,
      url,
      artifact: null,
      failureReason: outcome === 'failed' ? 'RESOLVED_FAILED' : null,
    });
    this.#finish(deployment, now);
    return deployment;
  }

  rollback(targetId: string, actor: string, now: number) {
    if (this.environment === 'preview')
      fail('INVALID_STATE', 'Preview cannot roll back');
    const target = this.get(targetId);
    if (target.status !== 'succeeded') fail('INVALID_STATE');
    const current = this.store.current(target.lane);
    // A succeeded rollback serves its source, so compare what each serves.
    const serves = (d: Deployment) =>
      d.kind === 'rollback' ? (d.sourceDeploymentId ?? d.id) : d.id;
    if (current && serves(current) === serves(target))
      fail('INVALID_STATE', 'Already current');
    const key = this.#markerKey(
      `rollback:${target.id}:${current?.id ?? 'none'}`
    );
    return this.create(
      {
        project: this.project,
        environment: this.environment,
        lane: target.lane,
        kind: 'rollback',
        sha: target.sha,
        ref: target.ref,
        plan: null,
        // Always the deployment actually served, so a rollback to a rollback
        // still names the original and `serves` stays one level deep.
        sourceDeploymentId: serves(target),
        artifact: target.artifact,
        logsUrl: null,
        actor,
        runId: null,
        idempotencyKey: key,
        bodyDigest: key,
      },
      now
    );
  }

  // Queues a production promotion of a succeeded staging deployment.
  promotion(source: Deployment, actor: string, now: number) {
    if (this.environment !== 'production' || source.environment !== 'staging')
      fail('INVALID_STATE', 'Only staging promotes to production');
    if (source.status !== 'succeeded') fail('INVALID_STATE');
    const key = this.#markerKey(`promote:${source.project}:${source.id}`);
    return this.create(
      {
        project: this.project,
        environment: this.environment,
        lane: 'default',
        kind: 'promotion',
        sha: source.sha,
        ref: source.ref,
        plan: source.plan,
        sourceDeploymentId: source.id,
        artifact: null,
        logsUrl: null,
        actor,
        runId: null,
        idempotencyKey: key,
        bodyDigest: key,
      },
      now
    );
  }

  releaseHold(laneName: string, now: number) {
    const lane = this.#lane(laneName, now);
    lane.held = false;
    lane.holdReason = null;
    lane.updatedAt = now;
    this.store.writeLane(lane);
    return lane;
  }

  stop(actor: string, reason: string, now: number) {
    const meta = this.store.readMeta();
    if (meta.stopped) return meta;
    const next: EnvironmentMeta = {
      stopped: true,
      stopRevision: meta.stopRevision + 1,
      stopReason: reason,
      stoppedBy: actor,
      updatedAt: now,
    };
    this.store.writeMeta(next);
    return next;
  }

  resume(now: number) {
    const meta = this.store.readMeta();
    if (!meta.stopped) return meta;
    const next = { ...meta, stopped: false, stopReason: null, updatedAt: now };
    this.store.writeMeta(next);
    return next;
  }

  snapshot(): EnvironmentSnapshot {
    return {
      meta: this.store.readMeta(),
      lanes: this.store.listLanes().map((lane) => ({
        ...lane,
        current: this.store.current(lane.lane),
        deployments: this.store.recent(lane.lane, LIMITS.snapshotPerLane),
      })),
    };
  }

  #granted(deployment: Deployment) {
    const {
      startedAt: _started,
      leaseDeadlineMs: _ms,
      ...grant
    } = deployment.attempt ?? fail('INVALID_STATE');
    return {
      decision: 'granted',
      grant: grant satisfies Grant,
      deployment,
    } satisfies ClaimDecision;
  }

  // CI calls are bound to the run that created the deployment, not to its
  // attempt: a re-run attempt registers its own deployment (the idempotency
  // key carries run_attempt) yet may still skip or close one its earlier
  // attempt left open. Publishing rights stay fenced by the grant's attemptId
  // and epoch, which a different attempt never holds.
  #owned(id: string, runId: number | null) {
    const deployment = this.get(id);
    if (runId !== null && deployment.runId !== runId) fail('RUN_MISMATCH');
    return deployment;
  }

  #matching(deployment: Deployment, grant: GrantRef) {
    const attempt = deployment.attempt;
    if (
      !attempt ||
      attempt.attemptId !== grant.attemptId ||
      attempt.epoch !== grant.epoch
    )
      fail('STALE_GRANT');
    return attempt;
  }

  #applyOutcome(deployment: Deployment, input: CompleteInput) {
    deployment.status = input.outcome;
    deployment.url = input.url ?? deployment.url;
    deployment.artifact = input.artifact ?? deployment.artifact;
    deployment.failureReason =
      input.outcome === 'failed' ? (input.failureReason ?? 'FAILED') : null;
  }

  // Records a terminal transition, frees the lane and applies retention.
  #finish(deployment: Deployment, now: number) {
    deployment.updatedAt = now;
    deployment.finishedAt ??= now;
    const lane = this.#lane(deployment.lane, now);
    if (lane.lockDeploymentId === deployment.id) lane.lockDeploymentId = null;
    // A successful promotion resumes automatic deploys. An operator cancelling
    // the rollback that placed the hold abandons it, so the hold passes to
    // another queued rollback in the lane or is released; a failed or expired
    // rollback keeps the hold until an operator releases it.
    if (deployment.kind === 'promotion' && deployment.status === 'succeeded') {
      lane.held = false;
      lane.holdReason = null;
    } else if (
      deployment.kind === 'rollback' &&
      deployment.status === 'cancelled' &&
      deployment.closedBy !== null &&
      lane.holdReason === `rollback:${deployment.id}`
    ) {
      const pending = this.store
        .queued(deployment.lane)
        .find(
          (queued) => queued.kind === 'rollback' && queued.id !== deployment.id
        );
      lane.held = pending !== undefined;
      lane.holdReason = pending ? `rollback:${pending.id}` : null;
    }
    lane.updatedAt = now;
    this.store.writeLane(lane);
    this.store.writeDeployment(deployment);
    this.store.pruneTerminal(
      deployment.lane,
      LIMITS.retainPerLane,
      this.store.current(deployment.lane)?.id ?? null,
      now - LIMITS.reconcileMs
    );
  }

  #supersedeQueuedDeploys(lane: string, by: Deployment, now: number) {
    for (const queued of this.store.queued(lane)) {
      if (queued.kind !== 'deploy') continue;
      if (
        by.kind === 'deploy' &&
        by.runId !== null &&
        queued.runId !== null &&
        queued.runId > by.runId
      )
        continue;
      queued.status = 'superseded';
      queued.supersededBy = by.id;
      this.#finish(queued, now);
    }
  }

  // Idempotency key for an operator marker. Repeating the request returns the
  // open or succeeded marker; once the latest marker for the same request
  // finished without succeeding (failed, cancelled, unknown), the request
  // creates a new marker keyed after it, so a failed promotion or rollback can
  // be retried. The chain is bounded by lane retention.
  #markerKey(base: string) {
    let key = base;
    for (;;) {
      const existing = this.store.findByIdempotencyKey(key);
      if (
        !existing ||
        existing.status === 'queued' ||
        existing.status === 'publishing' ||
        existing.status === 'succeeded'
      )
        return key;
      key = `${base}:after:${existing.id}`;
    }
  }

  // Keeps the lane table bounded by dropping the least recently used idle lane.
  // A lane with an unknown attempt young enough to still report its outcome
  // is kept so that reconciliation has a row to land on.
  #makeRoomForLane(now: number) {
    const lanes = this.store.listLanes();
    if (lanes.length < LIMITS.maxLanes) return;
    for (const lane of lanes.reverse()) {
      if (lane.lockDeploymentId || lane.held) continue;
      if (this.store.queued(lane.lane).length > 0) continue;
      if (this.store.hasUnknownSince(lane.lane, now - LIMITS.reconcileMs))
        continue;
      this.store.deleteLane(lane.lane);
      return;
    }
    fail('CAPACITY', 'No idle lane can be released');
  }

  #lane(name: string, now: number): Lane {
    return (
      this.store.readLane(name) ?? {
        lane: name,
        epoch: 0,
        lockDeploymentId: null,
        held: false,
        holdReason: null,
        updatedAt: now,
      }
    );
  }
}

export type GrantRef = Pick<Grant, 'attemptId' | 'epoch'>;

export { defaultMeta };
