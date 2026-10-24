import type { SpawnOptions } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const preload = vi.hoisted(() => ({ path: '' }));
vi.mock('node:child_process', async (original) => {
  const actual = await original<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: (command: string, args: string[], options: SpawnOptions) =>
      actual.spawn(
        command,
        preload.path && /(?:^|\/)bun$/.test(command)
          ? ['--preload', preload.path, ...args]
          : args,
        options
      ),
  };
});

import {
  crossProcessTimeout,
  exists,
  privateFixtures,
  until,
} from './resources-test-fixtures';

const fixtures = privateFixtures(true);
afterEach(async () => {
  preload.path = '';
  await fixtures.cleanup();
});

describe('fixture shim preparation', { timeout: crossProcessTimeout }, () => {
  it.each([
    { memory: 16 * 1024 ** 3, cpus: 10 },
    { memory: 24 * 1024 ** 3, cpus: 8 },
  ])('refuses a changed per-home shim budget: %j', async (budget) => {
    const home = await fixtures.home();
    const status = () => fixtures.launch(home, ['status', '--json']);
    expect((await status().done).code).toBe(0);
    const shim = join(home, 'fixture-shim.ts');
    const before = await readFile(shim, 'utf8');
    expect((await status().done).code).toBe(0);
    expect(() =>
      fixtures.launch(home, ['status', '--json'], home, undefined, {}, budget)
    ).toThrow('Fixture shim host budget changed; use a fresh fixture home');
    expect(await readFile(shim, 'utf8')).toBe(before);
    expect(fixtures.children).toHaveLength(2);
  });

  it('starts two concurrent runs after a single per-home shim installation', async () => {
    const home = await fixtures.home();
    preload.path = join(home, 'installation-hook.ts');
    await writeFile(
      preload.path,
      `
import {mock} from 'bun:test';
import * as fs from 'node:fs/promises';
import {basename} from 'node:path';
import {writeFileSync,existsSync} from 'node:fs';
import {setTimeout} from 'node:timers/promises';
const base=${JSON.stringify(home)};
const open=fs.open;
mock.module('node:fs/promises',()=>({...fs,open:async(path,...args)=>{
  const file=await open(path,...args);
  if(String(path).startsWith(base+'/bin/')&&basename(String(path)).startsWith('.bun.')) {
    writeFileSync(base+'/installer.entered.'+process.pid,'');
    while(!existsSync(base+'/installer.release.'+process.pid))await setTimeout(10);
  }
  return file;
}}));
`
    );
    const a = fixtures.launch(home, [
      'run',
      '--',
      'node',
      await fixtures.held(home, 'a'),
    ]);
    const aGate = join(home, `installer.entered.${a.child.pid}`);
    await until(() => exists(aGate), [a.producer]);
    const b = fixtures.launch(home, [
      'run',
      '--',
      'node',
      await fixtures.held(home, 'b'),
    ]);
    await until(
      async () =>
        (await exists(
          join(home, `fixture-preparation-waiter.${b.child.pid}`)
        )) || (await exists(join(home, `installer.entered.${b.child.pid}`))),
      [b.producer]
    );
    await writeFile(join(home, `installer.release.${a.child.pid}`), '');
    await until(() => exists(join(home, 'a.ready')), [a.producer]);
    await writeFile(join(home, `installer.release.${b.child.pid}`), '');
    await until(
      async () =>
        b.child.exitCode !== null || (await exists(join(home, 'b.ready'))),
      [b.producer]
    );
    const failure = b.child.exitCode !== null ? (await b.done).err : '';
    expect(await exists(join(home, 'b.ready')), failure).toBe(true);
    expect(await exists(join(home, `installer.entered.${b.child.pid}`))).toBe(
      false
    );
    await fixtures.release(home, 'a');
    await fixtures.release(home, 'b');
    expect((await a.done).code).toBe(0);
    expect((await b.done).code).toBe(0);
  });

  it('reports a dead producer stderr while an unrelated held process stays alive', async () => {
    const home = await fixtures.home();
    const live = fixtures.launch(
      home,
      [],
      home,
      await fixtures.held(home, 'live')
    );
    await live.until(() => exists(join(home, 'live.ready')));
    const script = await fixtures.script(
      home,
      'dead',
      "console.error('specific failed producer');process.exit(7)"
    );
    const dead = fixtures.launch(home, [], home, script);
    expect((await dead.done).code).toBe(7);
    await expect(dead.until(async () => false)).rejects.toThrow(
      'specific failed producer'
    );
    expect(live.child.exitCode).toBeNull();
    await fixtures.release(home, 'live');
    await live.done;
  });
});
