import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { atomicJson, readResourceConfig } from './resources-config';
import { resourceQueueStatus } from './resources-queue';
import {
  bun,
  exists,
  privateFixtures,
  processTimeout,
  until,
  workerProbe,
} from './resources-test-fixtures';

vi.mock('node:os', async (original) => ({
  ...(await original<typeof import('node:os')>()),
  totalmem: () => 24 * 1024 ** 3,
  availableParallelism: () => 10,
}));
const fixtures = privateFixtures(true);
const { home, held, launch, release } = fixtures;
afterEach(() => fixtures.cleanup());

// A miniature of the Studio policy, small enough to fill: 3 lanes and
// 4 tokens, project a holding 2 lanes / 2 tokens and b 1 lane / 2 tokens.
async function budgetHome() {
  const path = await home(3);
  const a = join(path, 'a');
  const b = join(path, 'b');
  await mkdir(a);
  await mkdir(b);
  const config = (await readResourceConfig(path))!;
  await atomicJson(join(path, 'config.json'), {
    ...config,
    validationLanes: 3,
    maxValidationLanes: 3,
    budget: {
      lanes: 3,
      tokens: 4,
      memoryGiB: 400,
      borrow: true,
      projects: [
        { id: 'a', roots: [a], lanes: 2, tokens: 2, memoryGiB: 200 },
        { id: 'b', roots: [b], lanes: 1, tokens: 2, memoryGiB: 200 },
      ],
    },
  });
  return { path, a, b };
}
const job = (path: string, cwd: string, tokens: number, command: string[]) =>
  launch(path, ['run', '--tokens', String(tokens), '--', ...command], cwd);
const budget = async (path: string) =>
  (await resourceQueueStatus(path, 3)).budget!;
const project = async (path: string, id: string) =>
  (await budget(path)).projects.find((entry) => entry.id === id)!;

describe('cross-project budget admission', { timeout: 60_000 }, () => {
  it('borrows idle share, reclaims it first for its owner, and caps workers by tokens', async () => {
    const { path, a, b } = await budgetHome();
    // a1 fills project a's token share and records its granted workers.
    const probe = await workerProbe(path, 'vitest', 'a1');
    const a1 = job(path, a, 2, [probe, 'run']);
    await until(() => exists(join(path, 'a1.json')));
    const granted = JSON.parse(await readFile(join(path, 'a1.json'), 'utf8'));
    expect(granted.vitest).toBe('2');
    expect(granted.args).toContain('--maxWorkers=2');
    // a2 exceeds a's share; b is idle, so it borrows and fills the budget.
    const a2 = job(path, a, 2, ['node', await held(path, 'a2')]);
    await until(() => exists(join(path, 'a2.ready')));
    expect((await project(path, 'a')).borrowing.tokens).toBe(2);
    expect((await budget(path)).used).toMatchObject({ lanes: 2, tokens: 4 });
    // a3 (older, would borrow again) and then b1 (inside b's share) queue.
    const a3 = job(path, a, 2, ['node', await held(path, 'a3')]);
    await until(async () => (await project(path, 'a')).waiting === 1);
    const b1 = job(path, b, 1, ['node', await held(path, 'b1')]);
    await until(async () => (await project(path, 'b')).waiting === 1);
    // The borrower ends: b reclaims its share ahead of the older a3, and a3
    // (2 more tokens) no longer fits, so it keeps waiting.
    await release(path, 'a2');
    expect((await a2.done).code).toBe(0);
    await until(() => exists(join(path, 'b1.ready')));
    expect(await exists(join(path, 'a3.ready'))).toBe(false);
    const reclaimed = await budget(path);
    expect(reclaimed.used).toMatchObject({ lanes: 2, tokens: 3 });
    expect(reclaimed.projects.find((entry) => entry.id === 'a')!.waiting).toBe(
      1
    );
    // When a1 ends, a3 fits a's own share again and is admitted.
    await release(path, 'a1');
    expect((await a1.done).code).toBe(0);
    await until(() => exists(join(path, 'a3.ready')));
    for (const name of ['a3', 'b1']) await release(path, name);
    for (const done of [a3, b1]) expect((await done.done).code).toBe(0);
    expect((await budget(path)).used).toMatchObject({ lanes: 0, tokens: 0 });
  });

  it('keeps reentrancy: a nested run inside an admitted job passes while the budget is full', async () => {
    const { path, a, b } = await budgetHome();
    const fill = [
      job(path, a, 2, ['node', await held(path, 'f1')]),
      job(path, b, 1, ['node', await held(path, 'f2')]),
    ];
    await until(() => exists(join(path, 'f1.ready')));
    await until(() => exists(join(path, 'f2.ready')));
    const nested = join(path, 'nested.json');
    const outer = await fixtures.script(
      path,
      'outer',
      `require('child_process').execFileSync(${JSON.stringify(bun)},[${JSON.stringify(join(path, 'fixture-shim.ts'))},'run','--','node','-e',${JSON.stringify(`require('fs').writeFileSync(${JSON.stringify(nested)},JSON.stringify({marker:process.env.TTR_RESOURCES_ADMITTED}))`)}],{stdio:'inherit',timeout:${processTimeout}});`
    );
    // The last lane: the outer job is admitted; its nested run must not queue.
    const result = await job(path, a, 1, ['node', outer]).done;
    expect(result.code, result.err).toBe(0);
    expect(JSON.parse(await readFile(nested, 'utf8')).marker).toBeTruthy();
    expect(result.err).not.toMatch(/queued PID/u);
    for (const name of ['f1', 'f2']) await release(path, name);
    for (const done of fill) await done.done;
  });
});
