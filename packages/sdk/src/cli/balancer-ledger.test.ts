import { readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { parseRunRequest } from '@tuturuuu/devbox';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { balancerTick, type ControllerDeps } from './balancer-controller';
import { BalancerLedger } from './balancer-ledger';
import { fixtureHost, fixtureTelemetry } from './balancer-test-fixtures';
import type { AgentAction, AgentReply } from './balancer-transport';

// Failure injection: when armed, the first request-marker write fails once a
// run file for that request is already on disk (a crash between the two).
const fault = vi.hoisted(() => ({ armed: false }));
vi.mock('./atomic-file', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./atomic-file')>();
  return {
    ...actual,
    writeFileAtomically: async (
      path: string,
      ...rest: Parameters<typeof actual.writeFileAtomically> extends [
        string,
        ...infer R,
      ]
        ? R
        : never
    ) => {
      if (fault.armed && basename(dirname(path)) === 'requests') {
        const requestId = basename(path, '.json');
        const runs = readdirSync(join(dirname(dirname(path)), 'runs'));
        if (runs.some((name) => name.startsWith(`${requestId}-`))) {
          fault.armed = false;
          throw new Error('injected I/O failure');
        }
      }
      return actual.writeFileAtomically(path, ...rest);
    },
  };
});

const dirs: string[] = [];
afterEach(async () => {
  fault.armed = false;
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

const sha = 'b89f52321ec9bbc26e63c8978320d7e111e74c31';
const linux = fixtureHost('linux', { preference: 1 });
const thanh = fixtureHost('thanh', { preference: 2 });
const request = (requestId: string) =>
  parseRunRequest({
    requestId,
    source: { repo: 'tutur3u/platform', baseSha: sha },
    command: ['bun', 'x', 'vitest', 'run'],
    cwd: 'packages/sdk',
    replicas: 1,
  });

type Host = typeof linux;
function host(target: Host, starts: string[], probeDown: { value: boolean }) {
  const leases = new Map<string, Record<string, unknown>>();
  return (action: AgentAction, args: string[], stdin?: string): AgentReply => {
    if (action === 'probe') {
      if (probeDown.value)
        return { ok: false, uncertain: true, error: 'host is unreachable' };
      const {
        deviceId: _d,
        receivedAt: _r,
        ...value
      } = fixtureTelemetry(target, Date.now());
      return { ok: true, value: value as Record<string, unknown> };
    }
    if (action === 'start') {
      const spec = JSON.parse(stdin!);
      starts.push(`${target.id}:${spec.runId}`);
      leases.set(spec.runId, spec);
      return { ok: true, value: { accepted: true } };
    }
    const lease = leases.get(args[0]!);
    if (!lease) return { ok: true, value: { exists: false } };
    return {
      ok: true,
      value: { exists: true, lease, phase: { phase: 'running' }, alive: true },
    };
  };
}

describe('balancer ledger submit', () => {
  it('never re-queues a run another controller placed after a partial submit', async () => {
    const home = await mkdtemp(join(tmpdir(), 'balancer-ledger-'));
    dirs.push(home);
    const starts: string[] = [];
    const linuxDown = { value: false };
    const handlers = {
      linux: host(linux, starts, linuxDown),
      thanh: host(thanh, starts, { value: false }),
    };
    let leases = 0;
    // Controller A submits; controller B dispatches. Separate ledger
    // instances share one durable ledger directory.
    const submitter = new BalancerLedger(home);
    const dispatcher: ControllerDeps = {
      ledger: new BalancerLedger(home),
      registry: { telemetryTtlSeconds: 60, hosts: [linux, thanh] },
      transport: () => ({
        async call(target, action, args = [], stdin) {
          return handlers[target.id as keyof typeof handlers](
            action,
            args,
            stdin
          );
        },
      }),
      newLeaseId: () =>
        `00000000-0000-4000-8000-${String(++leases).padStart(12, '0')}`,
    };

    fault.armed = true;
    await expect(
      submitter.submit(request('proof-partial-submit'))
    ).rejects.toThrow('injected I/O failure');

    const failures = new Map<string, number>();
    await balancerTick(dispatcher, failures);
    const [placed] = await submitter.listRuns('proof-partial-submit');
    expect([placed?.state, placed?.deviceId]).toEqual(['placed', 'linux']);

    // The requester retries the same request; linux stops answering probes
    // so any re-queued copy would land on thanh.
    const retry = await submitter.submit(request('proof-partial-submit'));
    linuxDown.value = true;
    await balancerTick(dispatcher, failures);

    expect(starts).toEqual(['linux:proof-partial-submit-r1']);
    const [after] = await submitter.listRuns('proof-partial-submit');
    expect(after?.lease).toEqual(placed?.lease);
    // linux reports the original lease running; it advances, never re-queues.
    expect([after?.state, after?.deviceId]).toEqual(['running', 'linux']);
    expect(retry.created).toBe(false);
    expect(retry.runs[0]).toEqual(placed);
  });
});
