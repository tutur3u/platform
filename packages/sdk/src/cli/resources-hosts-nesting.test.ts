import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { proposedHostRegistry } from './resources-hosts-config';
import { hostsRun } from './resources-hosts-dispatch';
import { hostLedger } from './resources-hosts-ledger';
import { resourceQueueStatus } from './resources-queue';
import { bun, privateFixtures } from './resources-test-fixtures';

const fixtures = privateFixtures(true);
afterEach(() => fixtures.cleanup());
const cliModule = resolve('src/cli/resources.ts');
const dispatchModule = resolve('src/cli/resources-hosts-dispatch.ts');
const registryModule = resolve('src/cli/resources-hosts-config.ts');
const setupModule = resolve('src/cli/resources-setup.ts');

describe('nested capability validation', { timeout: 30_000 }, () => {
  it.each(['heavy lane', 'light reservation'] as const)(
    'rejects an unknown requirement on a trusted trivial command under a %s',
    async (kind) => {
      await nested(kind, 'typo', false, true);
    }
  );
  it.each(['heavy lane', 'light reservation'] as const)(
    'rejects an incompatible requirement on a trusted trivial command under a %s',
    async (kind) => {
      await nested(kind, 'ios', false, true);
    }
  );
  it.each(['heavy lane', 'light reservation'] as const)(
    'keeps a compatible trusted trivial command available under a %s',
    async (kind) => {
      await nested(kind, 'web', true, true);
    }
  );
  it('preserves the explicit resource bypass', async () => {
    await nested('heavy lane', 'typo', true, true, true);
  });
  it.each(['heavy lane', 'light reservation'] as const)(
    'rejects iOS under a web-only %s before starting the nested workload',
    async (kind) => {
      await nested(kind, 'ios', false);
    }
  );
  it.each(['heavy lane', 'light reservation'] as const)(
    'reuses compatible web admission under a %s',
    async (kind) => {
      await nested(kind, 'web', true);
    }
  );
});

async function nested(
  kind: 'heavy lane' | 'light reservation',
  requirement: 'ios' | 'web' | 'typo',
  compatible: boolean,
  trivial = false,
  bypass = false
) {
  const home = await fixtures.home(1);
  const base = proposedHostRegistry();
  const registry = {
    ...base,
    hosts: [
      {
        ...base.hosts[0]!,
        capabilities: ['web'],
        slots: { light: 1, heavy: 1 },
      },
    ],
  };
  const marker = join(home, 'nested.ran');
  const result = join(home, 'nested.result');
  const script = join(home, 'nested.ts');
  const command = `require('node:fs').writeFileSync(${JSON.stringify(marker)}, process.env.TTR_RESOURCES_ADMITTED || 'ran')`;
  const argv = trivial ? ['/usr/bin/true'] : [bun, '-e', command];
  const run =
    kind === 'heavy lane' || trivial
      ? `
      const {mock}=await import('bun:test');
      const setup=await import(${JSON.stringify(setupModule)}),validate=setup.installedResourceShims;
      mock.module(${JSON.stringify(setupModule)},()=>({...setup,installedResourceShims:(path)=>validate(path,${JSON.stringify(join(home, 'fixture-shim.ts'))})}));
      const config=await import(${JSON.stringify(registryModule)});
      mock.module(${JSON.stringify(registryModule)},()=>({...config,readHostRegistry:async()=>(${JSON.stringify(registry)})}));
      const {runResourcesCommand}=await import(${JSON.stringify(cliModule)});
      ${bypass ? "process.env.TTR_RESOURCES_BYPASS='1';" : ''}
      await runResourcesCommand(['run','--hosts','--requires',${JSON.stringify(requirement)},'--',...${JSON.stringify(argv)}]);
    `
      : `
      const {hostsRun}=await import(${JSON.stringify(dispatchModule)});
      await hostsRun({home:${JSON.stringify(home)},command:'nested',args:[],requires:[${JSON.stringify(requirement)}],jobClass:'light',registry:${JSON.stringify(registry)},deps:{
        fleet:async()=>undefined,commitPlan:async()=>undefined,log:()=>{},
        runLocal:async()=>{writeFileSync(${JSON.stringify(marker)},'ran');return 0},runRemote:async()=>1
      }});
    `;
  await writeFile(
    script,
    `import {writeFileSync} from 'node:fs';
    try { await (async()=>{${run}})(); writeFileSync(${JSON.stringify(result)},'ok'); }
    catch(error){writeFileSync(${JSON.stringify(result)},String(error.message));}`
  );
  if (kind === 'heavy lane') {
    const outcome = await fixtures.laneLaunch(home, ['run', '--', bun, script])
      .done;
    expect(outcome.code, outcome.err).toBe(0);
  } else {
    const outcome = await hostsRun({
      home,
      command: 'wrapper',
      args: [],
      jobClass: 'light',
      registry: {
        ...base,
        hosts: [
          {
            ...base.hosts[0]!,
            capabilities: ['web'],
            slots: { light: 1, heavy: 1 },
          },
        ],
      },
      deps: {
        fleet: async () => undefined,
        commitPlan: async () => undefined,
        localDiskFreeGiB: async () => 100,
        localDiskGate: async () => ({ admit: true }),
        log: () => {},
        runRemote: async () => 1,
        runLocal: ({ marker: reservation }) =>
          trivial
            ? fixtures
                .laneLaunch(home, ['run'], script, reservation)
                .done.then((result) => result.code ?? 1)
            : new Promise<number>((done) => {
                const child = spawn(bun, [script], {
                  env: { ...process.env, ...reservation },
                  stdio: 'ignore',
                });
                fixtures.children.push(child);
                child.once('close', (code) => done(code ?? 1));
              }),
      },
    });
    expect(outcome).toBe(0);
  }
  const outcome = await readFile(result, 'utf8');
  if (compatible) {
    expect(outcome).toBe('ok');
    if (!trivial) expect(await readFile(marker, 'utf8')).not.toBe('');
  } else {
    expect(outcome).toMatch(
      requirement === 'typo' ? /--requires must be/u : /Nested --hosts.*ios/u
    );
    await expect(readFile(marker, 'utf8')).rejects.toThrow(/ENOENT/u);
  }
  expect((await resourceQueueStatus(home)).occupied).toBe(0);
  expect(await hostLedger(home)).toEqual({ tickets: [], reservations: [] });
}
