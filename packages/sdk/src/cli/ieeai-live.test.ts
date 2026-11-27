import { afterEach, expect, it, vi } from 'vitest';
import { readCliConfig } from './config';
import { readLiveHandbookStats } from './ieeai-live';

vi.mock('./config', async (original) => ({
  ...(await original<typeof import('./config')>()),
  readCliConfig: vi.fn(),
}));
const accessToken = 'synthetic-cli-access-token';
const config = {
  baseUrl: 'https://tuturuuu.com',
  session: { accessToken, refreshToken: 'synthetic-refresh-token' },
};
const day = '2026-11-26';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it('sends the CLI bearer only to first-party Web and prints only aggregate fields', async () => {
  vi.mocked(readCliConfig).mockResolvedValue(config);
  const row = { day, lang: 'en', event: 'view', n: 5 };
  const fetch = vi.fn(async () =>
    Response.json({ rows: [{ ...row, user: 'discard' }], metadata: 'discard' })
  );
  vi.stubGlobal('fetch', fetch);
  expect(await readLiveHandbookStats(day, day)).toEqual({
    source: 'live',
    from: day,
    to: day,
    timezone: 'Asia/Ho_Chi_Minh',
    rows: [row],
  });
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    new URL(
      `https://tuturuuu.com/api/v1/ieeai/handbook/stats?from=${day}&to=${day}`
    ),
    expect.objectContaining({
      method: 'GET',
      redirect: 'error',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  );
});

it('rejects alternative origins without a request and refuses redirects without retry', async () => {
  const fetch = vi.fn(async () => Response.redirect('https://example.invalid'));
  vi.stubGlobal('fetch', fetch);
  vi.mocked(readCliConfig).mockResolvedValueOnce({
    ...config,
    baseUrl: 'https://example.invalid',
  });
  await expect(readLiveHandbookStats(day, day)).rejects.toThrow(
    'Log in to tuturuuu.com'
  );
  expect(fetch).not.toHaveBeenCalled();
  vi.mocked(readCliConfig).mockResolvedValueOnce(config);
  await expect(readLiveHandbookStats(day, day)).rejects.toThrow(
    'Unable to read'
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});
