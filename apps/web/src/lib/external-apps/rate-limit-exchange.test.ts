import { describe, expect, it, vi } from 'vitest';
import { fill, registerRateLimitStore, store } from './rate-limit-test-support';
import {
  admitExternalAppExchange,
  limitVerifiedExternalAppExchange,
  paceExternalAppExchangeFailure,
} from './exchange-rate-limit';

const IP = '203.0.113.7';
const source = (ip = IP, appId = 'yoola') => ({ appId, ip });
const admit = (ip?: string, appId?: string) =>
  admitExternalAppExchange(source(ip, appId));

describe('external-app token exchange limits', () => {
  registerRateLimitStore();

  it('admits an attempt with one count per app and IP', async () => {
    await expect(admit()).resolves.toBeNull();
    expect(store.calls).toEqual([
      `external-app:exchangeAttempt:app:yoola:ip:${IP}`,
    ]);
  });

  it('refuses attempts past the high per-app and per-IP ceiling', async () => {
    fill(`app:yoola:ip:${IP}`, 'exchangeAttempt');

    const limited = await admit();
    expect(limited?.status).toBe(429);
    expect(Number(limited?.headers.get('Retry-After'))).toBeGreaterThan(0);
    await expect(admit('203.0.113.8')).resolves.toBeNull();
    await expect(admit(IP, 'other')).resolves.toBeNull();
  });

  it('counts IPv6 clients per /64', async () => {
    await admit('2001:db8:1:2::1');
    await admit('2001:0db8:0001:0002:ffff::5');
    await admit('2001:db8:1:3::1');

    expect(new Set(store.calls)).toEqual(
      new Set(
        ['2001:0db8:0001:0002::/64', '2001:0db8:0001:0003::/64'].map(
          (prefix) =>
            `external-app:exchangeAttempt:app:yoola:ip:${encodeURIComponent(prefix)}`
        )
      )
    );
  });

  it('gives attempts without a trusted IP a separate per-app ceiling', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(admit('unknown')).resolves.toBeNull();
    expect(store.calls).toEqual(['external-app:exchangeUnknownIp:app:yoola']);
    expect(warn).toHaveBeenCalledWith(
      'External app token exchange has no trusted client IP',
      { appId: 'yoola', code: 'EXCHANGE_CLIENT_IP_UNKNOWN' }
    );

    fill('app:yoola', 'exchangeUnknownIp');
    expect((await admit('unknown'))?.status).toBe(429);
    await expect(admit('unknown', 'other')).resolves.toBeNull();
    await expect(admit()).resolves.toBeNull();
  });

  it('paces junk tokens without blocking valid exchanges from that IP', async () => {
    const answers: (number | null)[] = [];
    for (let index = 0; index < 40; index += 1) {
      const paced = await paceExternalAppExchangeFailure(source(), 'token');
      answers.push(paced?.status ?? null);
    }

    expect(answers.indexOf(429)).toBe(30);
    expect(answers.slice(30).every((answer) => answer === 429)).toBe(true);
    // A valid exchange from the same app server IP is still admitted.
    await expect(admit()).resolves.toBeNull();
    await expect(limitVerifiedExternalAppExchange('yoola')).resolves.toBeNull();
  });

  it('blocks a source that keeps failing the app secret', async () => {
    for (let index = 0; index < 30; index += 1) {
      await expect(
        paceExternalAppExchangeFailure(source(), 'secret')
      ).resolves.toBeNull();
    }
    expect(
      (await paceExternalAppExchangeFailure(source(), 'secret'))?.status
    ).toBe(429);

    const blocked = await admit();
    expect(blocked?.status).toBe(429);
    expect(Number(blocked?.headers.get('Retry-After'))).toBeGreaterThan(0);
    await expect(admit('203.0.113.8')).resolves.toBeNull();
    await expect(admit(IP, 'other')).resolves.toBeNull();
  });

  it('counts token exchanges of a verified app per app across IPs', async () => {
    await limitVerifiedExternalAppExchange('yoola');
    await limitVerifiedExternalAppExchange('yoola');

    expect(store.calls).toEqual([
      'external-app:exchange:app:yoola',
      'external-app:exchange:app:yoola',
    ]);
    fill('app:yoola', 'exchange');
    expect((await limitVerifiedExternalAppExchange('yoola'))?.status).toBe(429);
    await expect(limitVerifiedExternalAppExchange('other')).resolves.toBeNull();
  });

  it('fails closed while the limiter is unavailable', async () => {
    store.down = true;

    expect((await admit())?.status).toBe(503);
    expect((await limitVerifiedExternalAppExchange('yoola'))?.status).toBe(503);
  });
});
