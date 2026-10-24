import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  admissionResourceConfig,
  type BurstTelemetry,
  evaluateBurst,
} from './resources-adaptive';
import {
  atomicJson,
  defaultResourceConfig,
  hostLaneCeiling,
  laneResourceConfig,
  readResourceConfig,
  resourceMaxLanes,
} from './resources-config';
import { resourceQueueStatus } from './resources-queue';
import { setupResources } from './resources-setup';
import { newOwner, occupancy, type ResourceOwner } from './resources-slots';
import {
  bun,
  crossProcessTimeout,
  exists,
  privateFixtures,
  realNode,
} from './resources-test-fixtures';

vi.mock('node:os', async (original) => ({
  ...(await original<typeof import('node:os')>()),
  totalmem: () => 24 * 1024 ** 3,
  availableParallelism: () => 10,
}));
const gib = 1024 ** 3;
const normal: BurstTelemetry = {
  platform: 'darwin',
  cpus: 10,
  load: 1,
  totalMemory: 24 * gib,
  pressureLevel: 1,
};
const fixtures = privateFixtures();
const jobs = new Map<string, ReturnType<typeof fixtures.laneLaunch>>();
const queueModule = resolve('src/cli/resources-queue.ts');
const adaptiveModule = resolve('src/cli/resources-adaptive.ts');
afterEach(async () => {
  await fixtures.cleanup();
  jobs.clear();
});

async function home(base: 1 | 2 = 1, max = 3, workers = 3) {
  const path = await fixtures.home(base);
  await atomicJson(join(path, 'config.json'), {
    ...defaultResourceConfig(),
    roots: [path],
    validationLanes: base,
    maxValidationLanes: max,
    vitestWorkers: workers,
    buildJobs: workers,
  });
  await atomicJson(join(path, 'telemetry.json'), normal);
  return path;
}
async function run(
  path: string,
  name: string,
  options: { ignorePressure?: boolean; mutate?: string } = {}
) {
  await fixtures.held(path, name);
  const runner = join(path, `${name}.ts`);
  await writeFile(
    runner,
    `
    import {mock} from 'bun:test';import * as timers from 'node:timers/promises';
    import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
    const path=${JSON.stringify(path)},name=${JSON.stringify(name)};
    const sleep=timers.setTimeout;
    mock.module('node:timers/promises',()=>({...timers,setTimeout:(ms,...args)=>sleep(ms===5000?50:ms,...args)}));
    const {queuedResourceCommand}=await import(${JSON.stringify(queueModule)});
    const {evaluateBurst}=await import(${JSON.stringify(adaptiveModule)});
    process.exitCode=await queuedResourceCommand(path,${JSON.stringify(realNode)},[path+'/'+name+'.cjs'],process.env,${Boolean(options.ignorePressure)},JSON.parse(readFileSync(path+'/config.json')).validationLanes,
      async()=>({blocked:false,reason:null}),async()=>{
        appendFileSync(path+'/'+name+'.checked','probe\\n');
        ${options.mutate || ''}
        return evaluateBurst(JSON.parse(readFileSync(path+'/telemetry.json')),8*1024**3);
      });
  `
  );
  const job = fixtures.laneLaunch(path, [name], runner);
  jobs.set(join(path, name), job);
  return job;
}
function waitForProbe(path: string, name: string, extension: string) {
  const job = jobs.get(join(path, name));
  if (!job) throw new Error(`No fixture producer for ${name}`);
  return job.until(() => exists(join(path, `${name}.${extension}`)));
}
const ready = (path: string, name: string) => waitForProbe(path, name, 'ready');
const checked = (path: string, name: string) =>
  waitForProbe(path, name, 'checked');
async function finish(
  path: string,
  name: string,
  child: Awaited<ReturnType<typeof run>>
) {
  await fixtures.release(path, name);
  const result = await child.done;
  expect(result.code, result.err).toBe(0);
}

