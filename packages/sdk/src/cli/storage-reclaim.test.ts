import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { autoReclaim } from './storage-auto-reclaim';
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

// The SDK test env sets the kill switch; these engine tests lift it and use
// only temp fixtures and injected liveness.
beforeEach(() => {
  vi.stubEnv('TTR_STORAGE_AUTO_RECLAIM', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const thresholds = hysteresisThresholds({});
const volume = (freeGiB: number): VolumeProbe => ({
  path: '/',
  device: 1,
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
    await mkdir(path);
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
        'holds',
        'rule-recheck',
        'cwd-scan',
        'open-files',
        'lease-fence',
      ],
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

  it('honours TTR_STORAGE_AUTO_RECLAIM=0 as a hard kill switch', async () => {
    const { item, deps } = await fixture();
    const candidate = await item('AppA');
    const plan = vi.fn(() => [candidate]);
    const removeTree = vi.fn();
    // From an explicit env object...
    expect(
      (
        await runReclaim(
          deps({ plan, removeTree, env: { TTR_STORAGE_AUTO_RECLAIM: '0' } })
        )
      ).status
    ).toBe('disabled');
    // ...and from the process, even when the caller passes an env that
    // enables it and forces the run.
    vi.stubEnv('TTR_STORAGE_AUTO_RECLAIM', '0');
    expect(
      (
        await runReclaim(
          deps({ plan, removeTree, env: { TTR_STORAGE_AUTO_RECLAIM: '1' } })
        )
      ).status
    ).toBe('disabled');
    expect(
      await autoReclaim({
        trigger: 'manual',
        volumePath: '/',
        thresholds,
        env: { TTR_STORAGE_AUTO_RECLAIM: '1' },
        force: true,
      })
    ).toEqual({ result: null, note: 'disabled by TTR_STORAGE_AUTO_RECLAIM=0' });
    expect(plan).not.toHaveBeenCalled();
    expect(removeTree).not.toHaveBeenCalled();
    expect(existsSync(candidate.path)).toBe(true);
  });
});
