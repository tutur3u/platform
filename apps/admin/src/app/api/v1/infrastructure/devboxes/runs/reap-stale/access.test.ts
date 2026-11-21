import {
  APP_SESSION_COOKIE_NAME,
  createAppSessionToken,
} from '@tuturuuu/auth/app-session';
import { createCliAppSession } from '@tuturuuu/auth/cli-session';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  permissions: vi.fn(),
  reap: vi.fn(),
  drain: vi.fn(),
  sessionUser: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn().mockResolvedValue({}),
  createClient: vi.fn().mockResolvedValue({}),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.sessionUser,
}));
vi.mock('@/lib/devboxes/admin-runner-control', () => ({
  reapStaleDevboxRuns: mocks.reap,
  setDevboxRunnerDrain: mocks.drain,
}));

import { POST as drain } from '../../runners/[runnerId]/drain/route';
import { POST } from './route';

const origin = 'https://infrastructure.tuturuuu.com';
const userId = '11111111-1111-4111-8111-111111111111';

function browserToken(targetApp = 'infra') {
  return createAppSessionToken({ targetApp, userId }).token;
}

function request(token: string, headers: HeadersInit = { origin }) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set('authorization', `Bearer ${token}`);
  return new Request(
    `${origin}/api/v1/infrastructure/devboxes/runs/reap-stale`,
    { method: 'POST', headers: requestHeaders }
  );
}

function permissions(
  allowed: string[] = ['manage_workspace_secrets'],
  membershipType = 'MEMBER'
) {
  mocks.permissions.mockResolvedValue({
    membershipType,
    withoutPermission: (permission: string) => !allowed.includes(permission),
  });
}

describe('stale run reaper authentication and mutation boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'reaper-test-signing-key');
    mocks.sessionUser.mockResolvedValue({ user: null, authError: null });
    mocks.reap.mockResolvedValue({ limit: 200, reaped: 0 });
    permissions();
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each(['manage_workspace_secrets', 'manage_workspace_roles'])(
    'allows an infra browser-session root member with %s',
    async (permission) => {
      permissions([permission]);
      const response = await POST(request(browserToken()));
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ limit: 200, reaped: 0 });
      expect(mocks.permissions).toHaveBeenCalledWith({
        request: expect.any(Request),
        user: expect.objectContaining({ id: userId }),
        wsId: ROOT_WORKSPACE_ID,
      });
      expect(mocks.reap).toHaveBeenCalledOnce();
      expect(mocks.sessionUser).not.toHaveBeenCalled();
    }
  );

  it.each(['GUEST', 'NOT_A_MEMBER'])(
    'rejects a browser actor with %s membership even with management permission',
    async (membershipType) => {
      permissions(['manage_workspace_secrets'], membershipType);
      expect((await POST(request(browserToken()))).status).toBe(403);
      expect(mocks.reap).not.toHaveBeenCalled();
    }
  );

  it('rejects a browser actor without root membership', async () => {
    mocks.permissions.mockResolvedValue(null);
    expect((await POST(request(browserToken()))).status).toBe(403);
    expect(mocks.reap).not.toHaveBeenCalled();
  });

  it('rejects a root member without either management permission', async () => {
    permissions([]);
    expect((await POST(request(browserToken()))).status).toBe(403);
    expect(mocks.reap).not.toHaveBeenCalled();
  });

  it.each(['web', 'platform', 'meet'])(
    'rejects a browser app-session token for %s',
    async (targetApp) => {
      expect((await POST(request(browserToken(targetApp)))).status).toBe(401);
      expect(mocks.permissions).not.toHaveBeenCalled();
      expect(mocks.reap).not.toHaveBeenCalled();
    }
  );

  it('rejects a token with an invalid signature', async () => {
    const token = createAppSessionToken(
      { targetApp: 'infra', userId },
      { secret: 'another-test-signing-key' }
    ).token;
    expect((await POST(request(token))).status).toBe(401);
    expect(mocks.reap).not.toHaveBeenCalled();
  });

  it('allows a same-origin infra browser session supplied as a cookie', async () => {
    const response = await POST(
      new Request(`${origin}/api/reap-stale`, {
        method: 'POST',
        headers: {
          origin,
          cookie: `${APP_SESSION_COOKIE_NAME}=${browserToken()}`,
        },
      })
    );
    expect(response.status).toBe(200);
    expect(mocks.reap).toHaveBeenCalledOnce();
  });

  it('does not exempt an ambient CLI cookie from the Origin check', async () => {
    const token = createCliAppSession({ userId }).access.token;
    const response = await POST(
      new Request(`${origin}/api/reap-stale`, {
        method: 'POST',
        headers: { cookie: `${APP_SESSION_COOKIE_NAME}=${token}` },
      })
    );
    expect(response.status).toBe(403);
    expect(mocks.reap).not.toHaveBeenCalled();
  });

  it('preserves originless CLI access just like runner drain', async () => {
    const token = createCliAppSession({ userId }).access.token;
    expect((await POST(request(token, {}))).status).toBe(200);
    const drainRequest = new Request(`${origin}/api/drain`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ draining: true }),
    });
    expect(
      (
        await drain(drainRequest, {
          params: Promise.resolve({ runnerId: userId }),
        })
      ).status
    ).toBe(200);
    expect(mocks.reap).toHaveBeenCalledOnce();
    expect(mocks.drain).toHaveBeenCalledWith(userId, true);
  });

  it('requires root management permission for CLI access too', async () => {
    permissions([]);
    const token = createCliAppSession({ userId }).access.token;
    expect((await POST(request(token, {}))).status).toBe(403);
    expect(mocks.reap).not.toHaveBeenCalled();
  });

  it('rejects a CLI refresh token', async () => {
    const token = createCliAppSession({ userId }).refresh.token;
    expect((await POST(request(token, {}))).status).toBe(401);
    expect(mocks.reap).not.toHaveBeenCalled();
  });

  it.each<HeadersInit>([
    {},
    { origin: 'https://attacker.example' },
    { origin: 'null' },
    { origin: `${origin}/path` },
    { origin, 'sec-fetch-site': 'cross-site' },
    { origin, 'sec-fetch-site': 'same-site' },
    {
      origin: 'https://attacker.example',
      'x-forwarded-host': 'attacker.example',
    },
  ])('rejects unsafe browser mutation headers %j', async (headers) => {
    expect((await POST(request(browserToken(), headers))).status).toBe(403);
    expect(mocks.reap).not.toHaveBeenCalled();
  });

  it('rejects a cross-origin request even with a valid CLI token', async () => {
    const token = createCliAppSession({ userId }).access.token;
    expect(
      (await POST(request(token, { origin: 'https://attacker.example' })))
        .status
    ).toBe(403);
    expect(mocks.reap).not.toHaveBeenCalled();
  });
});
