import { existsSync, renameSync, symlinkSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { StorageReport } from './storage-analyze';
import { defaultStorageThresholds } from './storage-headroom';
import { measureTreesFallback } from './storage-measure';
import { type Exec, pruneStorage } from './storage-prune';

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

async function fixture(linkedPart?: string) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ttr-derived-')));
  roots.push(root);
  const home = join(root, 'home');
  await mkdir(home);
  vi.stubEnv('HOME', home);
  if (linkedPart) {
    const link = linkedPart === 'home' ? home : join(home, linkedPart);
    const target = join(root, 'tmp-scratch');
    await mkdir(target);
    if (linkedPart === 'home') await rm(home, { recursive: true });
    else await mkdir(dirname(link), { recursive: true });
    await symlink(target, link);
  }
  const derived = join(home, 'Library/Developer/Xcode/DerivedData');
  const checkout = join(derived, 'idle-checkout');
  await mkdir(join(checkout, '.git'), { recursive: true });
  await writeFile(join(checkout, '.git/HEAD'), 'ref: refs/heads/main\n');
  await writeFile(join(checkout, 'source.txt'), 'irreplaceable source');
  return { home, derived, checkout };
}

function prune(
  path: string,
  exec: Exec = () => ({ status: 0, stdout: '', stderr: '' })
) {
  const report: StorageReport = {
    version: 1,
    generatedAt: new Date().toISOString(),
    platform: 'darwin',
    method: 'allocated-dedup',
    thresholds: defaultStorageThresholds,
    volumes: [],
    worktrees: [],
    nodeModules: [],
    docker: null,
    tmpOlderThanDays: 3,
    warnings: [],
    items: [
      {
        category: 'xcode-derived-data',
        label: 'DerivedData',
        path,
        uniqueBytes: 1024,
        allocatedBytes: 1024,
        files: 2,
        truncated: false,
        risk: 'safe',
      },
    ],
  };
  return pruneStorage({
    report,
    apply: true,
    categories: ['xcode-derived-data'],
    olderThanDays: 7,
    maxRemoveBytes: 1024 ** 3,
    paths: [],
    names: [],
    holds: () => [],
    cwds: () => [],
    openFiles: () => 'none',
    prs: () => null,
    exec,
    measure: measureTreesFallback,
    now: Date.now() + 30 * 86_400_000,
  });
}

it.each([
  'Library/Developer/Xcode/DerivedData',
  'Library/Developer/Xcode',
  'Library/Developer',
  'Library',
  'home',
])('preserves an idle checkout reached through symlinked %s', async (part) => {
  const { derived, checkout } = await fixture(part);
  const result = prune(derived);
  expect(existsSync(join(checkout, '.git/HEAD'))).toBe(true);
  expect(existsSync(join(checkout, 'source.txt'))).toBe(true);
  expect(result.steps.every((step) => step.status !== 'done')).toBe(true);
});

it('still removes idle contents of the real user-owned DerivedData chain', async () => {
  const { derived, checkout } = await fixture();
  expect(prune(derived).steps[0]?.status).toBe('done');
  expect(existsSync(checkout)).toBe(false);
});

it('does not exempt an arbitrary root labelled as DerivedData', async () => {
  const { home, checkout } = await fixture();
  prune(dirname(home));
  expect(existsSync(join(checkout, '.git/HEAD'))).toBe(true);
});

it('rechecks the directory chain after a real root is replaced by a symlink', async () => {
  const { derived, checkout } = await fixture();
  const moved = join(dirname(derived), 'kept-derived');
  let swapped = false;
  const result = prune(derived, () => {
    if (!swapped) {
      swapped = true;
      renameSync(derived, moved);
      symlinkSync(moved, derived);
    }
    return { status: 0, stdout: '', stderr: '' };
  });
  expect(swapped).toBe(true);
  expect(existsSync(join(checkout, '.git/HEAD'))).toBe(true);
  expect(existsSync(join(checkout, 'source.txt'))).toBe(true);
  expect(result.steps.every((step) => step.status !== 'done')).toBe(true);
});
