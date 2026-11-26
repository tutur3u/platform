import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  ip: '198.51.100.7',
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    ttl: vi.fn(),
  },
  redisAvailable: true,
  storeRequired: true,
  verifySecret: vi.fn(),
}));

vi.mock('@tuturuuu/utils/abuse-protection/edge', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@tuturuuu/utils/abuse-protection/edge')
  >()),
  extractIPFromRequest: () => mocks.ip,
}));
vi.mock('@/lib/external-apps/rate-limit-core', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/external-apps/rate-limit-core')
  >()),
  consume: mocks.consume,
  counterStoreRequired: () => mocks.storeRequired,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  getRedisClient: async () => (mocks.redisAvailable ? mocks.redis : null),
}));
vi.mock('@/lib/integrations/upskii/rate-limit', () => ({
  admitAccountLinkRequest: vi.fn(async () => null),
  limitVerifiedAccountLinkRequest: vi.fn(async () => null),
}));
vi.mock('@/lib/external-apps/exchange-rate-limit', () => ({
  paceExternalAppExchangeFailure: vi.fn(async () => null),
}));
vi.mock('@/lib/app-coordination/external-apps', () => ({
  verifyExternalAppSecret: mocks.verifySecret,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({})),
}));

const { requireUpskiiAppCredentials } = await import('./access');
const { resetUpskiiAuthSourceNoteForTests, upskiiAuthSource } =
  await import('./auth-failure');

function request(authorization?: string, headers: Record<string, string> = {}) {
  return new NextRequest(
    'https://tuturuuu.com/api/v1/integrations/upskii/unlink',
    {
      headers: { ...headers, ...(authorization ? { authorization } : {}) },
      method: 'POST',
    }
  );
}

const basic = (secret: string, appId = 'upskii') =>
  `Basic ${btoa(`${appId}:${secret}`)}`;

const tooMany = () =>
  new Response(null, { headers: { 'Retry-After': '420' }, status: 429 });

/** The secret currently configured on the platform side. */
let platformSecret = 'right';

async function call(secret: string) {
  return requireUpskiiAppCredentials(request(basic(secret)), 'unlink');
}

function status(result: Awaited<ReturnType<typeof call>>) {
  return result.ok ? 200 : result.response.status;
}

