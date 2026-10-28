import { createAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import {
  createCliAppSession,
  verifyCliAccessToken,
  verifyCliRefreshToken,
} from '@tuturuuu/auth/cli-session';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));
const mocks = vi.hoisted(() => ({ identity: vi.fn(), claims: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({ auth: { getClaims: mocks.claims } }),
  createAdminClient: async () => ({
    auth: {
      admin: {
        getUserById: async () => ({
          data: {
            user: {
              id: '11111111-1111-4111-8111-111111111111',
              email: 'cutoff@example.invalid',
            },
          },
          error: null,
        }),
      },
    },
  }),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: async () => ({
    user: { id: '11111111-1111-4111-8111-111111111111' },
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: async () => ({ membershipType: 'GUEST' }),
}));
vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRestRedisClient: async () => null,
}));
vi.mock('@/lib/app-coordination/session-policy', () => ({
  getCliAppSessionPolicy: async () => ({
    cliAccessTtlSeconds: 28800,
    cliRefreshTtlSeconds: 7776000,
  }),
}));
vi.mock('./identity-store', () => ({ resolveDevboxIdentity: mocks.identity }));

import { POST as refresh } from '@/app/api/cli/auth/refresh/route';
import { requireDevboxActor } from './authorization';

const userId = '11111111-1111-4111-8111-111111111111';
const clock = new Date('2026-10-28T06:00:00Z');
const now = clock.getTime() / 1000;
const old = now - 600;
const cutoff = now - 60;
const request = (token?: string, path = '/runs', method = 'GET') =>
  new Request(`https://example.test/api/v1/devboxes${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(clock);
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'cutoff-test-secret');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mocks.identity.mockResolvedValue({
    enabled: true,
    grant: {
      id: 'grant',
      user_id: userId,
      status: 'active',
      suspended: false,
      revoked_at: null,
      accepted_at: new Date((old - 60) * 1000).toISOString(),
      expires_at: new Date((now + 3600) * 1000).toISOString(),
      sessions_not_before: new Date(cutoff * 1000).toISOString(),
      require_mfa: true,
    },
    token: null,
  });
  mocks.claims.mockResolvedValue({
    data: {
      claims: {
        sub: userId,
        iat: now,
        aal: 'aal2',
        session_id: 'web-session',
        amr: [
          { method: 'password', timestamp: old },
          { method: 'totp', timestamp: now },
        ],
      },
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
async function rotate(token: string) {
  const result = await refresh(
    new NextRequest('https://example.test/api/cli/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: token }),
    })
  );
  expect(result.status).toBe(200);
  return (await result.json()).session;
}
it('stolen pre-cutoff refresh token cannot regain run reads even through repeated rotation or Redis outage', async () => {
  const stolen = createCliAppSession(
    { userId, mfa: { sessionId: 's', verifiedAt: old } },
    { now: new Date(old * 1000) }
  );
  const first = await rotate(stolen.refresh.token);
  const second = await rotate(first.refresh_token);
  const verified = verifyCliAccessToken(second.access_token);
  expect(verified.ok).toBe(true);
  if (verified.ok)
    expect(verified.claims).toMatchObject({ auth_time: old, iat: now });
  const rotated = verifyCliRefreshToken(second.refresh_token);
  expect(rotated.ok && rotated.claims.auth_time).toBe(old);
  const auth = await requireDevboxActor(request(second.access_token));
  expect(auth.ok).toBe(false);
  if (!auth.ok) {
    expect(auth.response.status).toBe(403);
    expect(await auth.response.json()).toMatchObject({
      code: 'DEVBOX_SESSION_CUTOFF',
    });
  }
});
it('fresh CLI authentication after cutoff can read runs', async () => {
  const fresh = createCliAppSession({ userId });
  const rotated = await rotate(fresh.refresh.token);
  expect(await requireDevboxActor(request(rotated.access_token))).toMatchObject(
    { ok: true, actor: { kind: 'personal' } }
  );
});
it('legacy refresh chain with no origin fails closed for devbox reads', async () => {
  const legacy = createAppCoordinationToken({
    userId,
    targetApp: 'platform',
    originApp: 'cli',
    scopes: ['cli:refresh'],
  });
  const rotated = await rotate(legacy.token);
  const auth = await requireDevboxActor(request(rotated.access_token));
  expect(auth.ok).toBe(false);
  if (!auth.ok)
    expect(await auth.response.json()).toMatchObject({
      code: 'DEVBOX_SESSION_CUTOFF',
    });
});
it.each([
  ['/runs', 'GET'],
  ['/access-tokens', 'GET'],
  ['/access-tokens', 'POST'],
])('web refresh cannot bypass cutoff at %s %s', async (path, method) => {
  const auth = await requireDevboxActor(request(undefined, path, method));
  expect(auth.ok).toBe(false);
  if (!auth.ok)
    expect(await auth.response.json()).toMatchObject({
      code: 'DEVBOX_SESSION_CUTOFF',
    });
});

it('web mint rejects MFA from before the cutoff even when primary authentication is fresh', async () => {
  mocks.claims.mockResolvedValue({
    data: {
      claims: {
        sub: userId,
        iat: now,
        aal: 'aal2',
        session_id: 'web-session',
        amr: [
          { method: 'password', timestamp: now },
          { method: 'totp', timestamp: old },
        ],
      },
    },
  });
  const auth = await requireDevboxActor(
    request(undefined, '/access-tokens', 'POST')
  );
  expect(auth.ok).toBe(false);
  if (!auth.ok)
    expect(await auth.response.json()).toMatchObject({
      code: 'DEVBOX_SESSION_CUTOFF',
    });
});
