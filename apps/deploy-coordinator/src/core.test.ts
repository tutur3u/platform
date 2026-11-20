import { describe, expect, it } from 'vitest';
import { LIMITS } from './core';
import { harness, STORES } from './test-support';

const T0 = Date.UTC(2026, 10, 20, 12);
const MIN = 60_000;

describe.each(STORES)('environment state machine (%s store)', (_, store) => {
  it('grants one publisher per lane and frees it on completion', () => {
    const h = harness(store);
    const first = h.deploy(100, T0);
    const granted = h.claim(first.id, T0);
    expect(granted.decision).toBe('granted');
    expect(granted.grant).toMatchObject({
      jobId: first.id,
      epoch: 1,
      targetLockId: 'calendar:production:default',
      stopRevision: 0,
    });
    expect(granted.grant).not.toHaveProperty('startedAt');

    const second = h.deploy(101, T0 + 1);
    expect(h.claim(second.id, T0 + 2)).toMatchObject({
      decision: 'wait',
      blockedBy: first.id,
    });

    expect(h.complete(first.id, granted.grant, T0 + 3).status).toBe(
      'succeeded'
    );
    const next = h.claim(second.id, T0 + 4);
    expect(next.decision).toBe('granted');
    expect(next.grant.epoch).toBe(2);
    expect(next.grant.attemptId).not.toBe(granted.grant.attemptId);
  });

  it('supersedes queued deploys by run order and never a publishing one', () => {
    const h = harness(store);
    const publishing = h.deploy(100, T0);
    h.claim(publishing.id, T0);
    const queued = h.deploy(101, T0 + 1);
    const newer = h.deploy(102, T0 + 2);
    expect(h.call({ op: 'get', id: queued.id }, T0 + 3)).toMatchObject({
      status: 'superseded',
      supersededBy: newer.id,
    });
    expect(h.call({ op: 'get', id: publishing.id }, T0 + 3).status).toBe(
      'publishing'
    );
    expect(h.claim(queued.id, T0 + 3)).toEqual({
      decision: 'superseded',
      supersededBy: newer.id,
    });

    // A re-run of an older run registers late and must not overtake.
    const late = h.deploy(101, T0 + 4, { idempotencyKey: 'ci:101:2:default' });
    expect(late).toMatchObject({
      status: 'superseded',
      failureReason: 'NEWER_RUN_EXISTS',
    });
    expect(h.call({ op: 'get', id: newer.id }, T0 + 5).status).toBe('queued');

    // A re-run attempt of the newest run replaces its earlier attempt.
    const rerun = h.deploy(102, T0 + 6, { idempotencyKey: 'ci:102:2:default' });
    expect(rerun.status).toBe('queued');
    expect(h.call({ op: 'get', id: newer.id }, T0 + 7).status).toBe(
      'superseded'
    );
  });

  it('is idempotent for create, claim and completion', () => {
    const h = harness(store);
    const first = h.deploy(100, T0);
    expect(h.deploy(100, T0 + 1).id).toBe(first.id);
    expect(() => h.deploy(100, T0 + 1, { bodyDigest: 'different' })).toThrow(
      'CONFLICT'
    );

    const granted = h.claim(first.id, T0, 'worker-a');
    expect(h.claim(first.id, T0 + 1, 'worker-a').grant).toEqual(granted.grant);
    expect(h.claim(first.id, T0 + 1, 'worker-b').decision).toBe('wait');

    h.complete(first.id, granted.grant, T0 + 2);
    expect(h.complete(first.id, granted.grant, T0 + 3).status).toBe(
      'succeeded'
    );
    expect(() => h.complete(first.id, granted.grant, T0 + 3, 'failed')).toThrow(
      'CONFLICT'
    );
  });

  it('fences heartbeats and completions by epoch and lease', () => {
    const h = harness(store);
    const first = h.deploy(100, T0);
    const { grant } = h.claim(first.id, T0);
    expect(() =>
      h.call(
        {
          op: 'heartbeat',
          id: first.id,
          grant: { ...grant, epoch: 2 },
          runId: null,
        },
        T0 + 1
      )
    ).toThrow('STALE_GRANT');
    const renewed = h.call(
      { op: 'heartbeat', id: first.id, grant, runId: null },
      T0 + 4 * MIN
    );
    expect(Date.parse(renewed.leaseDeadline)).toBe(T0 + 9 * MIN);

    // Heartbeats keep a lease alive only up to the attempt ceiling.
    let now = T0 + 4 * MIN;
    while (now + 4 * MIN < T0 + LIMITS.maxAttemptMs) {
      now += 4 * MIN;
      h.call({ op: 'heartbeat', id: first.id, grant, runId: null }, now);
    }
    expect(() =>
      h.call(
        { op: 'heartbeat', id: first.id, grant, runId: null },
        T0 + LIMITS.maxAttemptMs
      )
    ).toThrow('LEASE_EXPIRED');
  });

  it('marks a lapsed attempt unknown, frees the lane and reconciles late', () => {
    const h = harness(store);
    const first = h.deploy(100, T0);
    const old = h.claim(first.id, T0).grant;
    const second = h.deploy(101, T0 + 1);

    // During the grace the lock holds and completion is still accepted later.
    expect(h.claim(second.id, T0 + 6 * MIN).decision).toBe('wait');
    const lapse = T0 + LIMITS.leaseMs + LIMITS.graceMs + 1;
    const next = h.claim(second.id, lapse);
    expect(next.decision).toBe('granted');
    expect(h.call({ op: 'get', id: first.id }, lapse)).toMatchObject({
      status: 'unknown',
      failureReason: 'LEASE_LAPSED',
    });
    h.complete(second.id, next.grant, lapse + 1);

    // The lapsed attempt reports late: recorded, but never current.
    const late = h.complete(first.id, old, lapse + 2);
    expect(late).toMatchObject({ status: 'succeeded', reconciled: true });
    const snapshot = h.call({ op: 'snapshot' }, lapse + 3);
    expect(snapshot.lanes[0].current.id).toBe(second.id);
    expect(snapshot.lanes[0].lockDeploymentId).toBeNull();
  });

  it('binds CI calls to the creating run', () => {
    const h = harness(store);
    const first = h.deploy(100, T0);
    expect(() => h.claim(first.id, T0, 'worker', 999)).toThrow('RUN_MISMATCH');
    expect(h.claim(first.id, T0, 'worker', 100).decision).toBe('granted');
  });

  it('stops claims durably while letting a publish finish', () => {
    const h = harness(store);
    const first = h.deploy(100, T0);
    const { grant } = h.claim(first.id, T0);
    const second = h.deploy(101, T0 + 1);
    const meta = h.call(
      { op: 'stop', actor: 'op', reason: 'incident' },
      T0 + 2
    );
    expect(meta).toMatchObject({ stopped: true, stopRevision: 1 });
    expect(h.complete(first.id, grant, T0 + 3).status).toBe('succeeded');
    expect(h.claim(second.id, T0 + 4)).toMatchObject({
      decision: 'stopped',
      stopRevision: 1,
    });
    h.call({ op: 'resume' }, T0 + 5);
    const granted = h.claim(second.id, T0 + 6);
    expect(granted.grant.stopRevision).toBe(1);
  });

  it('holds a lane after rollback until released or promoted', () => {
    const h = harness(store);
    const good = h.deploy(100, T0);
    h.complete(good.id, h.claim(good.id, T0).grant, T0 + 1);
    const bad = h.deploy(101, T0 + 2);
    h.complete(bad.id, h.claim(bad.id, T0 + 2).grant, T0 + 3);
    expect(() =>
      h.call({ op: 'rollback', id: bad.id, actor: 'op' }, T0 + 4)
    ).toThrow('INVALID_STATE');

    const queued = h.deploy(102, T0 + 4);
    const { deployment: rollback } = h.call(
      { op: 'rollback', id: good.id, actor: 'op' },
      T0 + 5
    );
    expect(rollback).toMatchObject({
      kind: 'rollback',
      sha: good.sha,
      sourceDeploymentId: good.id,
    });
    expect(
      h.call({ op: 'rollback', id: good.id, actor: 'op' }, T0 + 6).deployment.id
    ).toBe(rollback.id);
    expect(h.call({ op: 'get', id: queued.id }, T0 + 6).status).toBe(
      'superseded'
    );

    const during = h.deploy(103, T0 + 7);
    expect(h.claim(during.id, T0 + 8).decision).toBe('held');
    expect(
      h.call(
        { op: 'skip', id: during.id, runId: 103, reason: 'SKIPPED_HELD' },
        T0 + 9
      ).status
    ).toBe('cancelled');

    const resolved = h.call(
      {
        op: 'resolve',
        id: rollback.id,
        outcome: 'succeeded',
        actor: 'op',
        url: null,
      },
      T0 + 10
    );
    expect(resolved).toMatchObject({ status: 'succeeded', closedBy: 'op' });
    expect(h.call({ op: 'snapshot' }, T0 + 11).lanes[0]).toMatchObject({
      held: true,
      current: { id: rollback.id },
    });
    h.call({ op: 'releaseHold', lane: 'default' }, T0 + 12);
    const after = h.deploy(104, T0 + 13);
    expect(h.claim(after.id, T0 + 14).decision).toBe('granted');
  });

  it('promotes succeeded staging commits into production only', () => {
    const staging = harness(store, 'staging');
    const source = staging.deploy(100, T0, { ref: 'refs/heads/main' });
    staging.complete(source.id, staging.claim(source.id, T0).grant, T0 + 1);
    const settled = staging.call({ op: 'get', id: source.id }, T0 + 2);
    expect(() =>
      staging.call({ op: 'promotion', source: settled, actor: 'op' }, T0 + 2)
    ).toThrow('INVALID_STATE');

    const production = harness(store);
    const { deployment } = production.call(
      { op: 'promotion', source: settled, actor: 'op' },
      T0 + 3
    );
    expect(deployment).toMatchObject({
      kind: 'promotion',
      sha: source.sha,
      artifact: null,
    });
    const granted = production.claim(deployment.id, T0 + 4);
    expect(
      production.complete(deployment.id, granted.grant, T0 + 5).status
    ).toBe('succeeded');
  });

  it('creates a new marker when the previous one finished unsuccessfully', () => {
    const staging = harness(store, 'staging');
    const source = staging.deploy(100, T0, { ref: 'refs/heads/main' });
    staging.complete(source.id, staging.claim(source.id, T0).grant, T0 + 1);
    const settled = staging.call({ op: 'get', id: source.id }, T0 + 2);
    const production = harness(store);
    const promote = (now: number) =>
      production.call({ op: 'promotion', source: settled, actor: 'op' }, now)
        .deployment;
    const resolve = (id: string, outcome: string, now: number) =>
      production.call(
        { op: 'resolve', id, outcome, actor: 'op', url: null } as never,
        now
      );

    const first = promote(T0 + 3);
    expect(promote(T0 + 4).id).toBe(first.id);
    resolve(first.id, 'failed', T0 + 5);
    const retry = promote(T0 + 6);
    expect(retry.id).not.toBe(first.id);
    expect(retry.status).toBe('queued');
    expect(promote(T0 + 7).id).toBe(retry.id);
    production.call({ op: 'cancel', id: retry.id, actor: 'op' }, T0 + 8);
    const third = promote(T0 + 9);
    expect(new Set([first.id, retry.id, third.id]).size).toBe(3);
    resolve(third.id, 'succeeded', T0 + 10);
    expect(promote(T0 + 11).id).toBe(third.id);

    const good = production.deploy(200, T0 + 12);
    production.complete(
      good.id,
      production.claim(good.id, T0 + 12).grant,
      T0 + 13
    );
    const bad = production.deploy(201, T0 + 14);
    production.complete(
      bad.id,
      production.claim(bad.id, T0 + 14).grant,
      T0 + 15
    );
    const rollback = () =>
      production.call({ op: 'rollback', id: good.id, actor: 'op' }, T0 + 16)
        .deployment;
    const marker = rollback();
    resolve(marker.id, 'failed', T0 + 17);
    const again = rollback();
    expect(again.id).not.toBe(marker.id);
    expect(again.status).toBe('queued');
    // Once the rollback succeeds it serves the target, so repeating it is
    // refused instead of queueing another marker.
    resolve(again.id, 'succeeded', T0 + 18);
    expect(() =>
      production.call({ op: 'rollback', id: good.id, actor: 'op' }, T0 + 19)
    ).toThrow('Already current');
    // A rollback to the succeeded rollback itself serves the same target.
    expect(() =>
      production.call({ op: 'rollback', id: again.id, actor: 'op' }, T0 + 20)
    ).toThrow('Already current');
  });

  it('releases a rollback hold when an operator cancels the rollback', () => {
    const h = harness(store);
    const good = h.deploy(100, T0);
    h.complete(good.id, h.claim(good.id, T0).grant, T0 + 1);
    const bad = h.deploy(101, T0 + 2);
    h.complete(bad.id, h.claim(bad.id, T0 + 2).grant, T0 + 3);
    const { deployment: marker } = h.call(
      { op: 'rollback', id: good.id, actor: 'op' },
      T0 + 4
    );
    expect(h.call({ op: 'snapshot' }, T0 + 5).lanes[0].held).toBe(true);
    h.call({ op: 'cancel', id: marker.id, actor: 'op' }, T0 + 6);
    expect(h.call({ op: 'snapshot' }, T0 + 7).lanes[0]).toMatchObject({
      held: false,
      holdReason: null,
    });

    // A failed rollback keeps its hold until an operator releases it.
    const { deployment: retry } = h.call(
      { op: 'rollback', id: good.id, actor: 'op' },
      T0 + 8
    );
    h.call(
      {
        op: 'resolve',
        id: retry.id,
        outcome: 'failed',
        actor: 'op',
        url: null,
      },
      T0 + 9
    );
    expect(h.call({ op: 'snapshot' }, T0 + 10).lanes[0].held).toBe(true);
  });

  it('passes the hold to another queued rollback when one is cancelled', () => {
    const h = harness(store);
    const first = h.deploy(100, T0);
    h.complete(first.id, h.claim(first.id, T0).grant, T0 + 1);
    const second = h.deploy(101, T0 + 2);
    h.complete(second.id, h.claim(second.id, T0 + 2).grant, T0 + 3);
    const third = h.deploy(102, T0 + 4);
    h.complete(third.id, h.claim(third.id, T0 + 4).grant, T0 + 5);
    const { deployment: older } = h.call(
      { op: 'rollback', id: first.id, actor: 'op' },
      T0 + 6
    );
    const { deployment: newer } = h.call(
      { op: 'rollback', id: second.id, actor: 'op' },
      T0 + 7
    );
    h.call({ op: 'cancel', id: newer.id, actor: 'op' }, T0 + 8);
    expect(h.call({ op: 'snapshot' }, T0 + 9).lanes[0]).toMatchObject({
      held: true,
      holdReason: `rollback:${older.id}`,
    });
    h.call({ op: 'cancel', id: older.id, actor: 'op' }, T0 + 10);
    expect(h.call({ op: 'snapshot' }, T0 + 11).lanes[0].held).toBe(false);
  });

  it('records the served deployment when rolling back to a rollback', () => {
    const h = harness(store);
    const publish = (runId: number, now: number) => {
      const deployment = h.deploy(runId, now);
      h.complete(deployment.id, h.claim(deployment.id, now).grant, now);
      return deployment;
    };
    const resolve = (id: string, now: number) =>
      h.call(
        { op: 'resolve', id, outcome: 'succeeded', actor: 'op', url: null },
        now
      );
    const good = publish(100, T0);
    publish(101, T0 + 1);
    const first = h.call(
      { op: 'rollback', id: good.id, actor: 'op' },
      T0 + 2
    ).deployment;
    resolve(first.id, T0 + 3);
    h.call({ op: 'releaseHold', lane: 'default' }, T0 + 4);
    publish(102, T0 + 5);
    const second = h.call(
      { op: 'rollback', id: first.id, actor: 'op' },
      T0 + 6
    ).deployment;
    expect(second.sourceDeploymentId).toBe(good.id);
    resolve(second.id, T0 + 7);
    for (const id of [good.id, first.id, second.id])
      expect(() => h.call({ op: 'rollback', id, actor: 'op' }, T0 + 8)).toThrow(
        'Already current'
      );
  });

  it('never queues a deploy behind an unresolved marker', () => {
    const staging = harness(store, 'staging');
    const source = staging.deploy(100, T0, { ref: 'refs/heads/main' });
    staging.complete(source.id, staging.claim(source.id, T0).grant, T0 + 1);
    const settled = staging.call({ op: 'get', id: source.id }, T0 + 2);
    const production = harness(store);
    const { deployment: marker } = production.call(
      { op: 'promotion', source: settled, actor: 'op' },
      T0 + 3
    );
    const deploy = production.deploy(101, T0 + 4);
    const granted = production.claim(deploy.id, T0 + 5);
    expect(granted.decision).toBe('granted');
    // The marker resolves once the lane is free again.
    expect(() =>
      production.call(
        {
          op: 'resolve',
          id: marker.id,
          outcome: 'succeeded',
          actor: 'op',
          url: null,
        },
        T0 + 6
      )
    ).toThrow('INVALID_STATE');
    production.complete(deploy.id, granted.grant, T0 + 7);
    expect(
      production.call(
        {
          op: 'resolve',
          id: marker.id,
          outcome: 'succeeded',
          actor: 'op',
          url: null,
        },
        T0 + 8
      ).status
    ).toBe('succeeded');
  });

  it('charges a durable daily budget and rejects without writing', () => {
    const h = harness(store);
    const first = h.deploy(100, T0);
    for (let index = 1; index < LIMITS.dailyBudget; index += 1)
      h.attempt({ op: 'claim', id: first.id, workerId: 'w', runId: 1 }, T0);
    const rejected = h.attempt(
      { op: 'claim', id: first.id, workerId: 'w', runId: 100 },
      T0
    );
    expect(rejected).toMatchObject({ ok: false, code: 'BUDGET_EXHAUSTED' });
    expect(h.call({ op: 'get', id: first.id }, T0).status).toBe('queued');
    expect(
      h.call({ op: 'stop', actor: 'op', reason: 'loop' }, T0).stopped
    ).toBe(true);
    // A new UTC day starts a new budget.
    const tomorrow = T0 + 24 * 60 * MIN;
    const next = h.deploy(101, tomorrow);
    expect(h.claim(next.id, tomorrow).decision).toBe('stopped');
  });

  it('bounds open preview lanes and expires abandoned queue entries', () => {
    const h = harness(store, 'preview');
    for (let index = 0; index < LIMITS.openPreviewLanes; index += 1)
      h.deploy(100 + index, T0, {
        lane: `feature/${index}`,
        idempotencyKey: `ci:${index}`,
      });
    expect(() =>
      h.deploy(999, T0, { lane: 'feature/extra', idempotencyKey: 'ci:extra' })
    ).toThrow('CAPACITY');
    const later = T0 + LIMITS.queueTtlMs + 1;
    const fresh = h.deploy(999, later, {
      lane: 'feature/extra',
      idempotencyKey: 'ci:extra',
    });
    expect(fresh.status).toBe('queued');
    const lane = h
      .call({ op: 'snapshot' }, later)
      .lanes.find((entry: { lane: string }) => entry.lane === 'feature/0');
    expect(lane.deployments[0]).toMatchObject({
      status: 'cancelled',
      failureReason: 'QUEUE_EXPIRED',
    });
  });

  it('keeps lanes whose unknown attempts can still reconcile', () => {
    const h = harness(store, 'preview');
    const lane = (index: number) => `feature/${index}`;
    const stuck = h.deploy(1, T0, { lane: lane(0), idempotencyKey: 'ci:0' });
    const { grant } = h.claim(stuck.id, T0);
    const lapse = T0 + LIMITS.leaseMs + LIMITS.graceMs + 1;
    // Settles the lapse first so the stuck lane is the least recently used.
    expect(h.call({ op: 'get', id: stuck.id }, lapse).status).toBe('unknown');
    for (let index = 1; index < LIMITS.maxLanes; index += 1) {
      const queued = h.deploy(1 + index, lapse + index, {
        lane: lane(index),
        idempotencyKey: `ci:${index}`,
      });
      h.call(
        {
          op: 'skip',
          id: queued.id,
          runId: 1 + index,
          reason: 'NOTHING_TO_PUBLISH',
        },
        lapse + index
      );
    }

    // At the lane ceiling the least recently used idle lane is evicted, but
    // never the one whose unknown attempt can still report.
    const now = lapse + LIMITS.maxLanes;
    h.deploy(999, now, { lane: 'feature/new', idempotencyKey: 'ci:new' });
    expect(h.complete(stuck.id, grant, now + 1)).toMatchObject({
      status: 'succeeded',
      reconciled: true,
    });
    expect(() => h.call({ op: 'get', id: stuck.id }, now + 1)).not.toThrow();
    expect(h.store.recent(lane(1), 10)).toEqual([]);
  });

  it('keeps a recent unknown attempt through retention pruning', () => {
    const h = harness(store);
    const stuck = h.deploy(1, T0);
    const { grant } = h.claim(stuck.id, T0);
    const lapse = T0 + LIMITS.leaseMs + LIMITS.graceMs + 1;
    for (let run = 2; run < LIMITS.retainPerLane + 30; run += 1) {
      const queued = h.deploy(run, lapse + run);
      h.call(
        { op: 'skip', id: queued.id, runId: run, reason: 'NOTHING_TO_PUBLISH' },
        lapse + run
      );
    }
    const late = lapse + 1_000;
    expect(h.complete(stuck.id, grant, late)).toMatchObject({
      status: 'succeeded',
      reconciled: true,
    });
  });

  it('retains a bounded history and keeps the current deployment', () => {
    const h = harness(store);
    const current = h.deploy(1, T0);
    h.complete(current.id, h.claim(current.id, T0).grant, T0);
    for (let run = 2; run < LIMITS.retainPerLane + 30; run += 1) {
      const queued = h.deploy(run, T0 + run);
      h.call(
        { op: 'skip', id: queued.id, runId: run, reason: 'NOTHING_TO_PUBLISH' },
        T0 + run
      );
    }
    expect(h.call({ op: 'get', id: current.id }, T0 + 500).status).toBe(
      'succeeded'
    );
    const recent = h.store.recent('default', 1_000);
    expect(recent.length).toBeLessThanOrEqual(LIMITS.retainPerLane + 1);
  });
});
