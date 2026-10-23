import { lstatSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GiB, type VolumeProbe } from './storage-headroom';
import { hysteresisThresholds } from './storage-hysteresis';
import {
  acquireLease,
  type Lease,
  type LeaseRecord,
  leaseFile,
} from './storage-lease';
import { runReclaim } from './storage-reclaim';
import type { ReclaimCandidate } from './storage-reclaim-plan';

beforeEach(() => {
  vi.stubEnv('TTR_STORAGE_AUTO_RECLAIM', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const home = async () => realpath(await mkdtemp(join(tmpdir(), 'ttr-lease-')));
const alive = () => true;
const low: VolumeProbe = {
  path: '/',
  device: lstatSync(tmpdir()).dev,
  totalBytes: 500 * GiB,
  freeBytes: 5 * GiB,
  usedBytes: 495 * GiB,
  freePercent: 1,
  inodesTotal: null,
  inodesFree: null,
  inodeFreePercent: null,
};
const take = (result: ReturnType<typeof acquireLease>): Lease => {
  if (!result.acquired) throw new Error(result.reason);
  return result.lease;
};

describe('storage-authority cleanup lease', () => {
  it('admits one holder; a second orchestrator gets a report naming the first', async () => {
    const dir = await home();
    const first = take(
      acquireLease({
        home: dir,
        host: 'mac-1',
        trigger: 'admission',
        orchestrator: 'tuturuuu',
        alive,
      })
    );
    const second = acquireLease({
      home: dir,
      host: 'mac-1',
      trigger: 'heartbeat',
      orchestrator: 'upskii',
      alive,
    });
    expect(second).toMatchObject({
      acquired: false,
      holder: { orchestrator: 'tuturuuu', host: 'mac-1', trigger: 'admission' },
    });
    expect(!second.acquired && second.reason).toMatch(
      /lease of this storage authority held by pid \d+ on mac-1 for tuturuuu/u
    );
    // Keyed by host inside this user's storage home.
    expect(
      acquireLease({ home: dir, host: 'mac-2', trigger: 'x', alive }).acquired
    ).toBe(true);
    first.release();
    const again = take(
      acquireLease({ home: dir, host: 'mac-1', trigger: 'x', alive })
    );
    // Fences are monotonic across release and reacquire.
    expect(again.record.fence).toBe(first.record.fence + 1);
  });

  it('a paused holder whose lease was taken over never removes anything', async () => {
    const dir = await home();
    const root = join(dir, 'DerivedData');
    const path = join(root, 'App');
    await mkdir(path, { recursive: true });
    let clock = Date.parse('2026-10-23T04:00:00.000Z');
    const removeTree = vi.fn();
    let probes = 0;
    let successor: Lease | null = null;
    const candidate: ReclaimCandidate = {
      rule: 'xcode-derived-data-idle',
      path,
      root,
      bytes: GiB,
      owner: 'machine user',
      scopePaths: [path],
      recheck: () => null,
    };
    const result = await runReclaim({
      home: dir,
      host: 'mac-1',
      orchestrator: 'mastermind',
      trigger: 'admission',
      leaseTtlMs: 60_000,
      now: () => clock,
      lease: { alive },
      // The old holder renewed, then stalls here past its TTL while a new
      // holder takes over; then it resumes with a low reading.
      probe: async () => {
        if (probes++ === 1) {
          clock += 61_000;
          successor = take(
            acquireLease({
              home: dir,
              host: 'mac-1',
              trigger: 'heartbeat',
              orchestrator: 'tuturuuu',
              now: () => clock,
              alive,
            })
          );
        }
        return low;
      },
      thresholds: hysteresisThresholds({}),
      plan: () => [candidate],
      holds: () => [],
      liveness: { cwds: () => [], openFiles: () => 'none' },
      removeTree,
    });
    expect(result.status).toBe('lease-lost');
    expect(result.reason).toMatch(/taken over|expired/u);
    expect(removeTree).not.toHaveBeenCalled();
    // The successor still holds a strictly larger fence; the old holder's
    // release did not drop it.
    const next = successor as Lease | null;
    expect(next?.owned()).toBe(true);
    expect(next?.record.fence).toBeGreaterThan(result.fence ?? 0);
  });

  it('serializes renewal against takeover in either order', async () => {
    const dir = await home();
    let clock = Date.parse('2026-10-23T04:00:00.000Z');
    const now = () => clock;
    const old = take(
      acquireLease({
        home: dir,
        host: 'mac-1',
        trigger: 'admission',
        ttlMs: 60_000,
        now,
        alive,
      })
    );
    // Renewal holds the mutation lock: a concurrent takeover cannot proceed.
    let blocked: ReturnType<typeof acquireLease> | null = null;
    // Use the hook on a dedicated holder to interleave inside its renewal.
    const hooked = await home();
    const holder = take(
      acquireLease({
        home: hooked,
        host: 'mac-1',
        trigger: 'admission',
        ttlMs: 60_000,
        now,
        alive,
        inMutation: (operation) => {
          if (operation !== 'renew') return;
          clock += 61_000;
          blocked = acquireLease({
            home: hooked,
            host: 'mac-1',
            trigger: 'heartbeat',
            now,
            alive,
            lockWaitMs: 50,
          });
        },
      })
    );
    // Its own renewal runs after the TTL passed inside the lock: it fails,
    // and the takeover attempted meanwhile could not get the lock.
    expect(holder.renew()).toBe(false);
    expect(blocked).toMatchObject({
      acquired: false,
      reason: expect.stringMatching(/being changed by another caller/u),
    });

    // Takeover holds the lock: the old holder's renewal and guard fail.
    clock += 61_000;
    let renewedDuring: boolean | null = null;
    let guardedDuring: unknown = null;
    const action = vi.fn();
    const successor = take(
      acquireLease({
        home: dir,
        host: 'mac-1',
        trigger: 'heartbeat',
        now,
        alive,
        inMutation: (operation) => {
          if (operation !== 'acquire') return;
          renewedDuring = old.renew();
          guardedDuring = old.guard(action);
        },
      })
    );
    expect(renewedDuring).toBe(false);
    expect(guardedDuring).toMatchObject({ ok: false });
    expect(old.renew()).toBe(false);
    expect(old.guard(action)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/taken over/u),
    });
    expect(action).not.toHaveBeenCalled();
    expect(successor.record.fence).toBeGreaterThan(old.record.fence);
    old.release();
    expect(successor.owned()).toBe(true);
    expect(successor.guard(() => 'ran')).toEqual({ ok: true, value: 'ran' });
  });

  it('takes over a dead pid on this host, never another host by pid alone', async () => {
    const dir = await home();
    const record = (host: string): LeaseRecord => ({
      token: `token-${host}`,
      fence: 7,
      pid: 999_999,
      host,
      startedAt: new Date().toISOString(),
      renewedAt: new Date().toISOString(),
      ttlMs: 15 * 60_000,
      trigger: 'admission',
      orchestrator: 'upskii',
    });
    const file = leaseFile(dir, 'mac-1');
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(record('mac-1')));
    const dead = () => false;
    const taken = take(
      acquireLease({ home: dir, host: 'mac-1', trigger: 'x', alive: dead })
    );
    expect(taken.record.fence).toBe(8);
    const other = leaseFile(dir, 'mac-2');
    await mkdir(dirname(other), { recursive: true });
    await writeFile(other, JSON.stringify(record('elsewhere')));
    expect(
      acquireLease({ home: dir, host: 'mac-2', trigger: 'x', alive: dead })
        .acquired
    ).toBe(false);
  });

  it('breaks a mutation lock left by a dead pid but waits on a live one', async () => {
    const dir = await home();
    const lock = join(dir, 'reclaim', 'mac-1', 'mutation.lock');
    await mkdir(dirname(lock), { recursive: true });
    await writeFile(
      lock,
      JSON.stringify({ token: 't', pid: 999_999, host: 'mac-1', at: '' })
    );
    expect(
      acquireLease({
        home: dir,
        host: 'mac-1',
        trigger: 'x',
        alive: (pid) => pid !== 999_999,
        lockWaitMs: 50,
      }).acquired
    ).toBe(true);
    await writeFile(
      lock,
      JSON.stringify({ token: 'u', pid: process.pid, host: 'mac-1', at: '' })
    );
    const busy = acquireLease({
      home: dir,
      host: 'mac-1',
      trigger: 'y',
      alive,
      lockWaitMs: 50,
    });
    expect(busy).toMatchObject({ acquired: false });
    expect(JSON.parse(await readFile(lock, 'utf8')).token).toBe('u');
  });

  it('treats a reused pid (different start time) as a dead holder', async () => {
    const dir = await home();
    const file = leaseFile(dir, 'mac-1');
    await mkdir(dirname(file), { recursive: true });
    await writeFile(
      file,
      JSON.stringify({
        token: 'old',
        fence: 3,
        pid: 4321,
        pidStart: 1_000_000,
        host: 'mac-1',
        startedAt: new Date().toISOString(),
        renewedAt: new Date().toISOString(),
        ttlMs: 15 * 60_000,
        trigger: 'admission',
        orchestrator: 'upskii',
      })
    );
    const startOf = (pid: number) => (pid === 4321 ? 9_000_000 : 1);
    // The pid answers, but it is another process now.
    expect(
      take(
        acquireLease({ home: dir, host: 'mac-1', trigger: 'x', alive, startOf })
      ).record.fence
    ).toBe(4);
  });

  it('serializes lock breaking behind its own lock', async () => {
    const dir = await home();
    const lock = join(dir, 'reclaim', 'mac-1', 'mutation.lock');
    await mkdir(dirname(lock), { recursive: true });
    const dead = { token: 'dead', pid: 999_999, host: 'mac-1', at: '' };
    await writeFile(lock, JSON.stringify(dead));
    // A live breaker is already at work: nobody else breaks the lock.
    await writeFile(
      `${lock}.break`,
      JSON.stringify({ token: 'b', pid: process.pid, host: 'mac-1', at: '' })
    );
    const deadAlive = (pid: number) => pid !== 999_999;
    expect(
      acquireLease({
        home: dir,
        host: 'mac-1',
        trigger: 'x',
        alive: deadAlive,
        lockWaitMs: 50,
      }).acquired
    ).toBe(false);
    expect(JSON.parse(await readFile(lock, 'utf8')).token).toBe('dead');
    // A breaker that died is cleared, then the dead lock is broken.
    await writeFile(
      `${lock}.break`,
      JSON.stringify({ token: 'b2', pid: 999_999, host: 'mac-1', at: '' })
    );
    expect(
      acquireLease({
        home: dir,
        host: 'mac-1',
        trigger: 'x',
        alive: deadAlive,
        lockWaitMs: 500,
      }).acquired
    ).toBe(true);
  });

  it('runs exactly one reclaim when two orchestrators trigger together', async () => {
    const dir = await home();
    let plans = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const common = {
      home: dir,
      host: 'mac-1',
      thresholds: hysteresisThresholds({}),
      holds: () => [],
      liveness: {
        cwds: () => [],
        openFiles: () => 'none' as const,
      },
      plan: () => {
        plans += 1;
        return [];
      },
    };
    const slow = runReclaim({
      ...common,
      orchestrator: 'tuturuuu',
      trigger: 'admission',
      probe: async () => {
        await gate;
        return low;
      },
    });
    const second = await runReclaim({
      ...common,
      orchestrator: 'mastermind',
      trigger: 'heartbeat',
      probe: async () => low,
    });
    expect(second.status).toBe('contended');
    expect(second.holder?.orchestrator).toBe('tuturuuu');
    release();
    expect((await slow).status).toBe('insufficient');
    expect(plans).toBe(1);
    await expect(readFile(leaseFile(dir, 'mac-1'), 'utf8')).rejects.toThrow();
  });
});
