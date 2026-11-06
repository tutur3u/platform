import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseRunRequest } from '@tuturuuu/devbox';
import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { BalancerLedger } from './balancer-ledger';

const fault = vi.hoisted((): { differentDevice: string | undefined } => ({
  differentDevice: undefined,
}));
vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...real,
    lstat: async (...args: Parameters<typeof real.lstat>) => {
      const info = await real.lstat(...args);
      if (String(args[0]) !== fault.differentDevice) return info;
      return new Proxy(info, {
        get(target, key, receiver) {
          if (key === 'dev')
            return typeof target.dev === 'bigint'
              ? target.dev + 1n
              : target.dev + 1;
          return Reflect.get(target, key, receiver);
        },
      });
    },
  };
});
const dirs: string[] = [];
const home = async () => {
  const path = await mkdtemp(join(tmpdir(), 'balancer-reboot-'));
  dirs.push(path);
  return path;
};
afterEach(async () => {
  fault.differentDevice = undefined;
  await Promise.all(
    dirs.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

it('resumes an inode-stable ledger when its recorded device number belongs to a previous boot', async () => {
  const path = await home();
  const ledger = new BalancerLedger(path);
  const request = parseRunRequest({
    requestId: 'proof-device-renumber',
    source: { repo: 'tutur3u/platform', baseSha: 'a'.repeat(40) },
    command: ['true'],
  });
  const initial = await ledger.submit(request);
  const run = initial.runs[0];
  if (!run) throw new Error('Missing queued run');
  const marker = join(ledger.root, '.lock', 'protocol.json');
  const manifest = z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(await readFile(marker, 'utf8')));
  const currentDevice = (await lstat(ledger.root, { bigint: true })).dev;
  const inodes: Record<string, string> = {};
  for (const [name, entry] of Object.entries(manifest)) {
    if (
      entry &&
      typeof entry === 'object' &&
      'ino' in entry &&
      typeof entry.ino === 'string'
    ) {
      inodes[name] = entry.ino;
      manifest[name] = { ...entry, dev: String(currentDevice + 1000n) };
    }
  }
  expect(Object.keys(inodes)).toHaveLength(6);
  const previousBootManifest = JSON.stringify(manifest);
  await writeFile(marker, previousBootManifest);

  const reopened = new BalancerLedger(path);
  expect(await reopened.submit(request)).toEqual({
    created: false,
    runs: initial.runs,
  });
  const updated = await reopened.update(run.runId, run.revision, (current) => ({
    ...current,
    priority: 9,
    revision: current.revision + 1,
  }));
  expect(updated.won).toBe(true);
  expect(await reopened.readRun(run.runId)).toMatchObject({
    state: 'queued',
    priority: 9,
    revision: run.revision + 1,
  });
  // Existing manifests are accepted without rewriting their original record.
  expect(await readFile(marker, 'utf8')).toBe(previousBootManifest);
  for (const [name, relative] of Object.entries({
    root: '',
    fence: '.lock',
    sqliteFence: 'mutation-lock.sqlite',
    runs: 'runs',
    requests: 'requests',
    mutex: '.lock/mutex',
  })) {
    expect(
      String((await lstat(join(ledger.root, relative), { bigint: true })).ino)
    ).toBe(inodes[name]);
  }
});

it.each(['runs', '.lock/mutex'])(
  'refuses %s when its live device differs from the live root',
  async (relative) => {
    const ledger = new BalancerLedger(await home());
    await ledger.withLock(async () => {});
    fault.differentDevice = join(ledger.root, relative);
    let entered = false;
    await expect(
      ledger.withLock(async () => {
        entered = true;
      })
    ).rejects.toThrow(/legacy|incomplete|replaced/iu);
    expect(entered).toBe(false);
  }
);
