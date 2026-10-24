import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { atomicJson, readResourceConfig } from './resources-config';
import { resourceQueueStatus } from './resources-queue';
import {
  crossProcessTimeout,
  exists,
  privateFixtures,
  workerProbe,
} from './resources-test-fixtures';

vi.mock('node:os', async (original) => ({
  ...(await original<typeof import('node:os')>()),
  totalmem: () => 24 * 1024 ** 3,
  availableParallelism: () => 10,
}));
const fixture = privateFixtures(true);
afterEach(() => fixture.cleanup());
async function budgetHome(borrow: boolean) {
  const path = await fixture.home(4);
  const a = join(path, 'a');
  const b = join(path, 'b');
  const outside = join(path, 'outside');
  for (const cwd of [a, b, outside]) await mkdir(cwd);
  await atomicJson(join(path, 'config.json'), {
    ...(await readResourceConfig(path))!,
    validationLanes: 4,
    maxValidationLanes: 4,
    budget: {
      lanes: 4,
      tokens: 8,
      memoryGiB: 8,
      borrow,
      projects: [
        { id: 'a', roots: [a], lanes: 2, tokens: 4, memoryGiB: 4 },
        { id: 'b', roots: [b], lanes: 2, tokens: 4, memoryGiB: 4 },
      ],
    },
  });
  return { path, a, b, outside };
}

describe('project share admission', { timeout: crossProcessTimeout }, () => {
  it('starts an oversized non-borrower with flags, env and owner caps reduced to its share', async () => {
    const { path, a } = await budgetHome(false);
    const probe = await workerProbe(path, 'vitest');
    const job = fixture.launch(
      path,
      ['run', '--', probe, 'run', '--maxWorkers=6'],
      a
    );
    await job.until(() => exists(join(path, 'probe.json')));
    expect(
      JSON.parse(await readFile(join(path, 'probe.json'), 'utf8'))
    ).toMatchObject({
      args: ['run', '--maxWorkers=4'],
      vitest: '4',
      cargo: '4',
    });
    expect((await resourceQueueStatus(path, 4)).owners[0]).toMatchObject({
      demand: { project: 'a', tokens: 4, memoryGiB: 4 },
      limits: { vitestWorkers: 4, buildJobs: 4 },
    });
    await fixture.release(path, 'probe');
    expect((await job.done).code).toBe(0);
  });

  it('rejects an outside-root non-borrower before creating a waiting ticket', async () => {
    const { path, outside } = await budgetHome(false);
    const job = fixture.launch(
      path,
      ['run', '--', 'node', await fixture.held(path, 'outside')],
      outside
    );
    const result = await job.done;
    expect(result.code, result.err).toBe(1);
    expect(result.err).toMatch(/no usable project share.*borrowing is off/i);
    expect(await exists(join(path, 'outside.ready'))).toBe(false);
    expect((await resourceQueueStatus(path, 4)).waiting).toHaveLength(0);
  });

  it('drains for an older oversized borrower before admitting a younger in-share head', async () => {
    const { path, a, b } = await budgetHome(true);
    const run = async (cwd: string, name: string, tokens: number) =>
      fixture.launch(
        path,
        [
          'run',
          '--tokens',
          String(tokens),
          '--',
          'node',
          await fixture.held(path, name),
        ],
        cwd
      );
    const owner = await run(b, 'owner', 3);
    await owner.until(() => exists(join(path, 'owner.ready')));
    const older = await run(a, 'older', 6);
    await fixture.waiting(path, 1, [older]);
    const younger = await run(b, 'younger', 1);
    await younger.until(
      async () =>
        (await exists(join(path, 'younger.ready'))) ||
        (await resourceQueueStatus(path, 4)).waiting.length === 2
    );
    expect(await exists(join(path, 'younger.ready'))).toBe(false);
    expect((await resourceQueueStatus(path, 4)).budget!.used.tokens).toBe(3);
    await fixture.release(path, 'owner');
    expect((await owner.done).code).toBe(0);
    await older.until(() => exists(join(path, 'older.ready')));
    await younger.until(() => exists(join(path, 'younger.ready')));
    expect((await resourceQueueStatus(path, 4)).budget!.used.tokens).toBe(7);
    for (const name of ['older', 'younger']) await fixture.release(path, name);
    for (const job of [older, younger]) expect((await job.done).code).toBe(0);
  });
});
