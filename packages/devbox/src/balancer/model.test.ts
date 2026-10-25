import { describe, expect, it } from 'vitest';
import {
  type BalancerHostPolicy,
  type BalancerHostTelemetry,
  balancerConstraintBlocker,
  balancerHostVerdict,
} from './eligibility';
import {
  acceptResult,
  advanceRun,
  type BalancerResult,
  type BalancerRun,
  BalancerTransitionError,
  consumeResult,
} from './model';
import {
  BalancerRequestError,
  parseRunRequest,
  runsForRequest,
} from './request';

const sha = 'b89f52321ec9bbc26e63c8978320d7e111e74c31';
const at = '2026-10-25T05:00:00.000Z';
const request = parseRunRequest({
  requestId: 'proof-plan-test-20261025',
  source: { repo: 'tutur3u/platform', baseSha: sha },
  command: [
    'bun',
    'x',
    'vitest',
    'run',
    'src/cli/resources-hosts-plan.test.ts',
  ],
  cwd: 'packages/sdk',
  jobClass: 'light',
  replicas: 2,
});
const queued = () => runsForRequest(request, 'source-1', at)[0]!;
const leased = (): BalancerRun =>
  advanceRun(queued(), 'placed', at, 'placed on linux', {
    deviceId: 'linux',
    lease: {
      leaseId: 'lease-1',
      runId: queued().runId,
      deviceId: 'linux',
      fence: 1,
      issuedAt: at,
    },
  });
const result = (patch: Partial<BalancerResult> = {}): BalancerResult => ({
  resultId: 'lease-1',
  runId: queued().runId,
  fence: 1,
  status: 'succeeded',
  exitCode: 0,
  phase: 'command',
  finishedAt: at,
  ...patch,
});

describe('balancer run requests', () => {
  it('derives one stable run per replica', () => {
    const runs = runsForRequest(request, 'source-1', at);
    expect(runs.map((run) => run.runId)).toEqual([
      'proof-plan-test-20261025-r1',
      'proof-plan-test-20261025-r2',
    ]);
    expect(runs.every((run) => run.state === 'queued')).toBe(true);
  });

  it.each([
    [{ cwd: '../outside' }, /clean relative/],
    [{ cwd: '/abs' }, /clean relative/],
    [{ source: { repo: 'tutur3u/platform', baseSha: 'main' } }, /40-character/],
    [{ command: 'bun test' }, /argv/],
    [{ command: ['__ttr_commit_run_v1__', 'x'] }, /envelope/],
    [{ requestId: 'short' }, /requestId/],
    [
      {
        source: {
          repo: 'tutur3u/platform',
          baseSha: sha,
          patch: { digest: 'x', bytes: 1 },
        },
      },
      /dirty-source/,
    ],
  ])('rejects %j', (patch, message) => {
    expect(() =>
      parseRunRequest({
        requestId: 'proof-plan-test-20261025',
        source: { repo: 'tutur3u/platform', baseSha: sha },
        command: ['bun', 'test'],
        ...patch,
      })
    ).toThrow(BalancerRequestError);
    expect(() =>
      parseRunRequest({
        requestId: 'proof-plan-test-20261025',
        source: { repo: 'tutur3u/platform', baseSha: sha },
        command: ['bun', 'test'],
        ...patch,
      })
    ).toThrow(message);
  });
});

