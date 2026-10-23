import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type DiskGate, diskGate, probeDisk } from './resources-disk-gate';
import { queuedResourceCommand, resourceQueueStatus } from './resources-queue';

const GiB = 1024 ** 3;
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});
const volume =
  (freeGiB: number, totalGiB = 460) =>
  async () => ({
    freeBytes: freeGiB * GiB,
    totalBytes: totalGiB * GiB,
  });

describe('disk gate (REV-6480-2)', () => {
  it('reads the real volume', async () => {
    const probe = await probeDisk(tmpdir());
    expect(probe.totalBytes).toBeGreaterThan(0);
    expect(probe.freeBytes).toBeGreaterThanOrEqual(0);
  });

  it('fails closed when free disk is unknown', async () => {
    const gate = await diskGate('/work', {}, async () => {
      throw new Error('statfs ENOSYS');
    });
    expect(gate).toMatchObject({ admit: false, unknown: true });
    if (!gate.admit) expect(gate.reason).toContain('unknown');
  });

  it('refuses below the byte or percent floor and admits above both', async () => {
    expect(await diskGate('/work', {}, volume(14))).toMatchObject({
      admit: false,
      unknown: false,
    });
    // 20 GiB of 1 TiB is above 15 GiB but below 5%.
    expect(await diskGate('/work', {}, volume(20, 1024))).toMatchObject({
      admit: false,
    });
    expect(await diskGate('/work', {}, volume(21, 300))).toMatchObject({
      admit: true,
    });
    // The measured M4 (20 GiB of 460 GiB, 4.3%) is below the 5% floor.
    expect(await diskGate('/work', {}, volume(20, 460))).toMatchObject({
      admit: false,
    });
    expect(
      await diskGate('/work', { TTR_STORAGE_MIN_FREE: '25g' }, volume(21, 300))
    ).toMatchObject({ admit: false });
    expect(
      await diskGate('/work', { TTR_STORAGE_MIN_FREE: 'lots' }, volume(400))
    ).toMatchObject({ admit: false, unknown: true });
  });

  it('never leaks the working path or raw filesystem errors (REV-6503-2)', async () => {
    const path = '/Users/someone/secret-project/worktree';
    const failed = await diskGate(path, {}, async () => {
      throw new Error(`EACCES: permission denied, statfs '${path}'`);
    });
    const low = await diskGate(path, {}, volume(1));
    for (const gate of [failed, low]) {
      expect(gate.admit).toBe(false);
      if (gate.admit) continue;
      expect(gate.reason).not.toContain('secret-project');
      expect(gate.reason).not.toContain('/Users');
      expect(gate.reason).not.toMatch(/EACCES|statfs|permission denied/u);
      expect(gate.reason).toContain('job volume');
    }
  });

  it('honours the explicit one-command override', async () => {
    const probe = vi.fn(volume(1));
    expect(
      await diskGate('/work', { TTR_RESOURCES_IGNORE_DISK: '1' }, probe)
    ).toMatchObject({ admit: true });
    expect(probe).not.toHaveBeenCalled();
  });
});

describe('dequeue-time disk re-check (REV-6480-1)', { timeout: 40_000 }, () => {
  it('holds a queued job until disk is known and sufficient, then starts it', async () => {
    const home = await realpath(
      await mkdtemp(join(tmpdir(), 'ttr-resources-disk-'))
    );
    dirs.push(home);
    const marker = join(home, 'started');
    let state: 'unknown' | 'low' | 'ok' = 'unknown';
    const calls: string[] = [];
    const check = vi.fn(async (): Promise<DiskGate> => {
      calls.push(state);
      if (state === 'ok') return { admit: true, freeGiB: 100 };
      return {
        admit: false,
        unknown: state === 'unknown',
        reason: state,
      };
    });
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      const job = queuedResourceCommand(
        home,
        process.execPath,
        [
          '-e',
          `require('node:fs').writeFileSync(${JSON.stringify(marker)},'')`,
        ],
        { ...process.env, TTR_RESOURCES_IGNORE_DISK: undefined },
        true,
        1,
        undefined,
        undefined,
        check
      );
      while (!calls.length) await sleep(20);
      const started = () =>
        readFile(marker).then(
          () => true,
          () => false
        );
      // Unknown disk at dequeue: the job is not started and stays queued.
      expect(await started()).toBe(false);
      expect((await resourceQueueStatus(home)).waiting).toHaveLength(1);
      state = 'low';
      while (calls.length < 2) await sleep(20);
      expect(await started()).toBe(false);
      state = 'ok';
      expect(await job).toBe(0);
      expect(await started()).toBe(true);
      expect(calls).toEqual(['unknown', 'low', 'ok']);
      // The check ran inside admission for the job's working directory.
      expect(check.mock.calls[0]?.[0]).toBe(process.cwd());
    } finally {
      stderr.mockRestore();
    }
  });
});
