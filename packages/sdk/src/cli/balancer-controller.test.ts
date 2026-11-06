import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseRunRequest } from '@tuturuuu/devbox';
import { afterEach, describe, expect, it } from 'vitest';
import {
  balancerTick,
  type ControllerDeps,
  cancelRun,
  consumeRunResult,
  dispatchRun,
  LOST_CONTACT_FAILURES,
  reconcileRun,
} from './balancer-controller';
import { BalancerConflictError, BalancerLedger } from './balancer-ledger';
import { fixtureHost, fixtureTelemetry } from './balancer-test-fixtures';
import type {
  AgentAction,
  AgentReply,
  BalancerTransport,
} from './balancer-transport';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});
const sha = 'b89f52321ec9bbc26e63c8978320d7e111e74c31';
const linux = fixtureHost('linux', { preference: 1 });
const thanh = fixtureHost('thanh', { preference: 2 });
let leases = 0;

type Handler = (
  action: AgentAction,
  args: string[],
  stdin?: string
) => AgentReply;
async function setup(handler: Record<string, Handler>) {
  const home = await mkdtemp(join(tmpdir(), 'balancer-controller-'));
  dirs.push(home);
  const calls: { host: string; action: AgentAction; args: string[] }[] = [];
  const transport = (): BalancerTransport => ({
    async call(host, action, args = [], stdin) {
      calls.push({ host: host.id, action, args });
      return handler[host.id]!(action, args, stdin);
    },
  });
  const deps: ControllerDeps = {
    ledger: new BalancerLedger(home),
    registry: { telemetryTtlSeconds: 60, hosts: [linux, thanh] },
    transport,
    newLeaseId: () =>
      `00000000-0000-4000-8000-${String(++leases).padStart(12, '0')}`,
  };
  return { deps, calls };
}
const request = (requestId: string, replicas = 2) =>
  parseRunRequest({
    requestId,
    source: { repo: 'tutur3u/platform', baseSha: sha },
    command: [
      'bun',
      'x',
      'vitest',
      'run',
      'src/cli/resources-hosts-plan.test.ts',
    ],
    cwd: 'packages/sdk',
    replicas,
  });
const probe = (host: typeof linux): AgentReply => {
  const {
    deviceId: _d,
    receivedAt: _r,
    ...value
  } = fixtureTelemetry(host, Date.now());
  return { ok: true, value: value as Record<string, unknown> };
};
const unreachable: AgentReply = {
  ok: false,
  uncertain: true,
  error: 'host is unreachable',
};

function healthyHost(
  host: typeof linux,
  results: Map<string, Record<string, unknown>>
): Handler {
  const leasesByRun = new Map<string, Record<string, unknown>>();
  return (action, args, stdin) => {
    if (action === 'probe') return probe(host);
    if (action === 'start') {
      const spec = JSON.parse(stdin!);
      if (leasesByRun.has(spec.runId))
        return {
          ok: true,
          value: { accepted: false, reason: 'duplicate_admission' },
        };
      leasesByRun.set(spec.runId, spec);
      return { ok: true, value: { accepted: true } };
    }
    if (action === 'status') {
      const lease = leasesByRun.get(args[0]!);
      if (!lease) return { ok: true, value: { exists: false } };
      return {
        ok: true,
        value: {
          exists: true,
          lease,
          phase: { phase: 'running' },
          result: results.get(args[0]!),
          alive: true,
        },
      };
    }
    return { ok: true, value: { exists: true, signalled: true } };
  };
}

