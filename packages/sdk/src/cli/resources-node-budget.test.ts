import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { inferTokens } from './resources-budget';
import { limitCommand } from './resources-command';
import { defaultResourceConfig } from './resources-config';
import { realNode } from './resources-test-fixtures';

const homes: string[] = [];
afterEach(async () => {
  for (const home of homes.splice(0))
    await rm(home, { recursive: true, force: true });
});
const defaults = { vitestWorkers: 3, buildJobs: 3 };
it.each([
  [['--test-concurrency=1'], 1],
  [['--test-concurrency', '1'], 1],
  [['--test_concurrency=1'], 1],
  [['--test-concurrency=0'], 3],
  [['--test-concurrency', '0'], 3],
  [['--test-concurrency=24'], 3],
  [[], 3],
] as const)(
  'charges and enforces the lower explicit native-test concurrency: %j',
  (options, expected) => {
    for (const prefix of [
      ['--test'],
      ['--experimental-default-config-file'],
      ['--experimental-config-file=c.json'],
    ]) {
      const args = [...prefix, ...options];
      expect(inferTokens('node', args, defaults)).toBe(expected);
      expect(
        limitCommand('node', args, { ...defaultResourceConfig(), ...defaults })
      ).toEqual([`--test-concurrency=${expected}`, ...prefix]);
    }
  }
);
it.each([1, 0])(
  'real Node runs five files with explicit concurrency %i',
  async (requested) => {
    const home = await realpath(
      await mkdtemp(join(tmpdir(), 'native-serial-budget-'))
    );
    homes.push(home);
    const events = join(home, 'events');
    for (let i = 0; i < 5; i++)
      await writeFile(
        join(home, `${i}.test.cjs`),
        `const fs=require('node:fs');require('node:test')('file',async()=>{fs.appendFileSync(${JSON.stringify(events)},'+');await new Promise(r=>setTimeout(r,100));fs.appendFileSync(${JSON.stringify(events)},'-')});`
      );
    const args = ['--test', `--test-concurrency=${requested}`];
    const limited = limitCommand('node', args, {
      ...defaultResourceConfig(),
      ...defaults,
    });
    const result = spawnSync(realNode, limited, {
      cwd: home,
      env: { HOME: home, PATH: process.env.PATH },
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.status, result.stderr + result.stdout).toBe(0);
    let active = 0,
      started = 0,
      peak = 0;
    for (const event of await readFile(events, 'utf8')) {
      if (event === '+') {
        active++;
        started++;
      } else active--;
      peak = Math.max(peak, active);
    }
    expect(started).toBe(5);
    expect(active).toBe(0);
    expect(peak).toBeLessThanOrEqual(requested || 3);
    expect(inferTokens('node', args, defaults)).toBe(requested || 3);
  }
);
