import type { BrowserContext } from '@playwright/test';
import { afterEach, expect, test, vi } from 'vitest';
import { withLettinContextCleanup } from '../../e2e/helpers/lettin-context-cleanup';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const context = (close: () => Promise<void>) =>
  ({ close }) as unknown as BrowserContext;

test('cleanup failure cannot replace the original assertion and its logs are safe', async () => {
  const original = new Error('original assertion');
  const closeError = new Error('private-token https://private.test');
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await expect(
    withLettinContextCleanup(
      context(async () => {
        throw closeError;
      }),
      async () => {
        throw original;
      }
    )
  ).rejects.toBe(original);
  expect(warn.mock.calls).toEqual([
    [
      '[lettin-e2e] close import context: failed',
      { name: 'Error', message: 'operation failed' },
    ],
  ]);
});

test('a successful assertion still fails when owned context cleanup fails', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const failure = new Error('failed close');
  await expect(
    withLettinContextCleanup(
      context(async () => {
        throw failure;
      }),
      async () => 'passed'
    )
  ).rejects.toBe(failure);
});

test('hung cleanup is bounded and retains the primary error', async () => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const original = new Error('assertion');
  const result = expect(
    withLettinContextCleanup(
      context(() => new Promise(() => {})),
      async () => {
        throw original;
      }
    )
  ).rejects.toBe(original);
  await vi.advanceTimersByTimeAsync(10_000);
  await result;
  expect(vi.getTimerCount()).toBe(0);
});