describe('pure burst telemetry decision', () => {
  it('requires normal macOS pressure and load below 0.7 per CPU', () => {
    expect(evaluateBurst(normal, 8 * gib).eligible).toBe(true);
    for (const pressureLevel of [0, 2, 4, undefined, NaN])
      expect(
        evaluateBurst({ ...normal, pressureLevel }, 8 * gib).eligible
      ).toBe(false);
    for (const load of [7, 10, undefined, NaN, -1])
      expect(evaluateBurst({ ...normal, load }, 8 * gib).eligible).toBe(false);
    expect(evaluateBurst({ ...normal, cpus: 0 }, 8 * gib).eligible).toBe(false);
    expect(
      evaluateBurst({ ...normal, totalMemory: NaN }, 8 * gib).eligible
    ).toBe(false);
    expect(
      evaluateBurst({ ...normal, platform: 'unknown' }, 8 * gib).eligible
    ).toBe(false);
  });
  it('requires Linux available memory at both the 25% reserve and lane estimate', () => {
    const linux = { ...normal, platform: 'linux', totalMemory: 64 * gib };
    expect(
      evaluateBurst({ ...linux, availableMemory: 16 * gib }, 8 * gib).eligible
    ).toBe(true);
    expect(
      evaluateBurst({ ...linux, availableMemory: 15 * gib }, 8 * gib).eligible
    ).toBe(false);
    expect(
      evaluateBurst({ ...linux, availableMemory: 16 * gib }, 20 * gib).eligible
    ).toBe(false);
    for (const availableMemory of [undefined, NaN, -1])
      expect(
        evaluateBurst({ ...linux, availableMemory }, 8 * gib).eligible
      ).toBe(false);
  });
});

