import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const accessToken = vi.hoisted(() => vi.fn());
vi.mock('./repository', () => ({ accessToken }));

import type { ConnectedAccount } from './repository';
import { providerRequest } from './transport';

const account = { provider: 'microsoft', id: 'account' } as ConnectedAccount;
beforeEach(() => {
  vi.clearAllMocks();
  accessToken.mockResolvedValue('synthetic');
});
afterEach(() => vi.unstubAllGlobals());
it('retries an unauthorized read once with refreshed credentials and immutable ids', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(new Response('{}'));
  vi.stubGlobal('fetch', fetch);
  await providerRequest(account, '/messages');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(accessToken).toHaveBeenLastCalledWith(account, true);
  expect(fetch.mock.calls[0]?.[1].headers.get('Prefer')).toBe(
    'IdType="ImmutableId"'
  );
});
it('does not automatically replay mutations after provider errors', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
  vi.stubGlobal('fetch', fetch);
  await expect(
    providerRequest(account, '/sendMail', { method: 'POST' })
  ).rejects.toMatchObject({ status: 409 });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('rejects absolute and protocol-relative provider fetch targets', async () => {
  await expect(providerRequest(account, 'https://evil.test')).rejects.toThrow(
    'Invalid'
  );
  await expect(providerRequest(account, '//evil.test')).rejects.toThrow(
    'Invalid'
  );
  expect(accessToken).not.toHaveBeenCalled();
});

it('marks submission only after credentials are ready and before the actual provider fetch', async () => {
  const started = vi.fn();
  const fetch = vi.fn().mockImplementation(async () => {
    expect(started).toHaveBeenCalledTimes(1);
    return new Response(null, { status: 202 });
  });
  vi.stubGlobal('fetch', fetch);
  await providerRequest(account, '/sendMail', { method: 'POST' }, started);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('does not mark a mail submission when token refresh fails before fetch', async () => {
  const started = vi.fn();
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  accessToken.mockRejectedValueOnce(new Error('Refresh failed'));
  await expect(
    providerRequest(account, '/sendMail', { method: 'POST' }, started)
  ).rejects.toThrow('Refresh failed');
  expect(started).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it.each([401, 429, 500])(
  'retains actual provider response %s independently of public status mapping',
  async (responseStatus) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: responseStatus }))
    );
    await expect(
      providerRequest(account, '/sendMail', { method: 'POST' }, vi.fn())
    ).rejects.toMatchObject({ responseStatus });
    expect(fetch).toHaveBeenCalledTimes(1);
  }
);