describe('Upskii Basic credential failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ip = '198.51.100.7';
    mocks.redisAvailable = true;
    mocks.storeRequired = true;
    platformSecret = 'right';
    mocks.redis.get.mockResolvedValue(null);
    mocks.redis.set.mockResolvedValue('OK');
    mocks.redis.ttl.mockResolvedValue(300);
    mocks.consume.mockResolvedValue(null);
    mocks.verifySecret.mockImplementation(async ({ appSecret }) =>
      appSecret === platformSecret
        ? { app: {}, ok: true }
        : { error: 'bad', ok: false }
    );
  });

  it('refuses a locked source and client id before checking the secret', async () => {
    mocks.redis.get.mockResolvedValue('1');

    const result = await call('right');

    expect(status(result)).toBe(429);
    if (!result.ok)
      expect(result.response.headers.get('Retry-After')).toBe('300');
    expect(mocks.redis.get).toHaveBeenCalledWith(
      expect.stringMatching(
        /^ratelimit:external-app:account-link:auth-lock:198\.51\.100\.7:app:upskii$/u
      )
    );
    expect(mocks.verifySecret).not.toHaveBeenCalled();
  });

  it.each([
    ['a wrong secret', basic('wrong'), 'upskii'],
    ['another app id', basic('x', 'other-app'), 'other-app'],
    ['a malformed header', 'Basic !!!', 'none'],
    ['no header', undefined, 'none'],
  ])('counts %s per source and per client id', async (_label, auth, appId) => {
    const result = await requireUpskiiAppCredentials(request(auth), 'unlink');

    expect(status(result)).toBe(401);
    const keys = mocks.consume.mock.calls.map(([counters]) => [
      counters[0].bucket,
      counters[0].key,
      counters[0].failClosed,
    ]);
    expect(keys).toEqual([
      [
        'accountLinkAuthFailureSource',
        `external-app:account-link:auth-failure:source:198.51.100.7:app:${appId}`,
        true,
      ],
      [
        'accountLinkAuthFailure',
        `external-app:account-link:auth-failure:app:${appId}`,
        true,
      ],
    ]);
    expect(mocks.redis.set).not.toHaveBeenCalled();
  });

  it('locks the pair out of these routes once the source cap is passed', async () => {
    mocks.consume.mockImplementation(async ([counter]) =>
      counter.bucket === 'accountLinkAuthFailureSource' ? tooMany() : null
    );

    expect(status(await call('wrong'))).toBe(429);
    expect(mocks.redis.set).toHaveBeenCalledWith(
      'ratelimit:external-app:account-link:auth-lock:198.51.100.7:app:upskii',
      '1',
      { ex: 420 }
    );
  });

  it('lets the real server recover once its secret is fixed', async () => {
    // A rotated secret the Upskii server has not picked up yet.
    platformSecret = 'rotated';
    mocks.consume.mockImplementation(async ([counter]) =>
      counter.bucket === 'accountLinkAuthFailureSource' &&
      mocks.consume.mock.calls.length > 8
        ? tooMany()
        : null
    );
    const failures: number[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1)
      failures.push(status(await call('right')));
    expect(failures.every((code) => code === 401 || code === 429)).toBe(true);
    expect(mocks.redis.set).toHaveBeenCalled();

    // Locked while the window lasts.
    mocks.redis.get.mockResolvedValue('1');
    expect(status(await call('rotated'))).toBe(429);

    // The window ends and the server now sends the new secret.
    mocks.redis.get.mockResolvedValue(null);
    mocks.consume.mockClear();
    const recovered = await call('rotated');
    expect(status(recovered)).toBe(200);
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it('alerts on a client-id surge but never locks the client id out', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.consume.mockImplementation(async ([counter]) =>
      counter.bucket === 'accountLinkAuthFailure' ? tooMany() : null
    );

    expect(status(await call('wrong'))).toBe(401);
    expect(error).toHaveBeenCalledWith(
      '[upskii-link] credential failure surge',
      expect.objectContaining({ code: 'UPSKII_AUTH_FAILURE_SURGE' })
    );
    expect(mocks.redis.set).not.toHaveBeenCalled();
    expect(status(await call('right'))).toBe(200);
    error.mockRestore();
  });

  it('answers 503 instead of an unlimited guess when the store is down', async () => {
    mocks.redisAvailable = false;
    expect(status(await call('wrong'))).toBe(503);
    expect(mocks.verifySecret).not.toHaveBeenCalled();

    mocks.redisAvailable = true;
    mocks.consume.mockResolvedValue(
      new Response(null, { status: 503 }) as never
    );
    expect(status(await call('wrong'))).toBe(503);
  });

  it('never locks out a Worker-zone source, but still alerts', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.ip = '104.16.0.1';
    mocks.consume.mockImplementation(async () => tooMany());

    const result = await requireUpskiiAppCredentials(
      request(basic('wrong'), { 'cf-worker': 'app.upskii.com' }),
      'unlink'
    );

    expect(status(result)).toBe(401);
    expect(mocks.redis.get).not.toHaveBeenCalled();
    expect(mocks.redis.set).not.toHaveBeenCalled();
    expect(
      mocks.consume.mock.calls.map(([counters]) => counters[0].bucket)
    ).toEqual(['accountLinkAuthFailure']);
    expect(error).toHaveBeenCalledWith(
      '[upskii-link] credential failure surge',
      expect.objectContaining({ code: 'UPSKII_AUTH_FAILURE_SURGE' })
    );
    error.mockRestore();
  });

  it('never locks out an unknown source, and logs it once for upskii', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resetUpskiiAuthSourceNoteForTests();
    mocks.ip = 'unknown';
    mocks.consume.mockImplementation(async () => tooMany());

    expect(status(await call('wrong'))).toBe(401);
    expect(status(await call('right'))).toBe(200);
    expect(mocks.redis.get).not.toHaveBeenCalled();
    expect(mocks.redis.set).not.toHaveBeenCalled();
    expect(
      mocks.consume.mock.calls.map(([counters]) => counters[0].bucket)
    ).toEqual(['accountLinkAuthFailure']);
    expect(
      warn.mock.calls.filter(
        ([message]) => message === '[upskii-link] request has no trusted source'
      )
    ).toHaveLength(1);
    warn.mockRestore();
  });

  it('records nothing for a verified request', async () => {
    expect(status(await call('right'))).toBe(200);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.redis.set).not.toHaveBeenCalled();
  });
});

describe('upskiiAuthSource', () => {
  const cloudflareIp = '104.16.0.1';

  it('separates Worker zones on a shared Cloudflare egress address', () => {
    const upskii = upskiiAuthSource(
      new Headers({ 'cf-worker': 'app.upskii.com' }),
      cloudflareIp
    );
    const attacker = upskiiAuthSource(
      new Headers({ 'cf-worker': 'attacker.example' }),
      cloudflareIp
    );
    expect(upskii).toBe('worker:app.upskii.com');
    expect(attacker).toBe('worker:attacker.example');
  });

  it('keys a plain address by itself and ignores a forged cf-worker', () => {
    expect(upskiiAuthSource(new Headers(), '198.51.100.7')).toBe(
      '198.51.100.7'
    );
    expect(
      upskiiAuthSource(
        new Headers({ 'cf-worker': 'app.upskii.com' }),
        '198.51.100.7'
      )
    ).toBe('198.51.100.7');
  });

  it('groups IPv6 addresses by /64', () => {
    const a = upskiiAuthSource(new Headers(), '2001:db8:1:2:3:4:5:6');
    const b = upskiiAuthSource(new Headers(), '2001:db8:1:2:aaaa::1');
    const other = upskiiAuthSource(new Headers(), '2001:db8:1:3::1');
    expect(a).toBe(b);
    expect(a).not.toBe(other);
  });
});
