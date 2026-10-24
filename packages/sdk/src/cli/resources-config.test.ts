import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import {
  atomicJson,
  defaultResourceConfig,
  laneResourceConfig,
  readResourceConfig,
  resourceLanes,
} from './resources-config';
import { resourceQueueStatus } from './resources-queue';
import {
  crossProcessTimeout,
  entry,
  privateFixtures,
} from './resources-test-fixtures';

const host = vi.hoisted(() => ({ memory: 24 * 1024 ** 3, cpus: 10 }));
vi.mock('node:os', async (original) => ({
  ...(await original<typeof import('node:os')>()),
  totalmem: () => host.memory,
  availableParallelism: () => host.cpus,
}));
const fixtures = privateFixtures();
const { home, laneLaunch: launch } = fixtures;
afterEach(async () => {
  await fixtures.cleanup();
  host.memory = 24 * 1024 ** 3;
  host.cpus = 10;
});

it('reads legacy configs as one lane, clamps numeric counts, and names bad fields', {
  timeout: crossProcessTimeout,
}, async () => {
  const path = await home();
  const old = defaultResourceConfig();
  delete old.validationLanes;
  await atomicJson(join(path, 'config.json'), old);
  expect(resourceLanes((await readResourceConfig(path))!)).toBe(1);
  const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  try {
    for (const [lanes, expected] of [
      [0, 1],
      [3, 3],
      [17, 16],
      [1.5, 1],
    ] as const) {
      await atomicJson(join(path, 'config.json'), {
        ...old,
        validationLanes: lanes,
      });
      expect(resourceLanes((await readResourceConfig(path))!)).toBe(expected);
    }
    expect(stderr.mock.calls.join('\n')).toContain(
      'validationLanes must be an integer from 1 to 16; using 16.'
    );
  } finally {
    stderr.mockRestore();
  }
  for (const lanes of ['2', null]) {
    await atomicJson(join(path, 'config.json'), {
      ...old,
      validationLanes: lanes,
    });
    await expect(readResourceConfig(path)).rejects.toThrow(
      'Invalid resource configuration: validationLanes must be an integer from 1 to 16.'
    );
  }
  for (const [raw, message] of [
    [
      '{"private-sentinel":',
      'Invalid resource configuration: config.json is not valid JSON.',
    ],
    [
      JSON.stringify({ ...old, validationLanes: 'private-sentinel' }),
      'Invalid resource configuration: validationLanes must be an integer from 1 to 16.',
    ],
    [
      JSON.stringify({ ...old, enabled: 'private-sentinel' }),
      'Invalid resource configuration: enabled must be true or false.',
    ],
  ] as const) {
    await writeFile(join(path, 'config.json'), raw);
    const result = await launch(path, ['status', '--json']).done;
    expect(result.code).toBe(1);
    expect(result.err.trim()).toContain(message);
    expect(result.err).not.toContain('private-sentinel');
  }
  await rm(join(path, 'config.json'));
  expect(await readResourceConfig(path)).toBeUndefined();
});
it('clamps two lanes on a low-budget host to one worker each instead of failing', {
  timeout: crossProcessTimeout,
}, async () => {
  const home = await fixtures.home();
  host.memory = 8 * 1024 ** 3;
  host.cpus = 2;
  expect(defaultResourceConfig().vitestWorkers).toBe(1);
  const config = (await readResourceConfig(home))!;
  expect(laneResourceConfig(config).vitestWorkers).toBe(1);
  const marker = join(home, 'workload');
  const result = await fixtures.launch(
    home,
    [
      'run',
      '--ignore-pressure',
      '--',
      'node',
      '-e',
      `require('fs').writeFileSync(${JSON.stringify(marker)},process.env.VITEST_MAX_WORKERS)`,
    ],
    home,
    entry,
    {},
    { memory: host.memory, cpus: host.cpus }
  ).done;
  expect(result.code, result.err).toBe(0);
  expect(result.err).toContain(
    'multi-lane worker totals must be at most 1 on this host; using 1.'
  );
  expect(await readFile(marker, 'utf8')).toBe('1');
  expect((await resourceQueueStatus(home, 2)).waiting).toHaveLength(0);
  const identity = JSON.parse(
    (await readFile(join(home, 'fixture-host.jsonl'), 'utf8')).trim()
  );
  expect([identity.memory, identity.cpus]).toEqual([8 * 1024 ** 3, 2]);
});
