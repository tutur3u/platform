import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { filesManifest, materializePackage } from './cli-versions-manifest';

vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof import('node:fs/promises')>();
  return { ...fs, open: vi.fn(fs.open), lstat: vi.fn(fs.lstat) };
});

const dirs: string[] = [];
beforeEach(async () => {
  const fs =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises'
    );
  vi.mocked(open).mockReset().mockImplementation(fs.open);
  vi.mocked(lstat).mockClear();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

async function temporary() {
  const root = await mkdtemp(join(tmpdir(), 'cli-fd-'));
  dirs.push(root);
  return root;
}

async function swapOnRead(target: string, root: string) {
  const fs =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises'
    );
  const replacement = join(root, 'replacement');
  await writeFile(replacement, 'unverified replacement');
  let observed = '';
  vi.mocked(open).mockImplementation(async (...args) => {
    const file = await fs.open(...args);
    if (String(args[0]) === target) {
      const read = file.readFile.bind(file);
      vi.spyOn(file, 'readFile').mockImplementationOnce(async () => {
        await rename(replacement, target);
        const bytes = await read();
        observed = bytes.toString('utf8');
        return bytes;
      });
    }
    return file;
  });
  return () => observed;
}

describe('fd-bound release verification', () => {
  it('verifies regular files without a path-based stat before open', async () => {
    const root = await temporary();
    await writeFile(join(root, 'data.js'), 'original');
    expect(await filesManifest(root)).toMatchObject({ files: 1 });
    expect(lstat).not.toHaveBeenCalled();
  });

  it('rejects a pathname swap after fstat while reading the original fd', async () => {
    const root = await temporary();
    const tree = join(root, 'tree');
    await mkdir(tree);
    const target = join(tree, 'data.js');
    await writeFile(target, 'original');
    const observed = await swapOnRead(target, root);
    await expect(filesManifest(tree)).rejects.toThrow(
      /changed during verification/u
    );
    expect(observed()).toBe('original');
  });

  it('rejects a symlink swapped in immediately before open', async () => {
    const root = await temporary();
    const tree = join(root, 'tree');
    await mkdir(tree);
    const target = join(tree, 'data.js');
    const outside = join(root, 'outside');
    await writeFile(target, 'original');
    await writeFile(outside, 'unverified');
    const fs =
      await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises'
      );
    let swapped = false;
    vi.mocked(open).mockImplementation(async (...args) => {
      if (!swapped && String(args[0]) === target) {
        swapped = true;
        await rename(target, join(root, 'original'));
        await symlink(outside, target);
      }
      return fs.open(...args);
    });
    await expect(filesManifest(tree)).rejects.toThrow();
    expect(swapped).toBe(true);
  });

  it('rejects a post-copy swap instead of publishing a stale comparison', async () => {
    const root = await temporary();
    const source = join(root, 'verify', 'package');
    const installed = join(root, 'node_modules', 'tuturuuu');
    await mkdir(source, { recursive: true });
    await mkdir(installed, { recursive: true });
    await writeFile(join(source, 'data.js'), 'original');
    await writeFile(join(installed, 'sentinel'), 'not replaced');
    const expected = await filesManifest(source);
    const observed = await swapOnRead(
      join(root, 'package-snapshot', 'data.js'),
      root
    );
    await expect(materializePackage(root, expected)).rejects.toThrow(
      /changed during verification/u
    );
    expect(observed()).toBe('original');
    expect(await lstat(join(installed, 'sentinel'))).toBeDefined();
  });
});
