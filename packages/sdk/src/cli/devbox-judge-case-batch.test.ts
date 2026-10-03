import { expect, it } from 'vitest';
import { runJudgeCaseBatch } from './devbox-judge-case-batch';

it('cancels queued cases and waits for active case cleanup before rejecting', async () => {
  let fail!: () => void;
  let finishCleanup!: () => void;
  const started: number[] = [];
  let rejected = false;
  const failure = new Error('Docker unavailable');
  const result = runJudgeCaseBatch(6, 2, async (index) => {
    started.push(index);
    if (index === 0) {
      await new Promise<void>((resolve) => {
        fail = resolve;
      });
      throw failure;
    }
    await new Promise<void>((resolve) => {
      finishCleanup = resolve;
    });
    return index;
  }).catch((error) => {
    rejected = true;
    return error;
  });
  await Promise.resolve();
  expect(started).toEqual([0, 1]);
  fail();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(started).toEqual([0, 1]);
  expect(rejected).toBe(false);
  finishCleanup();
  expect(await result).toBe(failure);
  expect(await runJudgeCaseBatch(2, 2, async (index) => index)).toEqual([0, 1]);
});
