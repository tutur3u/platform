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
