import { existsSync, lstatSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { autoReclaim, autoReclaimEnabled } from './storage-auto-reclaim';
import { GiB, type VolumeProbe } from './storage-headroom';
import type { Hold } from './storage-holds';
import { hysteresisThresholds } from './storage-hysteresis';
import { acquireLease } from './storage-lease';
import type { Liveness } from './storage-liveness';
import {
  type ReceiptFs,
  readReceipts,
  realReceiptFs,
} from './storage-receipts';
import { type ReclaimDeps, runReclaim } from './storage-reclaim';
import type { ReclaimCandidate } from './storage-reclaim-plan';
import { reclaimSentinel } from './storage-reclaim-switch';

// The SDK test env sets the kill switch; these engine tests lift it and use
// only temp fixtures and injected liveness.
beforeEach(() => {
  vi.stubEnv('TTR_STORAGE_AUTO_RECLAIM', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const thresholds = hysteresisThresholds({});
// Fixtures live under the temp dir, so its device is the "low volume".
const DEVICE = lstatSync(tmpdir()).dev;
const volume = (freeGiB: number): VolumeProbe => ({
  path: '/',
  device: DEVICE,
  totalBytes: 500 * GiB,
  freeBytes: freeGiB * GiB,
  usedBytes: (500 - freeGiB) * GiB,
  freePercent: (freeGiB / 500) * 100,
  inodesTotal: null,
  inodesFree: null,
  inodeFreePercent: null,
});

/** Probes return the queued readings in order, then repeat the last. */
const probes = (...readings: number[]) => {
  let index = 0;
  return async () =>
    volume(readings[Math.min(index++, readings.length - 1)] ?? 0);
};

const idle: Pick<Liveness, 'cwds' | 'openFiles'> = {
  cwds: () => [{ pid: process.pid, cwd: '/' }],
  openFiles: () => 'none',
};

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ttr-reclaim-')));
  const home = join(root, 'home');
  const cache = join(root, 'DerivedData');
  await mkdir(cache, { recursive: true });
  const item = async (name: string, bytes = 30 * GiB) => {
    const path = join(cache, name);
    await mkdir(path, { mode: 0o755 });
    await writeFile(join(path, 'data'), 'x');
    const candidate: ReclaimCandidate = {
      rule: 'xcode-derived-data-idle',
      path,
      root: cache,
      bytes,
      owner: 'machine user (Xcode build cache)',
      scopePaths: [path],
      recheck: () => null,
    };
    return candidate;
  };
  const deps = (overrides: Partial<ReclaimDeps>): ReclaimDeps => ({
    home,
    host: 'host-a',
    orchestrator: 'tuturuuu-orchestrator',
    trigger: 'admission',
    probe: probes(10),
    thresholds,
    plan: () => [],
    holds: () => [],
    liveness: idle,
    ...overrides,
  });
  return { root, home, cache, item, deps };
}

describe('automatic reclaim engine', () => {
  it('removes verified trees until the recover thresholds and writes fenced receipts', async () => {
    const { home, item, deps } = await fixture();
    const first = await item('AppA');
    const second = await item('AppB');
    // 10 GiB free; the first removal reaches 60 GiB (12%), past recover.
    const result = await runReclaim(
      deps({ plan: () => [first, second], probe: probes(10, 10, 60) })
    );
    expect(result.status).toBe('recovered');
    expect(existsSync(first.path)).toBe(false);
    expect(existsSync(second.path)).toBe(true);
    const receipts = readReceipts(home, 'host-a');
    expect(receipts.map((line) => line.phase)).toEqual(['intent', 'outcome']);
    expect(result.fence).toBeGreaterThan(0);
    expect(receipts[1]).toMatchObject({
      path: first.path,
      rule: 'xcode-derived-data-idle',
      bytes: 30 * GiB,
      freedBytes: 30 * GiB,
      status: 'done',
      host: 'host-a',
      orchestrator: 'tuturuuu-orchestrator',
      trigger: 'admission',
      fence: result.fence,
      checks: [
        'identity',
        'same-volume',
        'holds',
        'rule-recheck',
        'cwd-scan',
        'open-files',
        'full-visibility',
        'lease-fence',
        'kill-switch',
      ],
      evidence: 'full-visibility',
    });
    expect(Date.parse(receipts[1]!.at)).not.toBeNaN();
    // The lease is released afterwards.
    expect(
      acquireLease({ home, host: 'host-a', trigger: 'test' }).acquired
    ).toBe(true);
  });

  it('re-measures under the lease: space recovered since the check means no removal', async () => {
    const { item, deps } = await fixture();
    const candidate = await item('AppA');
    const removeTree = vi.fn();
    const result = await runReclaim(
      deps({ plan: () => [candidate], probe: probes(200), removeTree })
    );
    expect(result.status).toBe('not-needed');
    expect(removeTree).not.toHaveBeenCalled();
  });

  it('keeps acting on fresh readings when free space drops between check and act', async () => {
    const { item, deps } = await fixture();
    const candidates = [await item('AppA', GiB), await item('AppB', GiB)];
    // Trigger saw 14 GiB; another writer pushes it to 8, then 3.
    const result = await runReclaim(
      deps({ plan: () => candidates, probe: probes(14, 8, 3, 3) })
    );
    expect(result.before?.freeBytes).toBe(14 * GiB);
    expect(result.after?.freeBytes).toBe(3 * GiB);
    expect(result.items.map((entry) => entry.status)).toEqual(['done', 'done']);
    expect(result.status).toBe('insufficient');
  });

  it('excludes a cache with open files or a process working inside it', async () => {
    const { home, item, deps } = await fixture();
    const open = await item('Open');
    const cwd = await item('Cwd');
    const removeTree = vi.fn();
    const result = await runReclaim(
      deps({
        plan: () => [open, cwd],
        removeTree,
        liveness: {
          cwds: () => [
            { pid: process.pid, cwd: '/' },
            { pid: 4242, cwd: join(cwd.path, 'sub') },
          ],
          openFiles: (path) => (path === open.path ? 'open' : 'none'),
        },
      })
    );
    expect(result.items.map((entry) => [entry.status, entry.reason])).toEqual([
      ['skipped', `a process has files open under ${open.path}`],
      ['skipped', `a process is working inside ${cwd.path}`],
    ]);
    expect(removeTree).not.toHaveBeenCalled();
    expect(readReceipts(home, 'host-a')).toEqual([]);
  });

  it('fails closed when visibility, liveness, holds or identity checks fail', async () => {
    const { root, cache, item, deps } = await fixture();
    const scanFails = await item('ScanFails');
    const lsofFails = await item('LsofFails');
    const held = await item('Held');
    await mkdir(join(root, 'elsewhere'));
    await symlink(join(root, 'elsewhere'), join(cache, 'Linked'));
    const linked: ReclaimCandidate = { ...held, path: join(cache, 'Linked') };
    const holds: Hold[] = [{ path: held.path, owner: 'upskii', glob: false }];
    const removeTree = vi.fn();
    const blind = await runReclaim(
      deps({
        plan: () => [scanFails],
        removeTree,
        liveness: {
          ...idle,
          cwds: () => {
            throw new Error('process visibility incomplete: uid 0');
          },
        },
      })
    );
    expect(blind.items[0]?.reason).toMatch(
      /cwd scan failed: process visibility/u
    );
    const result = await runReclaim(
      deps({
        plan: () => [lsofFails, held, linked],
        holds: () => holds,
        removeTree,
        liveness: { ...idle, openFiles: () => 'error' },
      })
    );
    expect(result.items.map((entry) => entry.reason)).toEqual([
      `open-file scan failed for ${lsofFails.path}`,
      'held by upskii',
      expect.stringMatching(/identity check failed: .* not a real directory/u),
    ]);
    const unreadable = await runReclaim(
      deps({
        plan: () => [held],
        removeTree,
        holds: () => {
          throw new Error('Invalid hold in upskii.txt:3');
        },
      })
    );
    expect(unreadable.items[0]?.reason).toMatch(/holds unreadable/u);
    expect(removeTree).not.toHaveBeenCalled();
  });

  it('removes nothing when the pre-receipt append or its fsync fails', async () => {
    const failures: Record<string, (receipt: Set<number>) => ReceiptFs> = {
      append: () => ({
        ...realReceiptFs,
        write: () => {
          throw new Error('write EIO');
        },
      }),
      fsync: (receipt) => ({
        ...realReceiptFs,
        open: (path, flags, mode) => {
          const fd = realReceiptFs.open(path, flags, mode);
          if (flags === 'a') receipt.add(fd);
          return fd;
        },
        // Directory syncs succeed; the receipt file's own fsync fails.
        fsync: (fd) => {
          if (receipt.has(fd)) throw new Error('fsync EIO');
          realReceiptFs.fsync(fd);
        },
        close: (fd) => {
          receipt.delete(fd);
          realReceiptFs.close(fd);
        },
      }),
    };
    for (const [name, receiptFs] of Object.entries(failures)) {
      const { item, deps } = await fixture();
      const candidate = await item('AppA');
      const removeTree = vi.fn();
      const result = await runReclaim(
        deps({
          plan: () => [candidate],
          removeTree,
          receiptFs: receiptFs(new Set()),
        })
      );
      expect(result.items[0]?.reason, name).toMatch(
        /durable receipt not written/u
      );
      expect(removeTree, name).not.toHaveBeenCalled();
      expect(existsSync(candidate.path)).toBe(true);
      expect(result.freedBytes).toBe(0);
    }
  });

  it('is off by default and needs an explicit opt-in for the triggers', async () => {
    const sandbox = await realpath(await mkdtemp(join(tmpdir(), 'ttr-optin-')));
    vi.stubEnv('HOME', sandbox);
    expect(autoReclaimEnabled({})).toBe(false);
    const home = join(sandbox, 'storage');
    await mkdir(home, { recursive: true });
    const env = { TTR_STORAGE_HOME: home };
    expect(autoReclaimEnabled(env)).toBe(false);
    expect(
      autoReclaimEnabled({ ...env, TTR_STORAGE_AUTO_RECLAIM: 'yes' })
    ).toBe(true);
    await writeFile(reclaimSentinel(home), 'on\n');
    expect(autoReclaimEnabled(env)).toBe(true);
    // The admission trigger without opt-in reports and does nothing.
    await writeFile(reclaimSentinel(home), '');
    const outcome = await autoReclaim({
      trigger: 'admission',
      volumePath: sandbox,
      thresholds,
      env,
    });
    expect(outcome.result).toBeNull();
    expect(outcome.note).toMatch(/kill switch|off by default/u);
  });

  it('honours every kill switch: env false values and the sentinel, before the lease, per item and inside the guard', async () => {
    const { home, item, deps } = await fixture();
    const candidate = await item('AppA');
    const plan = vi.fn(() => [candidate]);
    const removeTree = vi.fn();
    for (const value of ['0', 'false', 'OFF', 'no'])
      expect(
        (
          await runReclaim(
            deps({ plan, removeTree, env: { TTR_STORAGE_AUTO_RECLAIM: value } })
          )
        ).status
      ).toBe('disabled');
    // The process env wins over a passed env that enables it.
    vi.stubEnv('TTR_STORAGE_AUTO_RECLAIM', 'off');
    expect(
      (
        await runReclaim(
          deps({ plan, removeTree, env: { TTR_STORAGE_AUTO_RECLAIM: '1' } })
        )
      ).status
    ).toBe('disabled');
    vi.stubEnv('TTR_STORAGE_AUTO_RECLAIM', '');
    // The sentinel: a false value, unknown content or an unreadable file.
    await mkdir(home, { recursive: true });
    for (const content of ['no\n', 'maybe']) {
      await writeFile(reclaimSentinel(home), content);
      expect((await runReclaim(deps({ plan, removeTree }))).status).toBe(
        'disabled'
      );
    }
    // Written while the run is already going: checked inside the guard.
    await writeFile(reclaimSentinel(home), '1');
    const sandbox = await realpath(await mkdtemp(join(tmpdir(), 'ttr-ks-')));
    vi.stubEnv('HOME', sandbox);
    const late = await runReclaim(
      deps({
        plan,
        removeTree,
        holds: () => {
          void writeFileSync(reclaimSentinel(home), 'off');
          return [];
        },
      })
    );
    expect(late.items[0]).toMatchObject({
      status: 'failed',
      reason: 'automatic reclaim kill switch is on',
    });
    // A human's forced run still stops at the kill switch.
    await writeFile(reclaimSentinel(home), '0');
    expect(
      await autoReclaim({
        trigger: 'manual',
        volumePath: sandbox,
        thresholds,
        env: { TTR_STORAGE_HOME: home },
        force: true,
      })
    ).toEqual({
      result: null,
      note: 'the automatic reclaim kill switch is on',
    });
    expect(plan).toHaveBeenCalledTimes(1);
    expect(removeTree).not.toHaveBeenCalled();
    expect(existsSync(candidate.path)).toBe(true);
  });

  it('acts only on the low volume and never on an unusable reading', async () => {
    const { item, deps } = await fixture();
    const here = await item('Here');
    const elsewhere = await item('Elsewhere');
    const removeTree = vi.fn();
    const result = await runReclaim(
      deps({
        plan: () => [elsewhere, here],
        removeTree,
        deviceOf: (path) => (path === elsewhere.path ? DEVICE + 1 : DEVICE),
        probe: probes(10, 10, 60),
      })
    );
    expect(result.items.map((entry) => entry.path)).toEqual([here.path]);
    expect(removeTree).toHaveBeenCalledTimes(1);
    for (const bad of [
      { ...volume(10), device: null },
      { ...volume(10), totalBytes: 0 },
      { ...volume(10), freeBytes: Number.NaN },
    ]) {
      const skipped = await runReclaim(
        deps({ plan: () => [here], removeTree, probe: async () => bad })
      );
      expect(skipped).toMatchObject({
        status: 'error',
        reason: expect.stringMatching(/unusable volume reading/u),
      });
    }
    expect(removeTree).toHaveBeenCalledTimes(1);
  });

  it('records private-tree evidence when foreign processes are hidden', async () => {
    const { home, item, deps } = await fixture();
    const candidate = await item('AppA');
    const privacy = vi.fn(() => ({
      ok: true as const,
      anchor: candidate.root,
      evidence: 'private-tree' as const,
    }));
    const openFiles = vi.fn(() => 'none' as const);
    const result = await runReclaim(
      deps({
        plan: () => [candidate],
        probe: probes(10, 10, 60),
        liveness: {
          cwds: () => {
            throw new Error('strict scan would fail');
          },
          scan: () => ({ cwds: [], hidden: [{ pid: 1, uid: 0 }] }),
          privacy,
          openFiles,
        },
      })
    );
    expect(result.status).toBe('recovered');
    expect(privacy).toHaveBeenCalledWith(candidate.path, candidate.root);
    expect(openFiles).toHaveBeenCalledWith(candidate.path, { userOnly: true });
    const outcome = readReceipts(home, 'host-a').find(
      (line) => line.phase === 'outcome'
    );
    expect(outcome).toMatchObject({ evidence: 'private-tree', status: 'done' });
    expect(outcome?.checks).toContain('private-tree');
  });
});
