import type { Dispatcher } from 'undici';
import { describe, expect, it, vi } from 'vitest';
import {
  closeManagedCronDispatcher,
  isPrivateManagedCronIp,
  type ManagedCronFetch,
  resolveSafeManagedCronAddress,
} from './network';

vi.mock('server-only', () => ({}));

function dispatcherForAddress(address: string) {
  return {
    address,
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as Dispatcher & { address: string };
}

describe('managed cron network guard', () => {
  it('blocks private and IPv4-mapped IPv6 addresses', async () => {
    expect(isPrivateManagedCronIp('127.0.0.1')).toBe(true);
    expect(isPrivateManagedCronIp('[::1]')).toBe(true);
    expect(isPrivateManagedCronIp('[::ffff:7f00:1]')).toBe(true);
    expect(isPrivateManagedCronIp('::ffff:169.254.169.254')).toBe(true);

    await expect(
      resolveSafeManagedCronAddress(new URL('https://[::ffff:7f00:1]/'))
    ).rejects.toThrow('public hostname');
    await expect(
      resolveSafeManagedCronAddress(
        new URL('https://hooks.example.com/'),
        async () => [{ address: '169.254.169.254', family: 4 }]
      )
    ).rejects.toThrow('private network');
  });

  it('uses the checked address and disables automatic redirects', async () => {
    const dispatcher = dispatcherForAddress('93.184.216.34');
    const fetchImpl: ManagedCronFetch = vi.fn(async (_url, init) => {
      expect(init.redirect).toBe('manual');
      expect(init.dispatcher).toBe(dispatcher);

      return new Response(null, {
        headers: { location: 'https://169.254.169.254/latest/meta-data/' },
        status: 302,
      });
    });

    const address = await resolveSafeManagedCronAddress(
      new URL('https://hooks.example.com/run'),
      vi.fn(async () => [{ address: '93.184.216.34', family: 4 }])
    );
    const abortController = new AbortController();
    const response = await fetchImpl(new URL('https://hooks.example.com/run'), {
      cache: 'no-store',
      dispatcher,
      headers: new Headers(),
      method: 'GET',
      redirect: 'manual',
      signal: abortController.signal,
    });

    await closeManagedCronDispatcher(dispatcher);

    expect(address.address).toBe('93.184.216.34');
    expect(response.status).toBe(302);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