describe('balancer run state', () => {
  it('never reschedules an UNKNOWN run', () => {
    const unknown = advanceRun(leased(), 'unknown', at, 'lost contact');
    expect(() => advanceRun(unknown, 'queued', at)).toThrow(
      BalancerTransitionError
    );
    expect(() => advanceRun(unknown, 'placed', at)).toThrow(
      BalancerTransitionError
    );
    // Reconcile can still settle it from the host record.
    expect(advanceRun(unknown, 'running', at).state).toBe('running');
  });

  it('keeps terminal states final', () => {
    const done = advanceRun(leased(), 'succeeded', at);
    expect(() => advanceRun(done, 'running', at)).toThrow(
      BalancerTransitionError
    );
  });

  it('accepts a result only for the current lease and fence', () => {
    expect(acceptResult(leased(), result({ resultId: 'old' }), at)).toEqual({
      accepted: false,
      reason: 'result carries a stale lease',
    });
    expect(acceptResult(leased(), result({ fence: 2 }), at).accepted).toBe(
      false
    );
    expect(acceptResult(queued(), result(), at).accepted).toBe(false);
    const first = acceptResult(leased(), result(), at);
    expect(first).toMatchObject({ accepted: true, duplicate: false });
    if (!first.accepted) throw new Error('expected acceptance');
    expect(first.run.state).toBe('succeeded');
    expect(acceptResult(first.run, result(), at)).toMatchObject({
      accepted: true,
      duplicate: true,
    });
  });

  it('settles an UNKNOWN run from a late host result', () => {
    const unknown = advanceRun(leased(), 'unknown', at, 'lost contact');
    const verdict = acceptResult(
      unknown,
      result({ status: 'failed', exitCode: 1 }),
      at
    );
    expect(verdict.accepted && verdict.run.state).toBe('failed');
  });

  it('records consumption once per thread and result', () => {
    const verdict = acceptResult(leased(), result(), at);
    if (!verdict.accepted) throw new Error('expected acceptance');
    const once = consumeResult(verdict.run, 'thread-a', at);
    expect(once.alreadyConsumed).toBe(false);
    const twice = consumeResult(once.run, 'thread-a', at);
    expect(twice.alreadyConsumed).toBe(true);
    expect(twice.run.consumedBy).toHaveLength(1);
    expect(() => consumeResult(leased(), 'thread-a', at)).toThrow();
  });
});

describe('balancer host eligibility', () => {
  const policy: BalancerHostPolicy = {
    id: 'linux',
    hostname: 'sokora-ubuntu',
    platform: 'linux',
    arch: 'x64',
    minDiskGiB: 50,
  };
  const now = Date.parse(at);
  const fresh = (
    patch: Partial<BalancerHostTelemetry> = {}
  ): BalancerHostTelemetry => ({
    deviceId: 'linux',
    receivedAt: new Date(now - 5_000).toISOString(),
    hostname: 'sokora-ubuntu',
    platform: 'linux',
    arch: 'x64',
    cpus: 20,
    memoryGiB: 31,
    load1: 2,
    memoryPressure: 'normal',
    diskFreeGiB: 275,
    diskFreePercent: 30,
    queue: { enabled: true, lanes: 2, occupied: 0, waiting: 0 },
    ...patch,
  });

  it('is eligible only with fresh, complete telemetry', () => {
    expect(balancerHostVerdict(policy, fresh(), now)).toEqual({
      status: 'eligible',
    });
  });

  it.each([
    ['missing telemetry', undefined],
    [
      'stale telemetry',
      fresh({ receivedAt: new Date(now - 61_000).toISOString() }),
    ],
    [
      'future telemetry',
      fresh({ receivedAt: new Date(now + 5_000).toISOString() }),
    ],
    ['missing queue', fresh({ queue: undefined })],
    ['missing disk', fresh({ diskFreeGiB: undefined })],
    ['missing disk percent', fresh({ diskFreePercent: undefined })],
    ['missing load', fresh({ load1: undefined })],
    ['missing pressure', fresh({ memoryPressure: undefined })],
  ])('treats %s as UNKNOWN, not idle', (_label, telemetry) => {
    expect(balancerHostVerdict(policy, telemetry, now).status).toBe('unknown');
  });

  it.each([
    ['identity mismatch', fresh({ hostname: 'other' })],
    ['low disk', fresh({ diskFreeGiB: 10 })],
    // Sonha on 2026-10-25: 322 GiB free was only 4.3% of the volume.
    ['low disk percent', fresh({ diskFreeGiB: 322, diskFreePercent: 4.3 })],
    ['high load', fresh({ load1: 25 })],
    ['critical memory', fresh({ memoryPressure: 'critical' })],
    [
      'disabled admission',
      fresh({ queue: { enabled: false, lanes: 2, occupied: 0, waiting: 0 } }),
    ],
  ])('blocks %s', (_label, telemetry) => {
    expect(balancerHostVerdict(policy, telemetry, now).status).toBe('blocked');
  });

  it('honours an operator hold before any telemetry', () => {
    expect(
      balancerHostVerdict({ ...policy, hold: 'maintenance' }, fresh(), now)
    ).toEqual({ status: 'held', reason: 'maintenance' });
  });

  it('applies request constraints', () => {
    expect(balancerConstraintBlocker(policy, { os: ['darwin'] })).toMatch(
      /platform/
    );
    expect(balancerConstraintBlocker(policy, { excludeHosts: ['linux'] })).toBe(
      'excluded'
    );
    expect(balancerConstraintBlocker(policy, {})).toBeUndefined();
  });
});
