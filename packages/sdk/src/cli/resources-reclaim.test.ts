import { spawn } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { runResourcesCommand } from './resources';
import { resourceShims } from './resources-command';
import { atomicJson, defaultResourceConfig } from './resources-config';
import { installResourceShims, setupResources } from './resources-setup';
import {
  errno,
  newOwner,
  occupancy,
  processAlive,
  withAdmission,
} from './resources-slots';

const homes: string[] = [];
const deadPid = 2147483647;

function stopGroup(group: number) {
  try {
    process.kill(-group, 'SIGKILL');
  } catch (error) {
    if (!errno(error, 'ESRCH')) throw error;
  }
}

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const home of homes.splice(0))
    await fs.rm(home, { recursive: true, force: true });
});

async function fixture(pid = deadPid, childPid = deadPid) {
  const home = await fs.mkdtemp(join(tmpdir(), 'ttr-reclaim-'));
  homes.push(home);
  vi.stubEnv('TTR_RESOURCES_HOME', home);
  vi.stubEnv('TTR_RESOURCES_BYPASS', '');
  vi.stubEnv('TTR_RESOURCES_IGNORE_DISK', '1');
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  await atomicJson(join(home, 'config.json'), defaultResourceConfig());
  const slot = join(home, 'slots', '0');
  const path = join(slot, 'owner.json');
  const receipt = `${JSON.stringify({ ...newOwner('node'), pid, childPid, extra: true }, null, 2)}\n`;
  await fs.mkdir(slot, { recursive: true });
  await fs.writeFile(path, receipt);
  return { home, slot, path, receipt };
}

it('previews a dead slot read-only and preserves its exact receipt before applying', async () => {
  const { home, slot, path, receipt } = await fixture();
  const output = vi.mocked(process.stdout.write);
  const backups = join(home, 'backups', 'reclaimed-slots');
  expect(await occupancy(home)).toMatchObject({ occupied: [slot], owners: [] });
  await runResourcesCommand(['reclaim']);
  expect(output.mock.calls.flat().join('')).toContain('Would reclaim');
  expect(await fs.readFile(path, 'utf8')).toBe(receipt);
  expect(await fs.readdir(home)).toEqual(['config.json', 'slots']);
  await runResourcesCommand(['reclaim', '--apply']);
  expect((await occupancy(home)).occupied).toEqual([]);
  const [backup] = await fs.readdir(backups);
  expect(await fs.readFile(join(backups, backup!), 'utf8')).toBe(receipt);
  expect((await fs.stat(join(backups, backup!))).mode & 0o777).toBe(0o600);
});

it('keeps a live owner and creates no backup', async () => {
  const { home, path, receipt } = await fixture(process.pid);
  await runResourcesCommand(['reclaim', '--apply']);
  expect(await fs.readFile(path, 'utf8')).toBe(receipt);
  expect(await fs.readdir(home)).toEqual(['config.json', 'slots']);
});

it('keeps a live child group after both the broker and group leader have exited', async () => {
  const leader = spawn(
    process.execPath,
    [
      '-e',
      "const child = require('node:child_process').spawn('/bin/sleep', ['30'], { stdio: 'ignore' }); child.unref()",
    ],
    { detached: true, stdio: 'ignore' }
  );
  const group = leader.pid;
  if (!group) throw new Error('Failed to start the test process group.');
  try {
    expect(await once(leader, 'exit')).toEqual([0, null]);
    expect(processAlive(group)).toBe(false);
    expect(() => process.kill(-group, 0)).not.toThrow();
    const { path, receipt } = await fixture(deadPid, group);
    await runResourcesCommand(['reclaim', '--apply']);
    expect(await fs.readFile(path, 'utf8')).toBe(receipt);
  } finally {
    stopGroup(group);
  }
});

it('rechecks the receipt after an admission transaction wins the mutex', async () => {
  const { home, path } = await fixture();
  const release = Promise.withResolvers<void>();
  const inside = Promise.withResolvers<void>();
  const newReceipt = newOwner('new admission');
  const admitted = withAdmission(home, async () => {
    inside.resolve();
    await release.promise;
    await atomicJson(path, newReceipt);
  });
  await inside.promise;
  const reclaim = runResourcesCommand(['reclaim', '--apply']);
  try {
    const [outcome] = await Promise.race([
      reclaim.then(
        () => ['finished'],
        () => ['failed']
      ),
      setTimeout(200, ['waiting']),
    ]);
    expect(outcome).toBe('waiting');
  } finally {
    release.resolve();
    await Promise.allSettled([admitted, reclaim]);
  }
  await Promise.all([admitted, reclaim]);
  expect(JSON.parse(await fs.readFile(path, 'utf8'))).toEqual(newReceipt);
});

it('refreshes an old launcher after reclaiming a dead slot under setup', async () => {
  const { home, slot } = await fixture();
  await installResourceShims(home);
  const shim = join(home, 'bin', resourceShims[0]!);
  const expected = await fs.readFile(shim, 'utf8');
  await fs.writeFile(
    shim,
    expected.replace('# Resource scheduler protocol: 3\n', '')
  );
  await setupResources({ home, roots: [home], shell: 'none' });
  expect(await fs.readFile(shim, 'utf8')).toBe(expected);
  expect((await occupancy(home)).occupied).not.toContain(slot);
});

it('reclaims a dead slot on shim validation failure without provisioning or publishing the budget fence', async () => {
  const { home } = await fixture();
  await expect(
    runResourcesCommand(['run', '--', 'node', '--version'])
  ).rejects.toThrow('ttr resources setup --shell none');
  expect((await occupancy(home)).occupied).toEqual([]);
  expect(await fs.readdir(join(home, 'slots'))).toEqual([]);
  expect(await fs.readdir(home)).not.toContain('bin');
});

it('leaves the dead slot occupied if the receipt cannot be backed up', async () => {
  const { home, path, receipt } = await fixture();
  await fs.writeFile(join(home, 'backups'), 'not a directory');
  await expect(runResourcesCommand(['reclaim', '--apply'])).rejects.toThrow();
  expect(await fs.readFile(path, 'utf8')).toBe(receipt);
});

it('leaves legacy and uninitialized slots untouched', async () => {
  const { home, slot, path, receipt } = await fixture();
  await fs.rename(slot, join(home, 'lock'));
  await fs.mkdir(slot);
  await runResourcesCommand(['reclaim', '--apply']);
  expect(await fs.readFile(join(home, 'lock', 'owner.json'), 'utf8')).toBe(
    receipt
  );
  expect(await fs.readdir(slot)).toEqual([]);
  expect(await fs.readdir(home)).toEqual(['config.json', 'lock', 'slots']);
  await expect(fs.lstat(path)).rejects.toMatchObject({ code: 'ENOENT' });
});
