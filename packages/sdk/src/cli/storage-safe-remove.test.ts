import { existsSync, lstatSync, writeFileSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  realpath,
  rename,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyLocalDocker } from './storage-docker-local';
import {
  captureIdentity,
  type FsOps,
  realFsOps,
  removeVerifiedTree,
} from './storage-safe-remove';
import { newestMtime } from './storage-targets';

async function tree() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ttr-safe-')));
  const cache = join(root, 'cache');
  const target = join(cache, 'Project');
  await mkdir(join(target, 'nested', 'deeper'), {
    recursive: true,
    mode: 0o755,
  });
  await writeFile(join(target, 'nested', 'deeper', 'blob'), 'x');
  const outside = join(root, 'outside');
  await mkdir(outside, { mode: 0o755 });
  await writeFile(join(outside, 'sentinel'), 'keep');
  return { root, cache, target, outside };
}

describe('identity-anchored removal', () => {
  it('removes exactly the verified tree', async () => {
    const { cache, target, outside } = await tree();
    const removed = removeVerifiedTree(captureIdentity(cache, target));
    expect(removed).toBe(4);
    expect(existsSync(target)).toBe(false);
    expect(existsSync(join(outside, 'sentinel'))).toBe(true);
  });

  it('refuses when an ancestor is swapped after verification', async () => {
    const { root, cache, target, outside } = await tree();
    const identity = captureIdentity(cache, target);
    // The real cache moves away and a symlink to `outside` takes its place,
    // with a look-alike Project inside.
    await rename(cache, join(root, 'cache-moved'));
    await mkdir(join(outside, 'Project'));
    await writeFile(join(outside, 'Project', 'victim'), 'keep');
    await symlink(outside, cache);
    expect(() => removeVerifiedTree(identity)).toThrow(/identity changed/u);
    expect(existsSync(join(outside, 'Project', 'victim'))).toBe(true);
    expect(existsSync(join(root, 'cache-moved', 'Project'))).toBe(true);
  });

  it('refuses a symlinked target or ancestor at capture time', async () => {
    const { root, cache, outside } = await tree();
    await symlink(outside, join(cache, 'Linked'));
    expect(() => captureIdentity(cache, join(cache, 'Linked'))).toThrow(
      /not a real directory/u
    );
    expect(() => captureIdentity(root, root)).toThrow(/strictly inside/u);
  });

  it('unlinks a symlink inside the tree without following it', async () => {
    const { cache, target, outside } = await tree();
    await symlink(outside, join(target, 'mounted-elsewhere'));
    removeVerifiedTree(captureIdentity(cache, target));
    expect(existsSync(join(outside, 'sentinel'))).toBe(true);
  });

  it('refuses the whole removal when a nested directory is another mount', async () => {
    const { cache, target } = await tree();
    const nested = join(target, 'nested');
    const mounted: FsOps = {
      ...realFsOps,
      lstat: (path) => {
        const info = lstatSync(path);
        return path === nested
          ? {
              dev: info.dev + 1,
              ino: info.ino,
              uid: info.uid,
              mode: info.mode,
              isDirectory: () => true,
              isSymbolicLink: () => false,
            }
          : info;
      },
    };
    const unlinked: string[] = [];
    expect(() =>
      removeVerifiedTree(captureIdentity(cache, target), {
        ...mounted,
        unlink: (path) => unlinked.push(path),
      })
    ).toThrow(/mount boundary/u);
    expect(unlinked).toEqual([]);
    expect(existsSync(join(nested, 'deeper', 'blob'))).toBe(true);
  });

  it('refuses trees with foreign-owned entries or writable directories, even as root', async () => {
    const { cache, target } = await tree();
    const euid = process.geteuid?.() ?? 0;
    const blob = join(target, 'nested', 'deeper', 'blob');
    const unlinked: string[] = [];
    const spy = (lstat: FsOps['lstat']): FsOps => ({
      ...realFsOps,
      lstat,
      unlink: (path) => unlinked.push(path),
      rmdir: (path) => unlinked.push(path),
    });
    const foreign = spy((path) => {
      const info = lstatSync(path);
      return path === blob ? Object.assign(info, { uid: euid + 1 }) : info;
    });
    expect(() =>
      removeVerifiedTree(captureIdentity(cache, target), foreign)
    ).toThrow(/owned by uid .* not the effective uid/u);
    const writable = spy((path) => {
      const info = lstatSync(path);
      return path === join(target, 'nested')
        ? Object.assign(info, { mode: info.mode | 0o002 })
        : info;
    });
    expect(() =>
      removeVerifiedTree(captureIdentity(cache, target), writable)
    ).toThrow(/group- or world-writable/u);
    // Root removes only trees whose every entry is root-owned.
    expect(() =>
      removeVerifiedTree(
        captureIdentity(cache, target),
        spy(realFsOps.lstat),
        0
      )
    ).toThrow(/not the effective uid 0/u);
    expect(unlinked).toEqual([]);
    expect(existsSync(blob)).toBe(true);
  });

  it('re-checks ownership at the destructive boundary', async () => {
    const { cache, target } = await tree();
    const euid = process.geteuid?.() ?? 0;
    const blob = join(target, 'nested', 'deeper', 'blob');
    let blobChecks = 0;
    const unlinked: string[] = [];
    const flipping: FsOps = {
      ...realFsOps,
      // The pre-scan sees the file as ours; by the re-check right before its
      // unlink it belongs to someone else.
      lstat: (path) => {
        const info = lstatSync(path);
        return path === blob && blobChecks++ > 0
          ? Object.assign(info, { uid: euid + 1 })
          : info;
      },
      unlink: (path) => unlinked.push(path),
    };
    expect(() =>
      removeVerifiedTree(captureIdentity(cache, target), flipping)
    ).toThrow(/identity changed/u);
    expect(unlinked).toEqual([]);
  });

  it('never deletes entries created after the pre-scan', async () => {
    const { cache, target } = await tree();
    let injected = false;
    const racing: FsOps = {
      ...realFsOps,
      unlink: (path) => {
        if (!injected) {
          injected = true;
          realFsOps.unlink(path);
          // A writer adds a file after the scan.
          writeFileSync(join(target, 'late'), 'new');
          return;
        }
        realFsOps.unlink(path);
      },
    };
    expect(() =>
      removeVerifiedTree(captureIdentity(cache, target), racing)
    ).toThrow();
    expect(existsSync(join(target, 'late'))).toBe(true);
  });
});

