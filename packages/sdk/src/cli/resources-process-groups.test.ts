import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import {
  crossProcessTimeout,
  jsLiteral,
  privateFixtures,
} from './resources-test-fixtures';
const fixtures = privateFixtures(true);
const { launch } = fixtures;
afterEach(() => fixtures.cleanup());
it(
  'proves absent groups with ESRCH while permissions and unknown errors fail closed without ps',
  {
    timeout: crossProcessTimeout,
  },
  async () => {
    const path = await fixtures.home();
    const runner = join(path, 'group.ts');
    await writeFile(
      runner,
      `import {mock} from 'bun:test';import * as cp from 'node:child_process';let error='ESRCH';let output;let ps=0;const calls=[];process.kill=(...args)=>{calls.push(args);if(error)throw Object.assign(new Error('fixture'),{code:error});return true};mock.module('node:child_process',()=>({...cp,execFileSync:()=>{ps++;if(output===undefined)throw new Error('ps unavailable');return output}}));const {processGroupAlive}=await import(${jsLiteral(resolve('src/cli/resources-slots.ts'))});const results=[];for(error of ['ESRCH','EPERM','EIO',''])results.push(processGroupAlive(12345));output='12345 Z';results.push(processGroupAlive(12345));output='12345 S';results.push(processGroupAlive(12345));console.log(JSON.stringify({results,calls,ps}));`
    );
    const result = await launch(path, [], path, runner).done;
    expect(result.code, result.err).toBe(0);
    expect(JSON.parse(result.out)).toEqual({
      results: [false, true, true, true, false, true],
      calls: Array.from({ length: 6 }, () => [-12345, 0]),
      ps: 3,
    });
  }
);
