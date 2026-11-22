import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { fill, registerRateLimitStore, store } from './rate-limit-test-support';
import {
  admitExternalAppExchange,
  limitVerifiedExternalAppExchange,
  paceExternalAppExchangeFailure,
} from './exchange-rate-limit';

const IP = '203.0.113.7';
const SECRET = 'ttr_app_valid_secret';
const source = (
  overrides: Partial<{ appId: string; appSecret: string; ip: string }> = {}
) => ({ appId: 'yoola', appSecret: SECRET, ip: IP, ...overrides });
const subkey = createHmac('sha256', 'test-secret')
  .update('tuturuuu/external-app-exchange-admission/v1')
  .digest();
const secretDigest = (secret: string) =>
  createHmac('sha256', subkey).update(secret).digest('base64url');
const admissionKey = (secret = SECRET, appId = 'yoola') =>
  `app:${appId}:secret:${secretDigest(secret)}`;

describe('external-app token exchange limits', () => {
  registerRateLimitStore();

  it('admits per app and keyed secret digest, never the raw secret', async () => {
    await expect(admitExternalAppExchange(source())).resolves.toBeNull();
    await admitExternalAppExchange(source({ appSecret: undefined }));

    expect(store.calls).toEqual([
      `external-app:exchangeAttempt:${admissionKey()}`,
      'external-app:exchangeAttempt:app:yoola:secret:none',
    ]);
    expect(store.calls.join()).not.toContain(SECRET);
  });

  it('keys the digest with a derived subkey, not the signing key', async () => {
    await admitExternalAppExchange(source());

    const underSigningKey = createHmac('sha256', 'test-secret')
      .update(SECRET)
      .digest('base64url');
    expect(store.calls[0]).toContain(secretDigest(SECRET));
    expect(store.calls[0]).not.toContain(underSigningKey);
    expect(secretDigest(SECRET)).not.toBe(underSigningKey);
  });

  it('never limits a valid caller behind a flood of wrong secrets', async () => {
    for (let index = 0; index < 700; index += 1) {
      await admitExternalAppExchange(source({ appSecret: `wrong-${index}` }));
    }
    fill(`app:yoola:secret:${secretDigest('wrong-0')}`, 'exchangeAttempt');
    expect(
      (await admitExternalAppExchange(source({ appSecret: 'wrong-0' })))?.status
    ).toBe(429);

    await expect(admitExternalAppExchange(source())).resolves.toBeNull();
  });

  it('refuses a valid caller past 600 attempts per minute', async () => {
    for (let index = 0; index < 600; index += 1) {
      await expect(admitExternalAppExchange(source())).resolves.toBeNull();
    }

    const limited = await admitExternalAppExchange(source());
    expect(limited?.status).toBe(429);
    expect(Number(limited?.headers.get('Retry-After'))).toBeGreaterThan(0);
    await expect(
      admitExternalAppExchange(source({ appId: 'other' }))
    ).resolves.toBeNull();
  });

  it.each([IP, 'unknown'])(
    'answers 429 only to failed secrets from %s, never to a valid exchange',
    async (ip) => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const answers: (number | null)[] = [];
      for (let index = 0; index < 31; index += 1) {
        const paced = await paceExternalAppExchangeFailure(
          source({ appSecret: 'wrong', ip }),
          'secret'
        );
        answers.push(paced?.status ?? null);
      }

      expect(answers.indexOf(429)).toBe(30);
      await expect(
        admitExternalAppExchange(source({ ip }))
      ).resolves.toBeNull();
      await expect(
        limitVerifiedExternalAppExchange('yoola')
      ).resolves.toBeNull();
    }
  );

  it('paces failed tokens per app and IPv6 /64 without touching admission', async () => {
    for (let index = 0; index < 30; index += 1) {
      await paceExternalAppExchangeFailure(
        source({ ip: '2001:db8:1:2::1' }),
        'token'
      );
    }

    expect(
      (
        await paceExternalAppExchangeFailure(
          source({ ip: '2001:0db8:0001:0002:ffff::5' }),
          'token'
        )
      )?.status
    ).toBe(429);
    await expect(
      paceExternalAppExchangeFailure(source({ ip: '2001:db8:1:3::1' }), 'token')
    ).resolves.toBeNull();
    expect(store.calls.some((key) => key.includes('exchangeAttempt'))).toBe(
      false
    );
  });

  it('logs a fixed code without the IP when no trusted IP is known', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await paceExternalAppExchangeFailure(source({ ip: 'unknown' }), 'token');

    expect(warn).toHaveBeenCalledWith(
      'External app token exchange has no trusted client IP',
      { appId: 'yoola', code: 'EXCHANGE_CLIENT_IP_UNKNOWN' }
    );
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

    expect((await admitExternalAppExchange(source()))?.status).toBe(503);
    expect((await limitVerifiedExternalAppExchange('yoola'))?.status).toBe(503);
  });
});
