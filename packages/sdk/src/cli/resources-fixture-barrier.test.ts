import type { ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { privateFixtures, until } from './resources-test-fixtures';

// The barrier is causal: it waits as long as a fixture process that could
// still produce the awaited state is alive, and fails as soon as none is.
const fixtures = privateFixtures();
const producer = () => {
  const child = { exitCode: null, signalCode: null } as unknown as ChildProcess;
  fixtures.children.push(child);
  return child;
};
afterEach(() => {
  vi.useRealTimers();
  fixtures.children.splice(0);
});

describe('resource fixture barrier', () => {
  it('keeps waiting for a slow but live producer past any fixed deadline', async () => {
    vi.useFakeTimers();
    producer();
    let produced = false;
    const barrier = until(async () => produced);
    // A loaded runner (coverage, two workers) can take far longer than the
    // former 15 s wall-clock deadline; progress is what matters.
    await vi.advanceTimersByTimeAsync(40_000);
    produced = true;
    await vi.advanceTimersByTimeAsync(20);
    await expect(barrier).resolves.toBeUndefined();
  });

  it('fails promptly once every producer exited without reaching it', async () => {
    vi.useFakeTimers();
    const child = producer();
    const barrier = until(async () => false);
    const settled = expect(barrier).rejects.toThrow(
      /barrier is unreachable: every fixture process exited/u
    );
    await vi.advanceTimersByTimeAsync(100);
    Object.assign(child, { exitCode: 1 });
    await vi.advanceTimersByTimeAsync(20);
    await settled;
  });

  it('accepts state written just before the producer exited', async () => {
    const child = producer();
    let produced = false;
    let checks = 0;
    // The producer writes and exits between two checks.
    const barrier = until(async () => {
      checks += 1;
      if (checks === 2) {
        produced = true;
        Object.assign(child, { exitCode: 0 });
        return false;
      }
      return produced;
    });
    await expect(barrier).resolves.toBeUndefined();
  });
});