describe('idle detection walks the whole tree', () => {
  it('a deeply nested recent file keeps the tree fresh', async () => {
    const { target } = await tree();
    const deep = join(target, 'a', 'b', 'c', 'd', 'e', 'f');
    await mkdir(deep, { recursive: true });
    await writeFile(join(deep, 'recent'), 'x');
    const old = new Date(Date.now() - 60 * 86_400_000);
    // Every shallow level looks idle.
    for (const path of [
      target,
      join(target, 'a'),
      join(target, 'a', 'b'),
      join(target, 'nested'),
      join(target, 'nested', 'deeper'),
      join(target, 'nested', 'deeper', 'blob'),
    ])
      await utimes(path, old, old);
    expect(newestMtime(target)).toBeGreaterThan(Date.now() - 86_400_000);
    // An oversized tree is never treated as idle.
    expect(newestMtime(target, { maxEntries: 3 })).toBe(
      Number.POSITIVE_INFINITY
    );
  });
});

describe('local Docker daemon verification', () => {
  const exec =
    (host: string, status = 0) =>
    () => ({ status, stdout: JSON.stringify(host), stderr: '' });
  const socket = () => true;

  it('accepts only an existing local unix socket and pins commands to it', () => {
    const local = verifyLocalDocker(
      exec('unix:///Users/me/.docker/run/docker.sock'),
      {},
      socket
    );
    expect(local.ok && local.argv(['volume', 'rm', 'v'])).toEqual([
      'docker',
      '-H',
      'unix:///Users/me/.docker/run/docker.sock',
      'volume',
      'rm',
      'v',
    ]);
  });

  it('rejects DOCKER_HOST, remote contexts, missing sockets and failures', () => {
    expect(
      verifyLocalDocker(
        exec('unix:///var/run/docker.sock'),
        {
          DOCKER_HOST: 'ssh://builder@remote',
        },
        socket
      )
    ).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/DOCKER_HOST is set/u),
    });
    for (const host of ['ssh://builder@remote', 'tcp://10.0.0.5:2376', ''])
      expect(verifyLocalDocker(exec(host), {}, socket).ok).toBe(false);
    expect(
      verifyLocalDocker(exec('unix:///nope.sock'), {}, () => false).ok
    ).toBe(false);
    expect(verifyLocalDocker(exec('', 1), {}, socket).ok).toBe(false);
  });
});
