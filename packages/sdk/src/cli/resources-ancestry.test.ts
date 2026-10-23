import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Simulate a host without a trusted ps (and optionally without /proc).
const host = vi.hoisted(() => ({ noPs: false, noProc: false }));
vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: ((path: string) =>
      host.noPs && /^\/(usr\/)?bin\/ps$/u.test(String(path))
        ? false
        : actual.existsSync(path)) as typeof actual.existsSync,
    readFileSync: ((path: string, ...rest: unknown[]) => {
      if (host.noProc && String(path).startsWith('/proc/'))
        throw new Error('ENOENT');
      return (actual.readFileSync as (...args: unknown[]) => unknown)(
        path,
        ...rest
      );
    }) as typeof actual.readFileSync,
  };
});

import { atomicJson, defaultResourceConfig } from './resources-config';
import { ancestryWait, queuedResourceCommand } from './resources-queue';
import { newOwner, processLineage, procLineage } from './resources-slots';

const dirs: string[] = [];
afterEach(async () => {
  host.noPs = false;
  host.noProc = false;
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe('ancestry without a trusted ps (REV-6492-7)', () => {
  it.runIf(process.platform === 'linux')(
    'reads the same lineage from /proc as from ps',
    () => {
      const viaPs = processLineage(true);
      const viaProc = procLineage();
      expect(viaPs?.pids.has(process.ppid)).toBe(true);
      expect(viaProc && [...viaProc.pids].sort()).toEqual(
        viaPs && [...viaPs.pids].sort()
      );
      expect(viaProc?.group).toBe(viaPs?.group);
    }
  );

  it('falls back to /proc on Linux when neither ps path exists', () => {
    host.noPs = true;
    const lineage = processLineage(true);
    if (process.platform === 'linux')
      expect(lineage?.pids.has(process.ppid)).toBe(true);
    else expect(lineage).toBeUndefined();
  });

  it('fails with an actionable error instead of waiting forever behind its own ancestor', {
    timeout: 20_000,
  }, async () => {
    host.noPs = true;
    host.noProc = true;
    const home = await realpath(
      await mkdtemp(join(tmpdir(), 'ttr-resources-ancestry-'))
    );
    dirs.push(home);
    await atomicJson(join(home, 'config.json'), {
      ...defaultResourceConfig(),
      roots: [home],
    });
    // The only lane is held by a live owner whose marker this waiter
    // carries, so it is almost certainly nested inside that job.
    const owner = { ...newOwner('outer'), pid: process.pid };
    await atomicJson(join(home, 'slots', '0', 'owner.json'), owner);
    const previous = {
      wait: ancestryWait.ms,
      marker: process.env.TTR_RESOURCES_ADMITTED,
    };
    ancestryWait.ms = 1_500;
    process.env.TTR_RESOURCES_ADMITTED = owner.token;
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      const started = Date.now();
      await expect(
        queuedResourceCommand(
          home,
          process.execPath,
          ['-e', ''],
          { ...process.env, TTR_RESOURCES_IGNORE_DISK: '1' },
          true,
          1
        )
      ).rejects.toThrow(
        /Cannot verify process ancestry.*TTR_RESOURCES_BYPASS=1/su
      );
      expect(Date.now() - started).toBeLessThan(10_000);
    } finally {
      stderr.mockRestore();
      ancestryWait.ms = previous.wait;
      if (previous.marker === undefined)
        delete process.env.TTR_RESOURCES_ADMITTED;
      else process.env.TTR_RESOURCES_ADMITTED = previous.marker;
    }
  });
});
