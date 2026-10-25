import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { diskAdmission } from './resources-disk-admission';

const homes: string[] = [];
afterEach(async () => {
  await Promise.all(
    homes.splice(0).map((home) => rm(home, { recursive: true, force: true }))
  );
});
async function env() {
  const home = await mkdtemp(join(tmpdir(), 'ttr-absolute-floor-'));
  homes.push(home);
  return { TTR_STORAGE_HOME: home, TTR_STORAGE_AUTO_RECLAIM: '0' };
}
const volume = (freeGiB: number) => async () => ({
  path: '/job',
  device: 1,
  totalBytes: 7449 * 1024 ** 3,
  freeBytes: freeGiB * 1024 ** 3,
  usedBytes: (7449 - freeGiB) * 1024 ** 3,
  freePercent: (freeGiB / 7449) * 100,
  inodesTotal: null,
  inodesFree: null,
  inodeFreePercent: null,
});

describe('absolute enqueue admission floor', () => {
  it('admits a large volume with 316 GiB free at only 4.2 percent', async () => {
    const result = await diskAdmission({
      cwd: '/job',
      env: await env(),
      probe: volume(316),
    });
    expect(result.refuse).toBe(false);
  });
  it('refuses below 50 GiB without starting a reclaim or a job', async () => {
    const reclaim = vi.fn(async () => ({ result: null, note: null }));
    const result = await diskAdmission({
      cwd: '/job',
      env: await env(),
      probe: volume(49),
      reclaim,
    });
    expect(result).toMatchObject({
      refuse: true,
      message: expect.stringContaining('50 GiB admission floor'),
    });
    expect(reclaim).not.toHaveBeenCalled();
  });
  it('admits at the threshold and honors an explicit higher floor', async () => {
    expect(
      (
        await diskAdmission({
          cwd: '/job',
          env: await env(),
          probe: volume(50),
        })
      ).refuse
    ).toBe(false);
    expect(
      (
        await diskAdmission({
          cwd: '/job',
          env: { ...(await env()), TTR_RESOURCES_MIN_FREE_GIB: '60' },
          probe: volume(50),
        })
      ).refuse
    ).toBe(true);
  });
  it('fails closed for an unknown probe', async () => {
    expect(
      (
        await diskAdmission({
          cwd: '/job',
          env: await env(),
          probe: async () => {
            throw new Error('unavailable');
          },
        })
      ).refuse
    ).toBe(true);
  });
});
