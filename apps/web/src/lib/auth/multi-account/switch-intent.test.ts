import { describe, expect, it } from 'vitest';
import { createSwitchIntentFence } from './switch-intent';

function barrier() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('shared switch intent fence', () => {
  it('drains a dispatched request and skips intermediate intents', async () => {
    const run = createSwitchIntentFence();
    const started = barrier();
    const finish = barrier();
    const dispatched: string[] = [];
    const published: string[] = [];
    const publish = async (value: string) => {
      published.push(value);
    };
    const first = run(async () => {
      dispatched.push('a');
      started.release();
      await finish.promise;
      return 'a';
    }, publish);
    await started.promise;
    const second = run(async () => {
      dispatched.push('b');
      return 'b';
    }, publish);
    const third = run(async () => {
      dispatched.push('c');
      return 'c';
    }, publish);
    finish.release();
    expect(await first).toEqual({ kind: 'stale' });
    expect(await second).toEqual({ kind: 'stale' });
    expect(await third).toEqual({ kind: 'current', value: 'c' });
    expect(dispatched).toEqual(['a', 'c']);
    expect(published).toEqual(['c']);
  });

  it('rechecks intent after asynchronous query publication', async () => {
    const run = createSwitchIntentFence();
    const publishing = barrier();
    const invalidate = barrier();
    const navigations: string[] = [];
    const first = run(
      async () => 'a',
      async (value, isCurrent) => {
        publishing.release();
        await invalidate.promise;
        if (isCurrent()) navigations.push(value);
      }
    );
    await publishing.promise;
    const second = run(
      async () => 'b',
      async (value) => {
        navigations.push(value);
      }
    );
    invalidate.release();
    await Promise.all([first, second]);
    expect(navigations).toEqual(['b']);
  });

  it('releases admission after transport failure without replaying', async () => {
    const run = createSwitchIntentFence();
    let calls = 0;
    await expect(
      run(
        async () => {
          calls++;
          throw new Error('lost response');
        },
        async () => {}
      )
    ).rejects.toThrow('lost response');
    expect(
      await run(
        async () => 'b',
        async () => {}
      )
    ).toEqual({ kind: 'current', value: 'b' });
    expect(calls).toBe(1);
  });
});