describe('adaptive configuration and budgets', {
  timeout: crossProcessTimeout,
}, () => {
  it('keeps absent maximum equal to base and clamps out-of-range maxima', async () => {
    const path = await fixtures.home(2);
    const config = (await readResourceConfig(path))!;
    expect(resourceMaxLanes(config)).toBe(2);
    for (const [maxValidationLanes, expected] of [
      [1, 2],
      [17, 16],
      [2.5, 2],
    ] as const) {
      await atomicJson(join(path, 'config.json'), {
        ...config,
        maxValidationLanes,
      });
      expect(resourceMaxLanes((await readResourceConfig(path))!)).toBe(
        expected
      );
    }
    for (const maxValidationLanes of ['3', null]) {
      await atomicJson(join(path, 'config.json'), {
        ...config,
        maxValidationLanes,
      });
      await expect(readResourceConfig(path)).rejects.toThrow(
        'maxValidationLanes must be an integer from 1 to 16'
      );
    }
    await atomicJson(join(path, 'config.json'), {
      ...config,
      maxValidationLanes: 8,
    });
    expect(resourceMaxLanes((await readResourceConfig(path))!)).toBe(8);
  });
  it('reserves bounded caps and accounts for recorded allocations', () => {
    const config = {
      ...defaultResourceConfig(),
      maxValidationLanes: 3,
      vitestWorkers: 3,
      buildJobs: 3,
    };
    const owners: ResourceOwner[] = [];
    for (let i = 0; i < 3; i++) {
      const caps = admissionResourceConfig(config, owners)!;
      expect([
        caps.vitestWorkers,
        caps.buildJobs,
        caps.turboConcurrency,
      ]).toEqual([1, 1, 1]);
      owners.push({ ...newOwner('fixture'), limits: caps });
    }
    expect(admissionResourceConfig(config, owners)).toBeUndefined();
    expect(
      owners.reduce((sum, owner) => sum + (owner.limits?.vitestWorkers ?? 0), 0)
    ).toBe(3);
    // A spent aggregate budget still admits a pressure-gated lane with one worker.
    for (const owner of [
      { ...newOwner('old'), limits: { vitestWorkers: 3, buildJobs: 3 } },
      newOwner('missing-caps'),
    ])
      expect(admissionResourceConfig(config, [owner])).toMatchObject({
        vitestWorkers: 1,
        buildJobs: 1,
      });
    expect(
      laneResourceConfig({ ...config, vitestWorkers: 4 }).vitestWorkers
    ).toBe(1);
  });
  it('keeps fixed setups fixed when reducing base lanes and preserves explicit adaptive ceilings', async () => {
    const path = await home(2, 2, 2);
    const options = {
      home: path,
      roots: [],
      shell: 'none',
      lanes: 1 as const,
      dryRun: true,
    };
    expect((await setupResources(options))?.config.maxValidationLanes).toBe(1);
    const config = (await readResourceConfig(path))!;
    delete config.maxValidationLanes;
    await atomicJson(join(path, 'config.json'), config);
    expect((await setupResources(options))?.config.maxValidationLanes).toBe(1);
    await atomicJson(join(path, 'config.json'), {
      ...config,
      maxValidationLanes: 3,
    });
    expect((await setupResources(options))?.config.maxValidationLanes).toBe(3);
    expect(
      (await setupResources({ ...options, maxLanes: 1 }))?.config
        .maxValidationLanes
    ).toBe(1);
  });
  it('bounds lanes by the host ceiling when the maximum exceeds both totals', () => {
    const config = {
      ...defaultResourceConfig(),
      maxValidationLanes: 8,
      vitestWorkers: 3,
      buildJobs: 2,
    };
    // 24 GiB / 10 CPUs: min(8, 24 / 4, 10 - 2) = 6 lanes.
    expect(hostLaneCeiling()).toBe(6);
    const owners: ResourceOwner[] = [];
    for (let i = 0; i < 6; i++) {
      const caps = admissionResourceConfig(config, owners)!;
      expect([caps.vitestWorkers, caps.buildJobs]).toEqual([1, 1]);
      owners.push({ ...newOwner(`lane-${i}`), limits: caps });
    }
    expect(admissionResourceConfig(config, owners)).toBeUndefined();
  });
  it('requires idle owners and zero waiters to change the ceiling', async () => {
    const path = await home(1, 1, 2);
    const before = await readFile(join(path, 'config.json'), 'utf8');
    const a = await run(path, 'a');
    await ready(path, 'a');
    for (const dryRun of [true, false])
      await expect(
        setupResources({
          home: path,
          roots: [],
          shell: 'none',
          maxLanes: 3,
          dryRun,
        })
      ).rejects.toThrow('drain');
    await finish(path, 'a', a);
    await atomicJson(join(path, 'queue', '0.json'), newOwner('waiter'));
    await expect(
      setupResources({ home: path, roots: [], shell: 'none', maxLanes: 3 })
    ).rejects.toThrow('drain');
    expect(await readFile(join(path, 'config.json'), 'utf8')).toBe(before);
    await rm(join(path, 'queue', '0.json'));
    await expect(
      setupResources({ home: path, roots: [], shell: 'none', maxLanes: 0 })
    ).rejects.toThrow('--max-lanes');
    const setup = await fixtures.laneLaunch(path, [
      'setup',
      '--shell',
      'none',
      '--max-lanes',
      '3',
      '--workers',
      '3',
      '--json',
    ]).done;
    expect(setup.code, setup.err).toBe(0);
    expect(JSON.parse(setup.out).config.maxValidationLanes).toBe(3);
    expect((await readResourceConfig(path))?.maxValidationLanes).toBe(3);
  });
  it.each(['2', '3', '8', '-1', '01', 'unexpected'])(
    'fails closed on unknown or out-of-range slot %s',
    async (name) => {
      const path = await home(1, 2, 2);
      await mkdir(join(path, 'slots', name), { recursive: true });
      await expect(occupancy(path)).rejects.toThrow('Unknown resource slot');
      await expect(occupancy(path, true)).rejects.toThrow(
        'Unknown resource slot'
      );
    }
  );
});

