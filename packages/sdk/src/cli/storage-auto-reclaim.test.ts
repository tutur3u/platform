import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { spawnHeartbeatReclaim, trustedSelfArgv } from './storage-auto-reclaim';
import { GiB, type VolumeProbe } from './storage-headroom';

const volume: VolumeProbe = {
  path: '/data',
  device: 1,
  totalBytes: 500 * GiB,
  freeBytes: 5 * GiB,
  usedBytes: 495 * GiB,
  freePercent: 1,
  inodesTotal: null,
  inodesFree: null,
  inodeFreePercent: null,
};

const waitFor = async (check: () => boolean) => {
  for (let attempt = 0; attempt < 100 && !check(); attempt++)
    await new Promise((resolve) => setTimeout(resolve, 50));
  return check();
};

async function executable(path: string, marker: string) {
  await writeFile(path, `#!/bin/sh\nprintf '%s\\n' "$@" > "${marker}"\n`, {
    mode: 0o755,
  });
  await chmod(path, 0o755);
}

describe('heartbeat reclaim spawn', () => {
  it('re-runs the CLI only through a verified absolute path, never PATH', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'ttr-spawn-')));
    const evil = join(root, 'evil-bin');
    const install = join(root, 'install');
    await mkdir(evil);
    await mkdir(install);
    const sentinel = join(root, 'malicious-ran');
    const trusted = join(root, 'trusted-ran');
    // A hostile `ttr` sits first on PATH; the packaged binary is elsewhere.
    await executable(join(evil, 'ttr'), sentinel);
    await executable(join(install, 'ttr'), trusted);
    const env = { PATH: `${evil}:/usr/bin:/bin` };

    // Packaged single executable: argv[1] is a virtual path.
    const packaged = trustedSelfArgv({
      execPath: join(install, 'ttr'),
      entry: '/$bunfs/root/ttr',
    });
    expect(packaged).toEqual([join(install, 'ttr')]);
    expect(spawnHeartbeatReclaim(volume, env, { argv: packaged })).toBe(true);
    expect(await waitFor(() => existsSync(trusted))).toBe(true);
    expect(existsSync(sentinel)).toBe(false);

    // A runtime that is neither a script entry nor a `ttr` binary: nothing.
    const start = vi.fn();
    const unknown = trustedSelfArgv({
      execPath: '/usr/bin/env',
      entry: '/$bunfs/root/env',
      isFile: () => true,
      resolveReal: (path) => path,
    });
    expect(unknown).toBeNull();
    expect(
      spawnHeartbeatReclaim(volume, env, {
        argv: unknown,
        start: start as never,
      })
    ).toBe(false);
    expect(start).not.toHaveBeenCalled();
    expect(existsSync(sentinel)).toBe(false);
  });

  it('accepts a script entry only as an existing regular file with an absolute runtime', () => {
    const files = new Set(['/opt/node/bin/node', '/opt/ttr/dist/cli.js']);
    const isFile = (path: string) => files.has(path);
    const resolveReal = (path: string) => path;
    expect(
      trustedSelfArgv({
        execPath: '/opt/node/bin/node',
        entry: '/opt/ttr/dist/cli.js',
        isFile,
        resolveReal,
      })
    ).toEqual(['/opt/node/bin/node', '/opt/ttr/dist/cli.js']);
    for (const [execPath, entry] of [
      ['node', '/opt/ttr/dist/cli.js'],
      ['/opt/node/bin/node', 'dist/cli.js'],
      ['/opt/node/bin/node', '/opt/ttr/dist/missing.js'],
      ['/opt/node/bin/missing-node', '/opt/ttr/dist/cli.js'],
    ] as const)
      expect(
        trustedSelfArgv({ execPath, entry, isFile, resolveReal })
      ).toBeNull();
  });
});
