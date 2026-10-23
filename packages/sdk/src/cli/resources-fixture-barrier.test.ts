import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  crossProcessTimeout,
  jsLiteral,
  until,
} from './resources-test-fixtures';

afterEach(() => vi.useRealTimers());
describe('resource fixture barrier', { timeout: crossProcessTimeout }, () => {
  it('serializes generated source literals without HTML or separator characters', () => {
    expect(jsLiteral('</script>\u2028\u2029')).toBe(
      '"\\u003c\\u002fscript\\u003e\\u2028\\u2029"'
    );
  });
  it('waits for its live producer within the test budget', async () => {
    vi.useFakeTimers();
    let ready = false;
    const waiting = until(
      async () => ready,
      [{ alive: () => true, diagnostics: () => 'slow producer' }]
    );
    void waiting.catch(() => {});
    await vi.advanceTimersByTimeAsync(40_000);
    ready = true;
    await vi.advanceTimersByTimeAsync(20);
    await waiting;
  });
  it('reports a dead producer even while an unrelated producer lives', async () => {
    vi.useFakeTimers();
    const unrelated = { alive: () => true, diagnostics: () => 'unrelated' };
    expect(await unrelated.alive()).toBe(true);
    const waiting = until(
      async () => false,
      [
        {
          alive: () => false,
          diagnostics: () => 'specific producer stderr: failed install',
        },
      ]
    );
    const rejected = expect(waiting).rejects.toThrow(
      'specific producer stderr: failed install'
    );
    await vi.advanceTimersByTimeAsync(1020);
    await rejected;
  });
  it('allows an unregistered descendant to finish during the settle window', async () => {
    vi.useFakeTimers();
    let drained = false;
    const waiting = until(async () => drained, []);
    void waiting.catch(() => {});
    await vi.advanceTimersByTimeAsync(800);
    drained = true;
    await vi.advanceTimersByTimeAsync(20);
    await waiting;
  });
  it('reports live producer diagnostics before the Vitest deadline', async () => {
    vi.useFakeTimers();
    const waiting = until(
      async () => false,
      [{ alive: () => true, diagnostics: () => 'producer still blocked' }]
    );
    const rejected = expect(waiting).rejects.toThrow(
      /deadline approaching.*producer still blocked/
    );
    await vi.advanceTimersByTimeAsync(44_020);
    await rejected;
  });
  it('accepts a final write after the producer exits', async () => {
    let checks = 0;
    await until(
      async () => ++checks > 1,
      [{ alive: () => false, diagnostics: () => 'exited' }]
    );
  });
});
