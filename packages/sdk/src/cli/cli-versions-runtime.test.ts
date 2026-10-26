import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { realExecutable } from './resources-command';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cli-runtime-')));
  roots.push(root);
  const tools = join(root, 'tools');
  await mkdir(tools);
  const alias = join(tools, 'bunx');
  // Node exposes the executed argv[0], making multicall dispatch observable.
  await symlink(process.execPath, alias);
  return { root, tools, alias };
}

it('preserves the multicall bunx symlink returned by the shared resolver', async () => {
  const { root, tools, alias } = await fixture();
  expect(realExecutable('bunx', join(root, 'bin'), tools)).toBe(alias);
});

it('retains shell lookup semantics for a relative shared PATH entry', async () => {
  const { root, tools } = await fixture();
  const relativeTools = relative(process.cwd(), tools);
  expect(realExecutable('bunx', join(root, 'bin'), relativeTools)).toBe(
    join(relativeTools, 'bunx')
  );
});

it('preserves the executed argv0 through a resource shim', async () => {
  const { root, tools, alias } = await fixture();
  const bun = realExecutable('bun', '/nonexistent');
  const output = execFileSync(
    bun,
    [
      resolve('src/cli/resources-entry.ts'),
      'shim',
      'bunx',
      '--',
      '-p',
      'process.argv0',
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${tools}:${dirname(bun)}:/usr/bin:/bin`,
        TTR_RESOURCES_HOME: root,
      },
      encoding: 'utf8',
      timeout: 15_000,
    }
  );
  expect(output.trim()).toBe(alias);
});
