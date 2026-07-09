import {
  APP_SESSION_COOKIE_NAME,
  createAppSessionToken,
} from '@tuturuuu/auth/app-session';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adminSupabase: {
    auth: {
      signOut: vi.fn(),
    },
    from: vi.fn(),
  },
  createAdminClient: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
}));

import { resolveFinanceRouteAuthContext } from './route-auth';

function createRequestForTarget(targetApp: string) {
  const { token } = createAppSessionToken({
    email: 'finance@example.com',
    targetApp,
    userId: 'user-1',
  });

  return new Request('https://tuturuuu.com/api/v1/workspaces/ws-1/finance', {
    headers: {
      cookie: `${APP_SESSION_COOKIE_NAME}=${token}`,
    },
  });
}

describe('resolveFinanceRouteAuthContext', () => {
  beforeEach(() => {
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
    mocks.createAdminClient.mockResolvedValue(mocks.adminSupabase);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('accepts Finance app-session cookies and attaches the user to admin Supabase auth', async () => {
    const context = await resolveFinanceRouteAuthContext(
      createRequestForTarget('finance')
    );

    expect(context?.user).toEqual(
      expect.objectContaining({
        email: 'finance@example.com',
        id: 'user-1',
      })
    );
    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });

    await expect(context?.supabase.auth.getUser()).resolves.toEqual({
      data: {
        user: expect.objectContaining({
          email: 'finance@example.com',
          id: 'user-1',
        }),
      },
      error: null,
    });
  });

  it('does not accept app-session cookies for unrelated app audiences', async () => {
    await expect(
      resolveFinanceRouteAuthContext(createRequestForTarget('inventory'))
    ).resolves.toBeUndefined();
  });

  it('accepts Inventory app-session cookies when a shared route opts in', async () => {
    const context = await resolveFinanceRouteAuthContext(
      createRequestForTarget('inventory'),
      { targetApp: ['finance', 'platform', 'inventory'] }
    );

    expect(context?.user).toEqual(
      expect.objectContaining({
        email: 'finance@example.com',
        id: 'user-1',
      })
    );
    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
  });
});
