import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resourceQueueStatus } from './resources-queue';
import { exists, privateFixtures, realNode } from './resources-test-fixtures';

vi.mock('node:os', async (original) => ({
  ...(await original<typeof import('node:os')>()),
  totalmem: () => 24 * 1024 ** 3,
  availableParallelism: () => 10,
}));
const fixtures = privateFixtures(true);
const { home, held, launch, waiting, release, temporary } = fixtures;
afterEach(() => fixtures.cleanup());

const executable = async (path: string, text: string) => {
  await writeFile(path, text);
  await chmod(path, 0o755);
};

// Each probe would run attacker-controlled code if it skipped admission. With
// the only lane occupied, every probe must wait in the FIFO and its code may
// run only after the holder releases the lane.
describe('occupied-slot bypass attempts queue', { timeout: 60_000 }, () => {
  it('queues git callbacks, runtime preloads and impostor tools (REV-6492-1/2/4)', async () => {
    const path = await home(1);
    const repo = await temporary();
    const marks = join(path, 'marks');
    await mkdir(marks);
    const mark = (name: string) => join(marks, name);
    const touch = (name: string) => `#!/bin/sh\ntouch '${mark(name)}'\n`;
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
    git('init', '-q');
    git(
      '-c',
      'user.email=t@example.com',
      '-c',
      'user.name=T',
      'commit',
      '--allow-empty',
      '-qm',
      'init'
    );
    await mkdir(join(repo, '.git', 'hooks'), { recursive: true });
    await executable(join(repo, 'fsmonitor.sh'), touch('fsmonitor'));
    await executable(
      join(repo, '.git', 'hooks', 'reference-transaction'),
      touch('reference-transaction')
    );
    const preload = join(path, 'preload.cjs');
    // Only the queued Node child writes the mark, not the Bun-hosted CLI.
    await writeFile(
      preload,
      `if(!process.versions.bun)require('fs').writeFileSync(${JSON.stringify(mark('node-options'))},'')`
    );
    const impostor = join(path, 'tools', 'node');
    await mkdir(dirname(impostor));
    await executable(impostor, touch('impostor'));

    const a = launch(path, ['run', '--', 'node', await held(path, 'a')]);
    await a.until(() => exists(join(path, 'a.ready')));
    const nodeOptions = { NODE_OPTIONS: `--require ${preload}` };
    const npx = join(dirname(realNode), 'npx');
    const probes = [
      launch(path, ['run', '--', 'git', 'status', '--short'], repo, undefined, {
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'core.fsmonitor',
        GIT_CONFIG_VALUE_0: join(repo, 'fsmonitor.sh'),
      }),
      launch(path, ['run', '--', 'git', 'branch', 'feature'], repo),
      launch(
        path,
        ['run', '--', 'node', '--help'],
        path,
        undefined,
        nodeOptions
      ),
      ...(existsSync(npx)
        ? [
            launch(
              path,
              ['run', '--', npx, '--version'],
              path,
              undefined,
              nodeOptions
            ),
          ]
        : []),
      launch(path, ['run', '--', impostor, '--version']),
    ];
    await waiting(path, probes.length, probes);
    // Trusted read-only system tools still skip the queue.
    const control = await launch(path, ['run', '--', 'echo', 'control']).done;
    expect(control.code, control.err).toBe(0);
    expect(control.out).toContain('control');
    expect(probes.map((probe) => probe.child.exitCode)).toEqual(
      probes.map(() => null)
    );
    for (const name of [
      'fsmonitor',
      'reference-transaction',
      'node-options',
      'impostor',
    ])
      expect(await exists(mark(name)), name).toBe(false);

    await release(path, 'a');
    expect((await a.done).code).toBe(0);
    for (const probe of probes) {
      const result = await probe.done;
      expect(result.code, result.err).toBe(0);
    }
    // The vectors are real: each ran its code once admitted.
    for (const name of [
      'fsmonitor',
      'reference-transaction',
      'node-options',
      'impostor',
    ])
      expect(await exists(mark(name)), name).toBe(true);
    expect((await resourceQueueStatus(path)).waiting).toHaveLength(0);
  });
});
