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

it('admits eligible small reservations past a waiting full-budget case', async () => {
  let releaseFirst!: () => void;
  const first = withSandboxSlot(
    8,
    () =>
      new Promise<void>((resolve) => {
        releaseFirst = resolve;
      })
  );
  await Promise.resolve();
  const order: string[] = [];
  const full = withSandboxSlot(1, async () => {
    order.push('full');
  });
  const small = withSandboxSlot(8, async () => {
    order.push('small');
  });
  await small;
  expect(order).toEqual(['small']);
  releaseFirst();
  await Promise.all([first, full]);
  expect(order).toEqual(['small', 'full']);
});

it('never mixes a full host reservation with another job', async () => {
  let release!: () => void;
  const first = withSandboxSlot(
    1,
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      })
  );
  await Promise.resolve();
  let admitted = 0;
  const small = Array.from({ length: 8 }, () =>
    withSandboxSlot(8, async () => {
      admitted++;
    })
  );
  await Promise.resolve();
  expect(admitted).toBe(0);
  release();
  await Promise.all([first, ...small]);
  expect(admitted).toBe(8);
});

it('keeps admitting mixed-limit waves while another case keeps the host busy', async () => {
  let releaseAnchor!: () => void;
  const anchor = withSandboxSlot(
    16,
    () =>
      new Promise<void>((resolve) => {
        releaseAnchor = resolve;
      })
  );
  await Promise.resolve();
  let seed = 1;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  try {
    for (let wave = 0; wave < 80; wave++) {
      let available = 315; // 15/16 of a host, in units divisible by 3, 7 and 16.
      const limits: number[] = [];
      for (let candidate = 0; candidate < 20; candidate++) {
        const limit = [3, 7, 16][next() % 3]!;
        const units = 336 / limit;
        if (units <= available) {
          available -= units;
          limits.push(limit);
        }
      }
      let entered = 0;
      const releases: (() => void)[] = [];
      const abort = new AbortController();
      const tasks = limits.map((limit) =>
        withSandboxSlot(
          limit,
          () => {
            entered++;
            return new Promise<void>((resolve) => {
              releases.push(resolve);
            });
          },
          abort.signal
        )
      );
      try {
        await Promise.resolve();
        expect(
          entered,
          `wave ${wave} must fit alongside the active anchor`
        ).toBe(limits.length);
      } finally {
        abort.abort(new Error('wave cleanup'));
        while (releases.length)
          releases.splice(next() % releases.length, 1)[0]!();
        await Promise.allSettled(tasks);
      }
    }
    let entered = 0;
    const releases: (() => void)[] = [];
    const abort = new AbortController();
    const full = Array.from({ length: 15 }, () =>
      withSandboxSlot(
        16,
        () => {
          entered++;
          return new Promise<void>((resolve) => {
            releases.push(resolve);
          });
        },
        abort.signal
      )
    );
    try {
      await Promise.resolve();
      expect(entered).toBe(15);
    } finally {
      abort.abort(new Error('full wave cleanup'));
      for (const release of releases) release();
      await Promise.allSettled(full);
    }
  } finally {
    releaseAnchor();
    await anchor;
  }
});
