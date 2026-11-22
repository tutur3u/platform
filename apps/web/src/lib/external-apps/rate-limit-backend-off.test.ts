// @vitest-environment node
import { createAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

const WS = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
  vi.stubEnv('ABUSE_GUARD_FAMILIES', 'ratelimit');
  vi.stubEnv('ABUSE_GUARD_BACKEND', 'off');
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function call(method: 'GET' | 'POST', path: string) {
  const { createWorkspaceRouteHandlers } =
    await import('@/legacy-api-routes/workspace-route-group');
  const { guard } =
    await import('@/legacy-api-routes/v1/workspaces/[wsId]/external-apps/route-guard');
  const router = createWorkspaceRouteHandlers(
    [
      [['members'], { GET: async () => Response.json({ ok: true }) }],
      [
        ['members', 'invitations'],
        { POST: async () => Response.json({ ok: true }) },
      ],
    ],
    guard
  );
  const token = createAppCoordinationToken(
    {
      email: 'member@example.com',
      expiresInSeconds: 600,
      originApp: 'web',
      scopes: ['workspace:members:write'],
      targetApp: 'yoola',
      userId: '11111111-1111-4111-8111-111111111111',
      workspaceId: WS,
    },
    { secret: 'test-secret' }
  ).token;
  const response = await router[method](
    new NextRequest(
      `http://localhost/api/v1/workspaces/${WS}/external-apps/${path}`,
      { headers: { authorization: `Bearer ${token}` }, method }
    ),
    { params: Promise.resolve({ segments: path.split('/'), wsId: WS }) }
  );
  if (!response) throw new Error('The router returned no response');
  return response;
}

describe('external-app limits with ABUSE_GUARD_BACKEND=off', () => {
  it('refuses writes and exchanges with 503 and keeps reads', async () => {
    const write = await call('POST', 'members/invitations');
    expect(write.status).toBe(503);
    await expect(write.json()).resolves.toMatchObject({
      code: 'RATE_LIMIT_UNAVAILABLE',
    });
    expect((await call('GET', 'members')).status).toBe(200);

    const { admitExternalAppExchange } = await import('./exchange-rate-limit');
    expect(
      (await admitExternalAppExchange({ appId: 'yoola', ip: '203.0.113.7' }))
        ?.status
    ).toBe(503);
  });
});
