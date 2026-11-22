import { createAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RateLimitConfig } from '@/lib/rate-limit';
import { guard } from '@/legacy-api-routes/v1/workspaces/[wsId]/external-apps/route-guard';
import { createWorkspaceRouteHandlers } from '@/legacy-api-routes/workspace-route-group';
import { limitExternalAppTokenExchange } from './rate-limit';
import { EXTERNAL_APP_RATE_LIMITS } from './rate-limit-policy';

const store = vi.hoisted(() => ({
  calls: [] as string[],
  counts: new Map<string, number>(),
  down: false,
  guardAssigned: true,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitRedis: async (
    key: string,
    config: RateLimitConfig,
    options: { failClosed?: boolean } = {}
  ) => {
    store.calls.push(key);
    const reset = Math.floor(Date.now() / 1000) + config.windowMs / 1000;
    if (store.down) {
      return {
        allowed: !options.failClosed,
        limit: config.maxRequests,
        remaining: 0,
        reset,
        unavailable: true,
      };
    }
    const count = (store.counts.get(key) ?? 0) + 1;
    store.counts.set(key, count);
    return {
      allowed: count <= config.maxRequests,
      limit: config.maxRequests,
      remaining: Math.max(0, config.maxRequests - count),
      reset,
    };
  },
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

vi.mock('@tuturuuu/utils/abuse-guard/select', () => ({
  isAbuseGuardFamilyAssigned: (family: string) =>
    family === 'ratelimit' && store.guardAssigned,
}));

vi.mock('@tuturuuu/utils/upstash-rest', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tuturuuu/utils/upstash-rest')>()),
  hasUpstashRestEnv: () => false,
}));

const WS_1 = '22222222-2222-4222-8222-222222222222';
const WS_2 = '33333333-3333-4333-8333-333333333333';
const USER = '11111111-1111-4111-8111-111111111111';

const handlerCalls: string[] = [];
const ok = (name: string) => async () => {
  handlerCalls.push(name);
  return Response.json({ ok: true });
};

const router = createWorkspaceRouteHandlers(
  [
    [['members'], { GET: ok('members') }],
    [['members', 'invitations'], { POST: ok('invite') }],
    [['drive', 'upload-url'], { POST: ok('upload-url') }],
    [['drive', 'read-url'], { POST: ok('read-url') }],
    [['cron', 'jobs', '[jobKey]'], { PATCH: ok('cron-job') }],
  ],
  guard
);

function bearer(appId = 'yoola', userId = USER) {
  return createAppCoordinationToken(
    {
      email: 'member@example.com',
      expiresInSeconds: 600,
      originApp: 'web',
      scopes: ['workspace:members:read'],
      targetApp: appId,
      userId,
    },
    { secret: 'test-secret' }
  ).token;
}

async function call(
  method: 'GET' | 'PATCH' | 'POST',
  path: string,
  {
    appId = 'yoola',
    userId = USER,
    token = bearer(appId, userId),
    wsId = WS_1,
  }: {
    appId?: string;
    token?: string | null;
    userId?: string;
    wsId?: string;
  } = {}
) {
  const segments = path.split('/');
  const request = new NextRequest(
    `http://localhost/api/v1/workspaces/${wsId}/external-apps/${path}`,
    {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      method,
    }
  );
  const response = await router[method](request, {
    params: Promise.resolve({ segments, wsId }),
  });
  if (!response) throw new Error('The router returned no response');
  return response;
}

function fill(key: string, bucket: keyof typeof EXTERNAL_APP_RATE_LIMITS) {
  store.counts.set(
    `external-app:${bucket}:${key}`,
    EXTERNAL_APP_RATE_LIMITS[bucket].maxRequests
  );
}

beforeEach(() => {
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
  store.calls.length = 0;
  store.counts.clear();
  store.down = false;
  store.guardAssigned = true;
  handlerCalls.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('external-app workspace route limits', () => {
  it('lets a request under the limit through with one count per key', async () => {
    const response = await call('GET', 'members');

    expect(response.status).toBe(200);
    expect(handlerCalls).toEqual(['members']);
    expect(store.calls).toEqual([`external-app:read:app:yoola:ws:${WS_1}`]);
  });

  it('answers 429 with Retry-After once a key is over its limit', async () => {
    fill(`app:yoola:ws:${WS_1}`, 'write');

    const response = await call('PATCH', 'cron/jobs/nightly');

    expect(response.status).toBe(429);
    const retryAfter = Number(response.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
    await expect(response.json()).resolves.toMatchObject({
      code: 'RATE_LIMIT_EXCEEDED',
    });
    expect(handlerCalls).toEqual([]);
  });

  it('refuses a write with 503 while the limiter is unavailable', async () => {
    store.down = true;

    const response = await call('POST', 'members/invitations');

    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('30');
    await expect(response.json()).resolves.toMatchObject({
      code: 'RATE_LIMIT_UNAVAILABLE',
    });
    expect(handlerCalls).toEqual([]);
  });

  it('allows a read while the limiter is unavailable', async () => {
    store.down = true;

    const members = await call('GET', 'members');
    const readUrl = await call('POST', 'drive/read-url');

    expect(members.status).toBe(200);
    expect(readUrl.status).toBe(200);
    expect(handlerCalls).toEqual(['members', 'read-url']);
  });

  it('lets writes through outside production when no counter store exists', async () => {
    store.down = true;
    store.guardAssigned = false;
    vi.stubEnv('TUTURUUU_DEPLOY_ENV', 'local');

    expect((await call('POST', 'members/invitations')).status).toBe(200);

    vi.stubEnv('TUTURUUU_DEPLOY_ENV', 'production');
    expect((await call('POST', 'members/invitations')).status).toBe(503);
  });

  it('keys limits separately per workspace and per app', async () => {
    fill(`app:yoola:ws:${WS_1}`, 'write');

    expect((await call('PATCH', 'cron/jobs/a')).status).toBe(429);
    expect((await call('PATCH', 'cron/jobs/a', { wsId: WS_2 })).status).toBe(
      200
    );
    expect(
      (await call('PATCH', 'cron/jobs/a', { appId: 'other' })).status
    ).toBe(200);
  });

  it('counts upload URLs per app and user across workspaces', async () => {
    const response = await call('POST', 'drive/upload-url');

    expect(response.status).toBe(200);
    expect(store.calls.sort()).toEqual([
      `external-app:uploadUrl:app:yoola:user:${USER}`,
      `external-app:write:app:yoola:ws:${WS_1}`,
    ]);

    fill(`app:yoola:user:${USER}`, 'uploadUrl');
    expect(
      (await call('POST', 'drive/upload-url', { wsId: WS_2 })).status
    ).toBe(429);
    const otherUser = '44444444-4444-4444-8444-444444444444';
    expect(
      (await call('POST', 'drive/upload-url', { userId: otherUser })).status
    ).toBe(200);
  });

  it('caps invitation requests per app and workspace per hour', async () => {
    for (let index = 0; index < 5; index += 1) {
      expect((await call('POST', 'members/invitations')).status).toBe(200);
    }

    const response = await call('POST', 'members/invitations');

    expect(response.status).toBe(429);
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(60);
    expect(store.calls).toHaveLength(12);
    expect(
      (await call('POST', 'members/invitations', { wsId: WS_2 })).status
    ).toBe(200);
  });

  it('counts the personal workspace per user', async () => {
    await call('GET', 'members', { wsId: 'personal' });

    expect(store.calls).toEqual([
      `external-app:read:app:yoola:ws:personal:${USER}`,
    ]);
  });

  it('leaves a request without a valid bearer to the handler', async () => {
    await call('GET', 'members', { token: null });
    await call('GET', 'members', { token: 'ttr_app_not-a-token' });

    expect(store.calls).toEqual([]);
    expect(handlerCalls).toEqual(['members', 'members']);
  });
});

describe('external-app token exchange limit', () => {
  it('counts each exchange once per app and IP', async () => {
    await expect(
      limitExternalAppTokenExchange({ appId: 'yoola', ip: '203.0.113.7' })
    ).resolves.toBeNull();
    expect(store.calls).toEqual([
      'external-app:exchange:app:yoola:ip:203.0.113.7',
    ]);
  });

  it('answers 429 over the limit, keyed per app and IP', async () => {
    fill('app:yoola:ip:203.0.113.7', 'exchange');

    const limited = await limitExternalAppTokenExchange({
      appId: 'yoola',
      ip: '203.0.113.7',
    });
    expect(limited?.status).toBe(429);
    expect(limited?.headers.get('Retry-After')).toBeTruthy();
    await expect(
      limitExternalAppTokenExchange({ appId: 'yoola', ip: '203.0.113.8' })
    ).resolves.toBeNull();
    await expect(
      limitExternalAppTokenExchange({ appId: 'other', ip: '203.0.113.7' })
    ).resolves.toBeNull();
  });

  it('fails closed while the limiter is unavailable', async () => {
    store.down = true;

    const refusal = await limitExternalAppTokenExchange({
      appId: 'yoola',
      ip: '203.0.113.7',
    });

    expect(refusal?.status).toBe(503);
  });
});
