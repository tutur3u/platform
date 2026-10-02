import { expect, it } from 'vitest';
import { withSandboxSlot } from './devbox-sandbox-slots';

it('bounds concurrent cases across jobs and releases failed slots', async () => {
  let active = 0;
  let maximum = 0;
  const tasks = Array.from({ length: 10 }, (_, index) =>
    withSandboxSlot(2, async () => {
      active++;
      maximum = Math.max(maximum, active);
      try {
        await new Promise((resolve) => setTimeout(resolve, 2));
        if (index === 2) throw new Error('case failed');
        return index;
      } finally {
        active--;
      }
    })
  );
  const results = await Promise.allSettled(tasks);
  expect(maximum).toBe(2);
  expect(active).toBe(0);
  expect(
    results.filter((result) => result.status === 'fulfilled')
  ).toHaveLength(9);
  expect(await withSandboxSlot(1, async () => 42)).toBe(42);
});
