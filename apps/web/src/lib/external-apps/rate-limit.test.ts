import { createAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fill, registerRateLimitStore, store } from './rate-limit-test-support';
import { guard } from '@/legacy-api-routes/v1/workspaces/[wsId]/external-apps/route-guard';
import { createWorkspaceRouteHandlers } from '@/legacy-api-routes/workspace-route-group';

const WS_1 = '22222222-2222-4222-8222-222222222222';
const WS_2 = '33333333-3333-4333-8333-333333333333';
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '44444444-4444-4444-8444-444444444444';

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

type Bearer = { appId?: string; userId?: string; workspaceId?: string | null };

function bearer({
  appId = 'yoola',
  userId = USER,
  workspaceId = WS_1,
}: Bearer = {}) {
  return createAppCoordinationToken(
    {
      email: 'member@example.com',
      expiresInSeconds: 600,
      originApp: 'web',
      scopes: ['workspace:members:read'],
      targetApp: appId,
      userId,
      workspaceId: workspaceId ?? undefined,
    },
    { secret: 'test-secret' }
  ).token;
}

async function call(
  method: 'GET' | 'PATCH' | 'POST',
  path: string,
  {
    token,
    wsId = WS_1,
    ...claims
  }: Bearer & { token?: string | null; wsId?: string } = {}
) {
  const auth = token === undefined ? bearer(claims) : token;
  const request = new NextRequest(
    `http://localhost/api/v1/workspaces/${encodeURIComponent(wsId)}/external-apps/${path}`,
    {
      headers: auth ? { authorization: `Bearer ${auth}` } : {},
      method,
    }
  );
  const response = await router[method](request, {
    params: Promise.resolve({ segments: path.split('/'), wsId }),
  });
  if (!response) throw new Error('The router returned no response');
  return response;
}

const userKey = (bucket: string, userId = USER, appId = 'yoola') =>
  `external-app:${bucket}:app:${appId}:user:${userId}`;
const wsKey = (bucket: string, wsId = WS_1, appId = 'yoola') =>
  `external-app:${bucket}:app:${appId}:ws:${wsId}`;

describe('external-app workspace route limits', () => {
  registerRateLimitStore();
  beforeEach(() => {
    handlerCalls.length = 0;
  });

  it('lets a request under the limit through with one count per key', async () => {
    const response = await call('GET', 'members');

    expect(response.status).toBe(200);
    expect(handlerCalls).toEqual(['members']);
    expect(store.calls.sort()).toEqual([userKey('read'), wsKey('read')]);
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

    expect((await call('GET', 'members')).status).toBe(200);
    expect((await call('POST', 'drive/read-url')).status).toBe(200);
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
    expect(
      (await call('PATCH', 'cron/jobs/a', { workspaceId: WS_2, wsId: WS_2 }))
        .status
    ).toBe(200);
    expect(
      (await call('PATCH', 'cron/jobs/a', { appId: 'other' })).status
    ).toBe(200);
  });

  it('never counts against a workspace the bearer is not bound to', async () => {
    fill(`app:yoola:ws:${WS_2}`, 'write');

    // A bearer for workspace A aimed at workspace B, and an unbound bearer.
    await call('PATCH', 'cron/jobs/a', { wsId: WS_2 });
    await call('POST', 'members/invitations', { wsId: WS_2 });
    await call('PATCH', 'cron/jobs/a', { workspaceId: null, wsId: WS_2 });

    expect(store.calls.filter((key) => key.includes(`:ws:${WS_2}`))).toEqual(
      []
    );
    expect(store.counts.get(wsKey('write', WS_2))).toBe(60);
    expect(store.counts.has(wsKey('invitation', WS_2))).toBe(false);
  });

  it('caps a bearer per user however the URL names its workspace', async () => {
    fill(`app:yoola:user:${USER}`, 'write');

    for (const wsId of [WS_1, WS_1.toUpperCase(), 'acme', 'personal', ' x']) {
      expect((await call('PATCH', 'cron/jobs/a', { wsId })).status).toBe(429);
    }
    // Only the bound workspace, by its id, ever names a workspace counter.
    expect(new Set(store.calls.filter((key) => key.includes(':ws:')))).toEqual(
      new Set([wsKey('write')])
    );
  });

  it('counts the internal alias against the root workspace it names', async () => {
    await call('GET', 'members', {
      workspaceId: ROOT_WORKSPACE_ID,
      wsId: 'internal',
    });

    expect(store.calls.sort()).toEqual([
      userKey('read'),
      wsKey('read', ROOT_WORKSPACE_ID),
    ]);
  });

  it('counts upload URLs per app and user across workspaces', async () => {
    expect((await call('POST', 'drive/upload-url')).status).toBe(200);
    expect(store.calls.sort()).toEqual([
      userKey('uploadUrl'),
      userKey('write'),
      wsKey('write'),
    ]);

    fill(`app:yoola:user:${USER}`, 'uploadUrl');
    expect(
      (
        await call('POST', 'drive/upload-url', {
          workspaceId: WS_2,
          wsId: WS_2,
        })
      ).status
    ).toBe(429);
    expect(
      (await call('POST', 'drive/upload-url', { userId: OTHER_USER })).status
    ).toBe(200);
  });

  it('caps invitation requests per user and per workspace each hour', async () => {
    for (let index = 0; index < 5; index += 1) {
      expect((await call('POST', 'members/invitations')).status).toBe(200);
    }

    const response = await call('POST', 'members/invitations');

    expect(response.status).toBe(429);
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(60);
    expect(store.calls).toHaveLength(24);
    const elsewhere = { workspaceId: WS_2, wsId: WS_2 };
    expect(
      (await call('POST', 'members/invitations', { userId: OTHER_USER })).status
    ).toBe(429);
    expect((await call('POST', 'members/invitations', elsewhere)).status).toBe(
      429
    );
    expect(
      (
        await call('POST', 'members/invitations', {
          ...elsewhere,
          userId: OTHER_USER,
        })
      ).status
    ).toBe(200);
  });

  it('counts the personal workspace per user only', async () => {
    await call('GET', 'members', { wsId: 'personal' });

    expect(store.calls).toEqual([userKey('read')]);
  });

  it('leaves a request without a valid bearer to the handler', async () => {
    await call('GET', 'members', { token: null });
    await call('GET', 'members', { token: 'ttr_app_not-a-token' });

    expect(store.calls).toEqual([]);
    expect(handlerCalls).toEqual(['members', 'members']);
  });
});
