import { spawn } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { runResourcesCommand } from './resources';
import { atomicJson, defaultResourceConfig } from './resources-config';
import { formatGroupMembers, reclaimReport } from './resources-reclaim-report';
import { errno, newOwner, type ResourceOwner } from './resources-slots';

const homes: string[] = [];
const deadPid = 2147483647;
const outOfRangePid = 0x80000000;

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

async function fixture(
  owners: Record<string, ResourceOwner>,
  maxLanes = Object.keys(owners).length
) {
  const home = await fs.mkdtemp(join(tmpdir(), 'ttr-reclaim-report-'));
  homes.push(home);
  vi.stubEnv('TTR_RESOURCES_HOME', home);
  vi.stubEnv('TTR_RESOURCES_BYPASS', '');
  vi.stubEnv('TTR_RESOURCES_IGNORE_DISK', '1');
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  await atomicJson(join(home, 'config.json'), {
    ...defaultResourceConfig(),
    validationLanes: maxLanes,
    maxValidationLanes: maxLanes,
  });
  const slots: Record<string, { slot: string; path: string; receipt: string }> =
    {};
  for (const [id, owner] of Object.entries(owners)) {
    const slot = join(home, 'slots', id);
    const path = join(slot, 'owner.json');
    const receipt = `${JSON.stringify(owner, null, 2)}\n`;
    await fs.mkdir(slot, { recursive: true });
    await fs.writeFile(path, receipt);
    slots[id] = { slot, path, receipt };
  }
  return { home, slots };
}

function output() {
  return vi.mocked(process.stdout.write).mock.calls.flat().join('');
}

it('reclaims a dead owner with a gone cwd while naming a kept live broker slot', async () => {
  const gone = join(tmpdir(), 'ttr-missing-worktree-never-created');
  const { slots } = await fixture({
    '0': {
      ...newOwner('bun'),
      pid: deadPid,
      childPid: deadPid,
      cwd: gone,
    },
    '1': newOwner('node'),
  });
  await runResourcesCommand(['reclaim']);
  expect(output()).toContain(`Would reclaim ${slots['0']!.slot}.`);
  expect(output()).not.toContain(`Kept ${slots['0']!.slot}`);
  expect(output()).toContain(
    `Kept ${slots['1']!.slot}: broker PID ${process.pid} is alive.`
  );
  expect(output()).not.toContain(`Would reclaim ${slots['1']!.slot}.`);
});

it('names the surviving child process group instead of reporting an empty lane', async () => {
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
    const { home, slots } = await fixture({
      '0': {
        ...newOwner('bun'),
        pid: deadPid,
        childPid: group,
      },
    });
    const { slot, path, receipt } = slots['0']!;
    await runResourcesCommand(['reclaim']);
    expect(output()).toContain(
      `Kept ${slot}: child process group ${group} still has process(es) `
    );
    expect(output()).not.toContain(`Would reclaim ${slot}.`);
    await runResourcesCommand(['reclaim', '--apply']);
    expect(await fs.readFile(path, 'utf8')).toBe(receipt);
    expect(await fs.readdir(home)).toEqual(['config.json', 'slots']);
  } finally {
    stopGroup(group);
  }
});

it('reports out-of-range PIDs as unverifiable instead of alive and keeps the slot', async () => {
  const { home, slots } = await fixture({
    '0': {
      ...newOwner('bun'),
      pid: outOfRangePid,
    },
  });
  const { slot, path, receipt } = slots['0']!;
  await runResourcesCommand(['reclaim']);
  expect(output()).toContain(
    `Kept ${slot}: broker PID ${outOfRangePid} is out of range and cannot be proven absent.`
  );
  expect(output()).not.toContain('is alive');
  await runResourcesCommand(['reclaim', '--apply']);
  expect(await fs.readFile(path, 'utf8')).toBe(receipt);
  expect(await fs.readdir(home)).toEqual(['config.json', 'slots']);
});

it('caps displayed process-group members at 8 PIDs with a remainder count', () => {
  const eight = Array.from({ length: 8 }, (_, i) => String(100 + i));
  expect(formatGroupMembers(eight)).toBe(eight.join(', '));
  const eleven = Array.from({ length: 11 }, (_, i) => String(100 + i));
  expect(formatGroupMembers(eleven)).toBe(
    '100, 101, 102, 103, 104, 105, 106, 107, and 3 more'
  );
});

it('preserves already-applied reclaim output if kept-slot inspection throws', async () => {
  const report = await reclaimReport(
    '/tmp/unused-home',
    [{ path: '/tmp/slots/0', backup: '/tmp/backups/0.json' }],
    true,
    async () => {
      throw new Error('config unreadable');
    }
  );
  expect(report).toContain(
    'Reclaimed /tmp/slots/0. Receipt backed up to /tmp/backups/0.json'
  );
  expect(report).toContain(
    'Warning: could not inspect remaining resource slots: config unreadable'
  );
});
