import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'balancer-launcher-'));
  dirs.push(root);
  await mkdir(join(root, 'bin'));
  await mkdir(join(root, 'dist', 'cli'), { recursive: true });
  const bin = join(root, 'bin', 'ttr.cjs');
  await copyFile(join(__dirname, '../../bin/ttr.cjs'), bin);
  await writeFile(
    join(root, 'dist', 'cli', 'index.js'),
    `
    if (process.argv[2] === 'balancer' && process.versions.bun) {
      throw new Error('Controller entered the unsupported Bun native-lock runtime');
    }
    console.log(JSON.stringify({argv:process.argv.slice(2),bun:process.versions.bun??null,node:process.versions.node}));
    if (process.argv.includes('--exit-17')) process.exitCode=17;
  `
  );
  return bin;
}

it('runs the published balancer entry under Node with the original arguments', async () => {
  const result = spawnSync(
    'bun',
    [await fixture(), 'balancer', 'probe', '--json'],
    { encoding: 'utf8' }
  );
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({
    argv: ['balancer', 'probe', '--json'],
    bun: null,
    node: expect.any(String),
  });
});

it('forwards the controller exit code', async () => {
  const result = spawnSync('bun', [await fixture(), 'balancer', '--exit-17'], {
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(17);
});

it('keeps other published CLI commands in their existing Bun runtime', async () => {
  const result = spawnSync('bun', [await fixture(), 'resources', 'status'], {
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({
    argv: ['resources', 'status'],
    bun: expect.any(String),
  });
});
