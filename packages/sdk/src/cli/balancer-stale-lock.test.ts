import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseRunRequest } from '@tuturuuu/devbox';
import { expect, it, vi } from 'vitest';
import { type ControllerDeps, dispatchRun } from './balancer-controller';
import { BalancerLedger } from './balancer-ledger';
import { fixtureHost } from './balancer-test-fixtures';

// Port of the security review's real-I/O stale-owner race. The old protocol
// lets both owners observe the dead PID, then B deletes A's successor lock.
const barrier = vi.hoisted(() => {
  const gate = () => {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    return { promise, release: () => release() };
  };
  return {
    armed: false,
    pidReads: 0,
    runReads: 0,
    twoPids: gate(),
    firstRun: gate(),
    twoRuns: gate(),
  };
});
vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>();
  const readFile = async (...args: Parameters<typeof real.readFile>) => {
    const value = await real.readFile(...args);
    if (!barrier.armed) return value;
    if (String(args[0]).endsWith('/.lock/pid') && barrier.pidReads < 2) {
      if (++barrier.pidReads === 1) await barrier.twoPids.promise;
      else {
        barrier.twoPids.release();
        await barrier.firstRun.promise;
      }
    }
    // Only pause queued reads once both stale PID observations occurred.
    // The kernel-lock protocol never reads a PID or enters this barrier.
    if (
      barrier.pidReads === 2 &&
      String(args[0]).endsWith('/proof-stale-lock-race-r1.json') &&
      barrier.runReads < 2
    ) {
      if (++barrier.runReads === 1) {
        barrier.firstRun.release();
        await barrier.twoRuns.promise;
      } else barrier.twoRuns.release();
    }
    return value;
  };
  return { ...real, readFile };
});

it('dispatches exactly once across hosts after concurrent stale-lock recovery', async () => {
  const home = await mkdtemp(join(tmpdir(), 'stale-lock-'));
  try {
    const a = new BalancerLedger(home),
      b = new BalancerLedger(home);
    const {
      runs: [run],
    } = await a.submit(
      parseRunRequest({
        requestId: 'proof-stale-lock-race',
        source: { repo: 'tutur3u/platform', baseSha: 'a'.repeat(40) },
        command: ['true'],
        replicas: 1,
      })
    );
    if (!run) throw new Error('Missing submitted run');
    const lock = join(a.root, '.lock');
    // Current stores retain their permanent legacy fence. The historical
    // negative control still receives the reviewer's abandoned PID lock.
    if (!existsSync(lock)) {
      mkdirSync(lock);
      writeFileSync(join(lock, 'pid'), '2147483647');
    }
    const hosts = [fixtureHost('linux'), fixtureHost('thanh')];
    const starts: { host: string; runId: string }[] = [];
    let lease = 0;
    const deps = (ledger: BalancerLedger): ControllerDeps => ({
      ledger,
      registry: { telemetryTtlSeconds: 60, hosts },
      newLeaseId: () =>
        `00000000-0000-4000-8000-${String(++lease).padStart(12, '0')}`,
      transport: () => ({
        call: async (host, action, _args, stdin) => {
          if (action === 'start')
            starts.push({ host: host.id, runId: JSON.parse(stdin!).runId });
          return { ok: true, value: { accepted: true } };
        },
      }),
    });
    barrier.armed = true;
    await Promise.all([
      dispatchRun(deps(a), run, 'linux'),
      dispatchRun(deps(b), run, 'thanh'),
    ]);
    expect(starts).toEqual([
      { host: expect.stringMatching(/^(linux|thanh)$/u), runId: run.runId },
    ]);
    const placed = await a.readRun(run.runId);
    expect(placed?.deviceId).toBe(starts[0]?.host);
    expect(placed?.lease?.leaseId).toBeDefined();
  } finally {
    barrier.armed = false;
    await rm(home, { recursive: true, force: true });
  }
});

it('keeps a live process lock exclusive and releases it after process death', async () => {
  const home = await mkdtemp(join(tmpdir(), 'ledger-kernel-lock-'));
  const ledger = new BalancerLedger(home);
  await ledger.withLock(async () => {});
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { openSync } from 'node:fs';
    import { tryLock } from 'fs-native-extensions';
    const fd = openSync(process.argv[1], 'r+');
    if (!tryLock(fd)) throw new Error('Child failed to acquire kernel lock');
    process.stdout.write('locked');
    setInterval(() => {}, 1000);
  `,
      join(ledger.root, '.lock', 'mutex'),
    ],
    { cwd: join(__dirname, '../..'), stdio: ['ignore', 'pipe', 'inherit'] }
  );
  const exited = once(child, 'exit');
  try {
    await once(child.stdout, 'data');
    let entered = false;
    const pending = ledger.withLock(async () => {
      entered = true;
    });
    // A round trip through an unrelated lock lets the pending acquisition run.
    await new BalancerLedger(join(home, 'other')).withLock(async () => {});
    expect(entered).toBe(false);
    child.kill('SIGKILL');
    await exited;
    await pending;
    expect(entered).toBe(true);
    // An exception releases the owned transaction as well.
    await expect(
      ledger.withLock(async () => {
        throw new Error('action failed');
      })
    ).rejects.toThrow('action failed');
    await expect(
      new BalancerLedger(home).withLock(async () => 'reacquired')
    ).resolves.toBe('reacquired');
  } finally {
    child.kill('SIGKILL');
    await exited;
    await rm(home, { recursive: true, force: true });
  }
});
