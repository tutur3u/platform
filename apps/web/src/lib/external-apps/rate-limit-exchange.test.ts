import { describe, expect, it, vi } from 'vitest';
import { fill, registerRateLimitStore, store } from './rate-limit-test-support';
import { limitExternalAppTokenExchange } from './rate-limit';

const exchange = (ip: string, appId = 'yoola') =>
  limitExternalAppTokenExchange({ appId, ip });

describe('external-app token exchange limit', () => {
  registerRateLimitStore();

  it('counts each exchange once per app and IP', async () => {
    await expect(exchange('203.0.113.7')).resolves.toBeNull();
    expect(store.calls).toEqual([
      'external-app:exchange:app:yoola:ip:203.0.113.7',
    ]);
  });

  it('answers 429 over the limit, keyed per app and IP', async () => {
    fill('app:yoola:ip:203.0.113.7', 'exchange');

    const limited = await exchange('203.0.113.7');
    expect(limited?.status).toBe(429);
    expect(Number(limited?.headers.get('Retry-After'))).toBeGreaterThan(0);
    await expect(exchange('203.0.113.8')).resolves.toBeNull();
    await expect(exchange('203.0.113.7', 'other')).resolves.toBeNull();
  });

  it('counts IPv6 clients per /64', async () => {
    await exchange('2001:db8:1:2::1');
    await exchange('2001:0db8:0001:0002:ffff::5');
    await exchange('2001:db8:1:3::1');

    expect(new Set(store.calls)).toEqual(
      new Set([
        `external-app:exchange:app:yoola:ip:${encodeURIComponent('2001:0db8:0001:0002::/64')}`,
        `external-app:exchange:app:yoola:ip:${encodeURIComponent('2001:0db8:0001:0003::/64')}`,
      ])
    );
  });

  it('gives exchanges without a trusted IP a separate per-app ceiling', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(exchange('unknown')).resolves.toBeNull();
    expect(store.calls).toEqual(['external-app:exchangeUnknownIp:app:yoola']);
    expect(warn).toHaveBeenCalledWith(
      'External app token exchange has no trusted client IP',
      { appId: 'yoola', code: 'EXCHANGE_CLIENT_IP_UNKNOWN' }
    );

    fill('app:yoola', 'exchangeUnknownIp');
    expect((await exchange('unknown'))?.status).toBe(429);
    await expect(exchange('unknown', 'other')).resolves.toBeNull();
    await expect(exchange('203.0.113.7')).resolves.toBeNull();
  });

  it('fails closed while the limiter is unavailable', async () => {
    store.down = true;

    expect((await exchange('203.0.113.7'))?.status).toBe(503);
  });
});
