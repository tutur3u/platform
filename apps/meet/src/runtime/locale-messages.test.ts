import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  fetchLocaleMessages,
  LOCALE_MESSAGES_MAX_ATTEMPTS,
  localeMessagesRetryDelay,
  resetLocaleMessagesCache,
} from './locale-messages';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  resetLocaleMessagesCache();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function settle(thenable: Promise<unknown>) {
  await thenable.catch(() => undefined);
}

it('keeps a failed bundle cached so re-renders never refetch in a loop', async () => {
  fetchMock.mockResolvedValue(new Response('missing', { status: 404 }));
  const timers: Array<{ run: () => void; ms: number }> = [];
  const schedule = (run: () => void, ms: number) => timers.push({ run, ms });

  const first = fetchLocaleMessages('en', schedule);
  await settle(first);
  expect(first.status).toBe('rejected');
  // React re-renders after the rejection; each render must reuse it.
  for (let render = 0; render < 50; render += 1)
    expect(fetchLocaleMessages('en', schedule)).toBe(first);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(timers.map(({ ms }) => ms)).toEqual([localeMessagesRetryDelay(1)]);

  // Each backoff allows exactly one more attempt, up to the bound.
  for (let attempt = 2; attempt <= LOCALE_MESSAGES_MAX_ATTEMPTS; attempt += 1) {
    timers.shift()!.run();
    const retry = fetchLocaleMessages('en', schedule);
    expect(retry).not.toBe(first);
    await settle(retry);
  }
  expect(fetchMock).toHaveBeenCalledTimes(LOCALE_MESSAGES_MAX_ATTEMPTS);
  expect(timers).toEqual([]);
  const final = fetchLocaleMessages('en', schedule);
  expect(final.status).toBe('rejected');
  expect(fetchMock).toHaveBeenCalledTimes(LOCALE_MESSAGES_MAX_ATTEMPTS);
});

it('backs off exponentially between attempts', () => {
  expect([1, 2].map(localeMessagesRetryDelay)).toEqual([1000, 2000]);
});

it('fetches the bundle once and serves it from the cache', async () => {
  fetchMock.mockResolvedValue(Response.json({ common: { ok: 'OK' } }));
  const loaded = fetchLocaleMessages('vi');
  await expect(loaded).resolves.toEqual({ common: { ok: 'OK' } });
  expect(fetchLocaleMessages('vi')).toBe(loaded);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
