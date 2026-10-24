import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { commandTool, isHeavyCommand, limitCommand } from './resources-command';
import { defaultResourceConfig } from './resources-config';
import { realNode } from './resources-test-fixtures';

const homes: string[] = [];
afterEach(async () => {
  for (const home of homes.splice(0))
    await rm(home, { recursive: true, force: true });
});
const config = { ...defaultResourceConfig(), vitestWorkers: 2 };
describe('Node config-driven test runners', () => {
  it.each([
    ['--experimental-config-file=c.json'],
    ['--experimental-config-file', 'c.json'],
    ['--experimental-config-file'],
    ['--experimental-default-config-file'],
    ['--experimental-default-config-file=true'],
    ['--experimental_config_file=c.json'],
    ['--experimental_default_config_file'],
    ['--experimental-default-config-file', 'c.json'],
  ])('admits and caps every config option form %j', (...args) => {
    expect(commandTool('node', args).tool).toBe('ambiguous');
    expect(isHeavyCommand('node', args)).toBe(true);
    expect(limitCommand('node', args, config)).toEqual([
      '--test-concurrency=2',
      ...args,
    ]);
  });
  it.each([['--test-concurrency=1'], ['--test-concurrency', '1']])(
    'preserves a serial CLI limit with config activation: %j',
    (...concurrency) => {
      expect(
        limitCommand(
          'node',
          ['--experimental-default-config-file', ...concurrency],
          { ...config, vitestWorkers: 3 }
        )
      ).toEqual(['--test-concurrency=1', '--experimental-default-config-file']);
    }
  );
  it('does not confuse config strings in a program or eval argument with runtime options', () => {
    for (const args of [
      ['app.js', '--experimental-config-file=c.json'],
      ['--eval', '0', '--experimental-default-config-file'],
      ['--', '--experimental-default-config-file'],
    ])
      expect(limitCommand('node', args, config)).toEqual(args);
  });
  it.each([
    '--experimental-config-file=node.config.json',
    '--experimental-default-config-file',
  ])('caps real Node config-selected files: %s', async (flag) => {
    const home = await mkdtemp(join(tmpdir(), 'node-config-cap-'));
    homes.push(home);
    await writeFile(
      join(home, 'node.config.json'),
      JSON.stringify({ test: { test: true } })
    );
    const events = join(home, 'events');
    for (let i = 0; i < 5; i++)
      await writeFile(
        join(home, `${i}.test.cjs`),
        `const fs=require('node:fs');require('node:test')('file',async()=>{fs.appendFileSync(${JSON.stringify(events)},'+');await new Promise(r=>setTimeout(r,100));fs.appendFileSync(${JSON.stringify(events)},'-')});`
      );
    const args = limitCommand('node', [flag], config);
    const result = spawnSync(realNode, args, {
      cwd: home,
      env: { PATH: process.env.PATH, HOME: home },
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.status, result.stderr + result.stdout).toBe(0);
    const { readFile } = await import('node:fs/promises');
    let active = 0,
      peak = 0,
      started = 0;
    for (const event of await readFile(events, 'utf8')) {
      if (event === '+') {
        active++;
        started++;
      } else active--;
      peak = Math.max(peak, active);
    }
    expect(started).toBe(5);
    expect(active).toBe(0);
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(2);
  });
});

it('explains the budget marker to pre-budget clients', async () => {
  const { mkdir } = await import('node:fs/promises');
  const { occupancy } = await import('./resources-slots');
  const home = await mkdtemp(join(tmpdir(), 'node-config-legacy-fence-'));
  homes.push(home);
  await mkdir(join(home, 'slots'));
  await writeFile(join(home, 'slots/budget-v3'), '3\n');
  await expect(occupancy(home)).rejects.toThrow(
    /upgrade the global CLI.*existing roots/
  );
});
