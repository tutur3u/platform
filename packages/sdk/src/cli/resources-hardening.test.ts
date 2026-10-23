import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { psFails } = vi.hoisted(() => ({ psFails: { value: false } }));
vi.mock('node:child_process', async (original) => {
  const actual = await original<typeof import('node:child_process')>();
  return {
    ...actual,
    execFileSync: ((command: string, ...rest: unknown[]) => {
      if (command === 'ps' && psFails.value) throw new Error('ps unavailable');
      return (actual.execFileSync as (...args: unknown[]) => unknown)(
        command,
        ...rest
      );
    }) as typeof actual.execFileSync,
  };
});
vi.mock('node:os', async (original) => ({
  ...(await original<typeof import('node:os')>()),
  // A small host: floor(8 GiB / 4) = 2 lanes, 4 CPUs - 2 = 2 lanes.
  totalmem: () => 8 * 1024 ** 3,
  availableParallelism: () => 4,
}));

import { atomicJson } from './resources-config';
import { nestedOwner, newOwner } from './resources-slots';

const dirs: string[] = [];
afterEach(async () => {
  psFails.value = false;
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe('nested markers need process-tree evidence (REV-6431-1)', () => {
  const ownerHome = async () => {
    const home = await realpath(
      await mkdtemp(join(tmpdir(), 'ttr-resources-hardening-'))
    );
    dirs.push(home);
    // The parent process is a live ancestor, so ancestry can vouch for it.
    const owner = { ...newOwner('outer'), pid: process.ppid };
    await atomicJson(join(home, 'slots', '0', 'owner.json'), owner);
    return { home, owner };
  };

  it('accepts a live marker only while ps confirms the process tree', async () => {
    const { home, owner } = await ownerHome();
    const env = { TTR_RESOURCES_ADMITTED: owner.token };
    expect((await nestedOwner(home, env, true))?.token).toBe(owner.token);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      psFails.value = true;
      expect(await nestedOwner(home, env, true)).toBeUndefined();
      expect(String(stderr.mock.calls.at(-1)?.[0])).toContain(
        'process tree could not be read'
      );
    } finally {
      stderr.mockRestore();
    }
  });

  it('queues a forged marker when ps fails', async () => {
    const { home } = await ownerHome();
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      psFails.value = true;
      expect(
        await nestedOwner(home, { TTR_RESOURCES_ADMITTED: 'forged' }, true)
      ).toBeUndefined();
      expect(
        await nestedOwner(home, { TTR_RESOURCE_OWNER: 'forged-legacy' }, true)
      ).toBeUndefined();
      expect(String(stderr.mock.calls.at(-1)?.[0])).toContain(
        'does not belong to a live admitted job'
      );
    } finally {
      stderr.mockRestore();
    }
  });
});