describe('balancer controller', () => {
  it('runs one request on two hosts and accepts each lease-bound result', async () => {
    const results = new Map<string, Record<string, unknown>>();
    const { deps, calls } = await setup({
      linux: healthyHost(linux, results),
      thanh: healthyHost(thanh, results),
    });
    await deps.ledger.submit(request('proof-two-host-run-1'));
    const failures = new Map<string, number>();
    await balancerTick(deps, failures);
    let runs = await deps.ledger.listRuns('proof-two-host-run-1');
    expect(runs.map((run) => [run.deviceId, run.state])).toEqual([
      ['linux', 'placed'],
      ['thanh', 'placed'],
    ]);
    for (const run of runs)
      results.set(run.runId, {
        resultId: run.lease!.leaseId,
        runId: run.runId,
        fence: 1,
        status: 'succeeded',
        exitCode: 0,
        phase: 'command',
        finishedAt: new Date().toISOString(),
      });
    await balancerTick(deps, failures);
    runs = await deps.ledger.listRuns('proof-two-host-run-1');
    expect(runs.map((run) => run.state)).toEqual(['succeeded', 'succeeded']);
    expect(calls.filter((call) => call.action === 'start')).toHaveLength(2);
    const consumed = await consumeRunResult(
      deps.ledger,
      runs[0]!.runId,
      'thread-a'
    );
    const again = await consumeRunResult(
      deps.ledger,
      runs[0]!.runId,
      'thread-a'
    );
    expect([consumed.alreadyConsumed, again.alreadyConsumed]).toEqual([
      false,
      true,
    ]);
  });

  it('rejects a duplicate request with different parameters', async () => {
    const { deps } = await setup({});
    await deps.ledger.submit(request('proof-duplicate-req-1'));
    expect(
      (await deps.ledger.submit(request('proof-duplicate-req-1'))).created
    ).toBe(false);
    await expect(
      deps.ledger.submit(request('proof-duplicate-req-1', 1))
    ).rejects.toThrow(BalancerConflictError);
  });

  it('lets only one writer dispatch a queued run', async () => {
    const results = new Map();
    const { deps, calls } = await setup({ linux: healthyHost(linux, results) });
    const { runs } = await deps.ledger.submit(
      request('proof-single-writer', 1)
    );
    const [a, b] = await Promise.all([
      dispatchRun(deps, runs[0]!, 'linux'),
      dispatchRun(deps, runs[0]!, 'linux'),
    ]);
    expect(calls.filter((call) => call.action === 'start')).toHaveLength(1);
    expect(a.lease?.leaseId).toBe(b.lease?.leaseId);
  });

  it('marks an uncertain start UNKNOWN and never redispatches it', async () => {
    const { deps, calls } = await setup({
      linux: (action) => (action === 'probe' ? probe(linux) : unreachable),
      thanh: (action) => (action === 'probe' ? probe(thanh) : unreachable),
    });
    await deps.ledger.submit(request('proof-uncertain-start', 1));
    const failures = new Map<string, number>();
    await balancerTick(deps, failures);
    for (let i = 0; i < 5; i++) await balancerTick(deps, failures);
    const [run] = await deps.ledger.listRuns('proof-uncertain-start');
    expect(run!.state).toBe('unknown');
    expect(calls.filter((call) => call.action === 'start')).toHaveLength(1);
  });

  it('turns a lost connection into UNKNOWN, then settles it from the host record', async () => {
    const results = new Map<string, Record<string, unknown>>();
    const live = healthyHost(linux, results);
    let connected = true;
    const { deps, calls } = await setup({
      linux: (action, args, stdin) =>
        connected || action === 'start'
          ? live(action, args, stdin)
          : unreachable,
      thanh: () => unreachable,
    });
    await deps.ledger.submit(request('proof-lost-connection', 1));
    const failures = new Map<string, number>();
    await balancerTick(deps, failures);
    connected = false;
    for (let i = 0; i < LOST_CONTACT_FAILURES; i++)
      await balancerTick(deps, failures);
    let [run] = await deps.ledger.listRuns('proof-lost-connection');
    expect(run!.state).toBe('unknown');
    expect(run!.history.at(-1)!.reason).toMatch(/lost contact/);
    expect(calls.filter((call) => call.action === 'start')).toHaveLength(1);
    connected = true;
    results.set(run!.runId, {
      resultId: run!.lease!.leaseId,
      runId: run!.runId,
      fence: 1,
      status: 'failed',
      exitCode: 1,
      phase: 'command',
      finishedAt: new Date().toISOString(),
    });
    run = await reconcileRun(deps, run!, failures);
    expect(run.state).toBe('failed');
  });

  it('ignores a result from a stale lease', async () => {
    const results = new Map<string, Record<string, unknown>>();
    const { deps } = await setup({
      linux: healthyHost(linux, results),
      thanh: () => unreachable,
    });
    await deps.ledger.submit(request('proof-stale-result-01', 1));
    await balancerTick(deps, new Map());
    const [run] = await deps.ledger.listRuns('proof-stale-result-01');
    results.set(run!.runId, {
      resultId: '00000000-0000-4000-8000-999999999999',
      runId: run!.runId,
      fence: 1,
      status: 'succeeded',
      exitCode: 0,
      phase: 'command',
      finishedAt: new Date().toISOString(),
    });
    const after = await reconcileRun(deps, run!);
    expect(after.state).toBe('unknown');
    expect(after.result).toBeUndefined();
  });

  it('cancels queued runs locally and asks the host to stop placed runs', async () => {
    const results = new Map();
    const { deps, calls } = await setup({
      linux: healthyHost(linux, results),
      thanh: () => unreachable,
    });
    const { runs } = await deps.ledger.submit(request('proof-cancellation-01'));
    await balancerTick(deps, new Map());
    const [placed, queued] = await deps.ledger.listRuns(
      'proof-cancellation-01'
    );
    expect([placed!.state, queued!.state]).toEqual(['placed', 'queued']);
    expect((await cancelRun(deps, queued!.runId)).state).toBe('cancelled');
    const stopping = await cancelRun(deps, placed!.runId);
    expect(stopping.cancelRequestedAt).toBeDefined();
    expect(calls.at(-1)).toMatchObject({
      action: 'cancel',
      args: [placed!.runId, placed!.lease!.leaseId],
    });
    expect(runs).toHaveLength(2);
  });
});
