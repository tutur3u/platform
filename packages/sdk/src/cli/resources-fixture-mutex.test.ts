import { readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import {
  crossProcessTimeout,
  exists,
  jsLiteral,
  privateFixtures,
} from './resources-test-fixtures';

const fixtures = privateFixtures();
const { home, laneLaunch: launch } = fixtures;
afterEach(() => fixtures.cleanup());
it('stalled admission publication cannot recreate a lost directory or overwrite a successor', {
  timeout: crossProcessTimeout,
}, async () => {
  for (const mode of ['lost', 'successor', 'initializing']) {
    const path = await home();
    const runner = join(path, 'stalled.ts');
    const slots = jsLiteral(resolve('src/cli/resources-slots.ts'));
    const base = jsLiteral(path);
    await writeFile(
      runner,
      `import {mock} from 'bun:test';import * as fs from 'node:fs/promises';import {existsSync,writeFileSync} from 'node:fs';import {setTimeout} from 'node:timers/promises';const base=${base};const original=fs.open;const make=fs.mkdir;let paused=false;let count=0;mock.module('node:fs/promises',()=>({...fs,mkdir:async(path,...args)=>{if(String(path)===base+'/admission'&&!args[0]?.recursive)count++;return make(path,...args)},open:async(path,...args)=>{if(String(path)===base+'/admission/reclaim'&&!paused){paused=true;writeFileSync(base+'/stalled.ready','');while(!existsSync(base+'/stalled.release'))await setTimeout(10)}return original(path,...args)}}));const {withAdmission}=await import(${slots});await withAdmission(base,async()=>{writeFileSync(base+'/entered',String(count));while(!existsSync(base+'/action.release'))await setTimeout(10)},()=>{if(paused&&existsSync(base+'/stalled.release'))writeFileSync(base+'/retry.ready','');return false});`
    );
    const stalled = launch(path, [], runner);
    await stalled.until(() => exists(join(path, 'stalled.ready')));
    const old = new Date(0);
    await utimes(join(path, 'admission'), old, old);
    let successor: ReturnType<typeof launch> | undefined;
    if (mode === 'lost') await rm(join(path, 'admission'), { recursive: true });
    else {
      const next = join(path, 'successor.ts');
      await writeFile(
        next,
        `import {mock} from 'bun:test';import * as fs from 'node:fs/promises';import {existsSync,writeFileSync} from 'node:fs';import {setTimeout} from 'node:timers/promises';const base=${base};const original=fs.link;mock.module('node:fs/promises',()=>({...fs,link:async(...args)=>{${mode === 'initializing' ? "writeFileSync(base+'/initializing.ready','');while(!existsSync(base+'/initializing.release'))await setTimeout(10);" : ''}return original(...args)}}));const {withAdmission}=await import(${slots});await withAdmission(base,async()=>{writeFileSync(base+'/successor.ready','');while(!existsSync(base+'/successor.release'))await setTimeout(10)});`
      );
      successor = launch(path, [], next);
      await successor!.until(() =>
        exists(
          join(
            path,
            mode === 'initializing' ? 'initializing.ready' : 'successor.ready'
          )
        )
      );
    }
    const owner = await readFile(
      join(path, 'admission', 'owner.json'),
      'utf8'
    ).catch(() => undefined);
    await writeFile(join(path, 'stalled.release'), '');
    if (mode !== 'lost') {
      await stalled.until(() => exists(join(path, 'retry.ready')));
      expect(await exists(join(path, 'entered'))).toBe(false);
      expect(
        await readFile(join(path, 'admission', 'owner.json'), 'utf8').catch(
          () => undefined
        )
      ).toBe(owner);
      if (mode === 'initializing') {
        await writeFile(join(path, 'initializing.release'), '');
        await successor!.until(() => exists(join(path, 'successor.ready')));
      }
      await writeFile(join(path, 'successor.release'), '');
      expect((await successor!.done).code).toBe(0);
    }
    await stalled.until(() => exists(join(path, 'entered')));
    expect(
      Number(await readFile(join(path, 'entered'), 'utf8'))
    ).toBeGreaterThanOrEqual(2);
    await writeFile(join(path, 'action.release'), '');
    expect((await stalled.done).code).toBe(0);
  }
});
