import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { limitCommand } from './resources-command';
import { atomicJson, readResourceConfig } from './resources-config';
import { occupancy, withAdmission } from './resources-slots';
import { exists, privateFixtures } from './resources-test-fixtures';

const fixtures = privateFixtures(true);
afterEach(() => fixtures.cleanup());

describe('budget upgrade fence', { timeout: 45_000 }, () => {
  it('fences the old client on admission before a budget is hand-edited into config', async () => {
    const home = await fixtures.home();
    const original = (await readResourceConfig(home))!;
    expect(original.budget).toBeUndefined();
    const fence = join(home, 'slots', 'budget-v3');
    await withAdmission(home, async () => {
      expect(await readFile(fence, 'utf8')).toBe('3\n');
    });
    await atomicJson(join(home, 'config.json'), {
      ...original,
      budget: {
        lanes: 2,
        tokens: 2,
        memoryGiB: 4,
        projects: [
          { id: 'test', roots: [home], lanes: 2, tokens: 2, memoryGiB: 4 },
        ],
      },
    });
    expect(await readFile(fence, 'utf8')).toBe('3\n');
    expect((await occupancy(home)).occupied).toEqual([]);
  });

  it('recovers after a publisher crashes with an empty staging file', async () => {
    const home = await fixtures.home();
    const fence = join(home, 'slots', 'budget-v3');
    const config = (await readResourceConfig(home))!;
    await atomicJson(join(home, 'config.json'), {
      ...config,
      budget: {
        lanes: 2,
        tokens: 2,
        memoryGiB: 4,
        projects: [
          { id: 'test', roots: [home], lanes: 2, tokens: 2, memoryGiB: 4 },
        ],
      },
    });
    const runner = join(home, 'interrupted-publisher.ts');
    const ready = join(home, 'publisher.ready');
    await writeFile(
      runner,
      `
import {mock} from 'bun:test';
import * as fs from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
const original=fs.writeFile;const originalOpen=fs.open;
const pause=async()=>{writeFileSync(${JSON.stringify(ready)},'');await new Promise(()=>setInterval(()=>{},1000));};
mock.module('node:fs/promises',()=>({...fs,open:async(path,...args)=>{const file=await originalOpen(path,...args);if(String(path).includes('/budget-fence.')){await file.writeFile('');await pause();}return file;},writeFile:async(path,...args)=>{
  if(String(path)===${JSON.stringify(fence)}||String(path).includes('/budget-fence.')) {
    await original(path,'',args[1]);
    await pause();
  }
  return original(path,...args);
}}));
const {withAdmission}=await import(${JSON.stringify(resolve('src/cli/resources-slots.ts'))});
await withAdmission(${JSON.stringify(home)},async()=>{throw new Error('published too soon')});
`
    );
    const publisher = fixtures.launch(home, [], home, runner);
    await publisher.until(() => exists(ready));
    publisher.child.kill('SIGKILL');
    await publisher.done;
    expect(publisher.child.signalCode).toBe('SIGKILL');
    expect(await exists(fence)).toBe(false);
    expect(
      (await readdir(home)).some((name) => name.startsWith('budget-fence.'))
    ).toBe(true);
    await withAdmission(home, async () => {
      expect(await readFile(fence, 'utf8')).toBe('3\n');
    });
    expect((await occupancy(home)).occupied).toEqual([]);
    expect(
      (await readdir(home)).some((name) => name.startsWith('budget-fence.'))
    ).toBe(false);
  });
});

describe('Node native test worker caps', () => {
  it.each([
    ['--test'],
    ['--test', '--test-concurrency=24', 'a.test.js', 'b.test.js'],
    ['--test', '--test-concurrency', '24', 'a.test.js'],
    [
      '--diagnostic-dir',
      '/tmp',
      '--test',
      '--test-concurrency=24',
      'a.test.js',
    ],
    ['--test', '--test_concurrency=24', 'a.test.js'],
  ])('caps the option segment at the charged tokens: %j', async (...args) => {
    const home = await fixtures.home();
    const config = { ...(await readResourceConfig(home))!, vitestWorkers: 2 };
    const limited = limitCommand('node', args, config);
    expect(limited[0]).toBe('--test-concurrency=2');
    expect(limited).not.toContain('--test-concurrency=24');
    expect(limited).not.toContain('--test_concurrency=24');
    expect(limited).not.toContain('24');
    expect(limited).toContain('--test');
    const files = args.filter((arg) => arg.endsWith('.test.js'));
    if (files.length) expect(limited.slice(-files.length)).toEqual(files);
  });

  it('preserves program and eval arguments that happen to contain test flags', async () => {
    const home = await fixtures.home();
    const config = (await readResourceConfig(home))!;
    for (const args of [
      ['scripts/check.js', '--test', '--test-concurrency=24'],
      ['--eval', '"--test"', '--test'],
      ['--', '--test'],
    ])
      expect(limitCommand('node', args, config)).toEqual(args);
    expect(
      limitCommand('node', ['--test', '--', '--test-concurrency=24'], config)
    ).toEqual([
      '--test-concurrency=2',
      '--test',
      '--',
      '--test-concurrency=24',
    ]);
  });
});
