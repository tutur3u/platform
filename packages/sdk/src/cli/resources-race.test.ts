import { type ChildProcess, spawn } from 'node:child_process';
import {
  chmod,
  mkdtemp,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({
  beforeSpawn: undefined as undefined | (() => Promise<void>),
  queued: 0,
  shims: '',
}));
vi.mock('./resources-setup', async (original) => ({
  ...(await original<typeof import('./resources-setup')>()),
  installedResourceShims: async () => hooks.shims,
}));
// Wrap the spawn boundary so a test can swap the path in the gap between
// classification and spawn, exactly where a racing attacker would.
vi.mock('./resources-queue', async (original) => {
  const actual = await original<typeof import('./resources-queue')>();
  return {
    ...actual,
    spawnResourceCommand: vi.fn(
      async (...args: Parameters<typeof actual.spawnResourceCommand>) => {
        await hooks.beforeSpawn?.();
        return actual.spawnResourceCommand(...args);
      }
    ),
    queuedResourceCommand: vi.fn(async () => {
      hooks.queued++;
      return 0;
    }),
  };
});

import { atomicJson, defaultResourceConfig } from './resources-config';
import { spawnResourceCommand } from './resources-queue';
import { newOwner } from './resources-slots';

const dirs: string[] = [];
const children: ChildProcess[] = [];
afterEach(async () => {
  hooks.beforeSpawn = undefined;
  hooks.queued = 0;
  vi.mocked(spawnResourceCommand).mockClear();
  for (const child of children.splice(0)) child.kill('SIGKILL');
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

// The only lane is held by a live owner outside this process tree, so any
// command that is not provably trivial must queue.
async function occupiedHome() {
  const home = await realpath(
    await mkdtemp(join(tmpdir(), 'ttr-resources-race-'))
  );
  dirs.push(home);
  hooks.shims = join(home, 'bin');
  await atomicJson(join(home, 'config.json'), {
    ...defaultResourceConfig(),
    roots: [home],
  });
  const holder = spawn('sleep', ['30'], { stdio: 'ignore' });
  children.push(holder);
  await atomicJson(join(home, 'slots', '0', 'owner.json'), {
    ...newOwner('holder'),
    pid: holder.pid!,
  });
  const sentinel = join(home, 'payload-ran');
  const payload = join(home, 'payload.sh');
  await writeFile(payload, `#!/bin/sh\ntouch '${sentinel}'\n`);
  await chmod(payload, 0o755);
  return { home, payload, sentinel, link: join(home, 'echo') };
}
async function run(home: string, argv: string[]) {
  const { runResourcesCommand } = await import('./resources');
  const previous = process.env.TTR_RESOURCES_HOME;
  process.env.TTR_RESOURCES_HOME = home;
  try {
    await runResourcesCommand(['run', '--', ...argv]);
  } finally {
    if (previous === undefined) delete process.env.TTR_RESOURCES_HOME;
    else process.env.TTR_RESOURCES_HOME = previous;
  }
}
const ran = (path: string) =>
  stat(path).then(
    () => true,
    () => false
  );

describe('trivial spawn uses the validated canonical path (REV-6492-5)', () => {
  it('a symlink swapped after classification cannot run its payload', async () => {
    const { home, payload, sentinel, link } = await occupiedHome();
    await symlink('/bin/echo', link);
    hooks.beforeSpawn = async () => {
      await rm(link);
      await symlink(payload, link);
    };
    await run(home, [link, 'race']);
    expect(hooks.queued).toBe(0);
    expect(vi.mocked(spawnResourceCommand).mock.calls[0]?.[0]).toBe(
      await realpath('/bin/echo')
    );
    expect(await ran(sentinel)).toBe(false);
  });

  it('a symlink swapped before classification queues', async () => {
    const { home, payload, sentinel, link } = await occupiedHome();
    await symlink(payload, link);
    await run(home, [link, 'race']);
    expect(hooks.queued).toBe(1);
    expect(spawnResourceCommand).not.toHaveBeenCalled();
    expect(await ran(sentinel)).toBe(false);
  });
});