describe('adaptive queue admission', { timeout: crossProcessTimeout }, () => {
  it('keeps fixed base capacity and caps unchanged without probing burst', async () => {
    const path = await home(2, 2, 2);
    const a = await run(path, 'a');
    const b = await run(path, 'b');
    await ready(path, 'a');
    await ready(path, 'b');
    const c = await run(path, 'c');
    await fixtures.waiting(path, 1, [c]);
    expect(await exists(join(path, 'c.checked'))).toBe(false);
    expect(await exists(join(path, 'c.ready'))).toBe(false);
    await finish(path, 'a', a);
    await ready(path, 'c');
    await finish(path, 'b', b);
    await finish(path, 'c', c);
  });
  it('admits three unstressed jobs, uses slot 2, and bounds aggregate owner caps', async () => {
    const path = await home();
    const children = [];
    for (const name of ['a', 'b', 'c']) {
      children.push(await run(path, name));
      await ready(path, name);
    }
    const state = await resourceQueueStatus(path);
    expect([state.baseLanes, state.maxLanes, state.occupied]).toEqual([
      1, 3, 3,
    ]);
    expect(state.owner).toEqual(state.owners[0]);
    expect(state.burst.eligible).toBe(false);
    expect(await exists(join(path, 'slots', '2', 'owner.json'))).toBe(true);
    expect(
      state.owners.reduce((sum, owner) => sum + owner.limits!.vitestWorkers, 0)
    ).toBe(3);
    expect(
      state.owners.reduce((sum, owner) => sum + owner.limits!.buildJobs, 0)
    ).toBe(3);
    await finish(path, 'a', children[0]!);
    await finish(path, 'b', children[1]!);
    await finish(path, 'c', children[2]!);
  });
  it.each([
    { label: 'pressure', telemetry: { ...normal, pressureLevel: 2 } },
    { label: 'load', telemetry: { ...normal, load: 8 } },
    {
      label: 'missing pressure',
      telemetry: { ...normal, pressureLevel: undefined },
    },
    { label: 'missing load', telemetry: { ...normal, load: undefined } },
  ])(
    'refuses burst for $label while base admits, even with ignore-pressure',
    async ({ telemetry }) => {
      const path = await home();
      await atomicJson(join(path, 'telemetry.json'), telemetry);
      const a = await run(path, 'a');
      await ready(path, 'a');
      const b = await run(path, 'b', { ignorePressure: true });
      await checked(path, 'b');
      expect(await exists(join(path, 'b.ready'))).toBe(false);
      await finish(path, 'a', a);
      await ready(path, 'b');
      await finish(path, 'b', b);
    }
  );
  it('preserves FIFO when a blocked burst head precedes another waiter and re-probes', async () => {
    const path = await home(1, 2, 2);
    const a = await run(path, 'a');
    await ready(path, 'a');
    await atomicJson(join(path, 'telemetry.json'), { ...normal, load: 9 });
    const b = await run(path, 'b');
    await checked(path, 'b');
    const c = await run(path, 'c');
    await fixtures.waiting(path, 2, [c]);
    expect(await exists(join(path, 'c.checked'))).toBe(false);
    await atomicJson(join(path, 'telemetry.json'), normal);
    await ready(path, 'b');
    expect(await exists(join(path, 'c.ready'))).toBe(false);
    expect(
      (await readFile(join(path, 'b.checked'), 'utf8')).trim().split('\n')
        .length
    ).toBeGreaterThan(1);
    await finish(path, 'b', b);
    await ready(path, 'c');
    await finish(path, 'a', a);
    await finish(path, 'c', c);
  });
  it('inherits adaptive owner caps in nested commands and ignores inflated env caps', async () => {
    const path = await home();
    const runner = join(path, 'nested.ts');
    const inner = join(path, 'inner.ts');
    const result = join(path, 'nested.json');
    await writeFile(
      inner,
      `
      import {queuedResourceCommand} from ${JSON.stringify(queueModule)};
      process.exitCode=await queuedResourceCommand(${JSON.stringify(path)},${JSON.stringify(realNode)},['-e',${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(result)}, JSON.stringify({vitest:process.env.VITEST_MAX_WORKERS,cargo:process.env.CARGO_BUILD_JOBS,turbo:process.env.TURBO_CONCURRENCY}));`)}],{...process.env,VITEST_MAX_WORKERS:'64',CARGO_BUILD_JOBS:'64'},false,1);
    `
    );
    await writeFile(
      runner,
      `
      import {queuedResourceCommand} from ${JSON.stringify(queueModule)};
      process.exitCode=await queuedResourceCommand(${JSON.stringify(path)},${JSON.stringify(bun)},[${JSON.stringify(inner)}],process.env,false,1,async()=>({blocked:false,reason:null}),async()=>({eligible:true,reason:'fixture'}));
    `
    );
    const child = await fixtures.laneLaunch(path, [], runner).done;
    expect(child.code, child.err).toBe(0);
    expect(JSON.parse(await readFile(result, 'utf8'))).toEqual({
      vitest: '1',
      cargo: '1',
      turbo: '1',
    });
    expect((await resourceQueueStatus(path)).occupied).toBe(0);
  });
  it('admits burst lanes past worker totals up to the maximum and reports CLI status fields', async () => {
    const path = await home(1, 3, 2);
    const a = await run(path, 'a');
    await ready(path, 'a');
    const b = await run(path, 'b');
    await ready(path, 'b');
    const c = await run(path, 'c');
    await ready(path, 'c');
    const d = await run(path, 'd');
    await fixtures.waiting(path, 1, [d]);
    expect(await exists(join(path, 'd.ready'))).toBe(false);
    const result = await fixtures.laneLaunch(path, ['status', '--json']).done;
    expect(result.code, result.err).toBe(0);
    const status = JSON.parse(result.out);
    expect([
      status.laneCount,
      status.baseLanes,
      status.maxLanes,
      status.effectiveLanes,
      status.occupied,
    ]).toEqual([1, 1, 3, 3, 3]);
    expect(status.owner).toEqual(status.owners[0]);
    expect(status.waiting).toHaveLength(1);
    expect(status.limits.vitestWorkers).toBe(2);
    expect(
      status.owners.map(
        (owner: ResourceOwner) =>
          [owner.limits?.vitestWorkers, owner.limits?.buildJobs] as const
      )
    ).toEqual([
      [1, 1],
      [1, 1],
      [1, 1],
    ]);
    expect(status.burst).toEqual({
      eligible: false,
      reason: 'Burst lanes are full or above the host lane ceiling',
    });
    expect(status.ownerDetails).toHaveLength(3);
    expect(status.waitingDetails).toHaveLength(1);
    await finish(path, 'a', a);
    await ready(path, 'd');
    await finish(path, 'b', b);
    await finish(path, 'c', c);
    await finish(path, 'd', d);
  });
  it('rechecks policy after the async burst probe before claiming', async () => {
    const path = await home();
    const a = await run(path, 'a');
    await ready(path, 'a');
    const b = await run(path, 'b', {
      mutate:
        "const config=JSON.parse(readFileSync(path+'/config.json'));config.maxValidationLanes=2;writeFileSync(path+'/config.json',JSON.stringify(config));",
    });
    const result = await b.done;
    expect(result.code).toBe(1);
    expect(result.err).toContain('policy changed');
    expect(await exists(join(path, 'b.ready'))).toBe(false);
    await finish(path, 'a', a);
  });
  it('rechecks occupancy after the async burst probe before claiming', async () => {
    const path = await home(1, 2, 2);
    const a = await run(path, 'a');
    await ready(path, 'a');
    const b = await run(path, 'b', {
      mutate:
        "const fs=await import('node:fs/promises');await fs.mkdir(path+'/slots/1',{recursive:true});",
    });
    await checked(path, 'b');
    await fixtures.waiting(path, 1, [b]);
    expect(await exists(join(path, 'b.ready'))).toBe(false);
    b.child.kill('SIGTERM');
    expect((await b.done).code).toBe(143);
    await rm(join(path, 'slots', '1'), { recursive: true });
    await finish(path, 'a', a);
  });
});
