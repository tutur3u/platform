import {
  verifyAppSessionRefreshToken,
  verifyAppSessionToken,
} from '@tuturuuu/auth/app-session';
import {
  AI_CONSENT_REQUIRED_SCOPE,
  createAiConsentBrowserOriginTransfer,
} from '@tuturuuu/utils/ai-consent-session';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: {
            user: {
              id,
              email: 'learn@example.com',
              email_confirmed_at: '2026-01-01',
              app_metadata: {},
            },
          },
          error: null,
        }),
      },
    },
  }),
  createClient: async () => ({ rpc: mocks.rpc }),
}));

vi.mock('@/lib/app-coordination/session-policy', () => ({
  getAppCoordinationSessionPolicy: vi.fn().mockResolvedValue({
    policy: {
      browserRefreshReplayGraceSeconds: 30,
      cliAccessTtlSeconds: 28_800,
      cliRefreshTtlSeconds: 7_776_000,
      externalAppBearerTtlSeconds: 28_800,
      externalAppRefreshReplayGraceSeconds: 30,
      internalAppAccessTtlSeconds: 28_800,
      internalAppOverrides: {},
      internalAppRefreshEarlySeconds: 900,
      internalAppRefreshTtlSeconds: 2_592_000,
    },
    source: 'default',
  }),
}));

async function verify(sessionData: Record<string, unknown>) {
  mocks.rpc.mockResolvedValue({
    data: [{ session_data: sessionData, user_id: 'user-1' }],
    error: null,
  });
  const response = await POST(
    new NextRequest('http://localhost/api/v1/auth/cross-app-token/verify', {
      body: JSON.stringify({ targetApp: 'learn', token: 'learn-token' }),
      method: 'POST',
    })
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  const access = verifyAppSessionToken(body.appSessionToken, {
    targetApp: 'learn',
  });
  const refresh = verifyAppSessionRefreshToken(body.appSessionRefreshToken, {
    targetApp: 'learn',
  });
  if (!access.ok || !refresh.ok) throw new Error('session not minted');
  return {
    body,
    stamped: [access, refresh].map((verification) =>
      verification.claims.scopes.includes(AI_CONSENT_REQUIRED_SCOPE)
    ),
  };
}

describe('central cross-app verification and Mira AI consent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_COORDINATION_TOKEN_SECRET', '');
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
  });

  it('keeps a handoff minted from a browser cookie session exempt', async () => {
    const { body, stamped } = await verify({
      aiConsentTransfer: createAiConsentBrowserOriginTransfer(
        'user-1',
        'learn'
      ),
      email: 'learn@example.com',
    });
    expect(body.aiConsentRequired).toBe(false);
    expect(stamped).toEqual([false, false]);
    expect(body.sessionData).not.toHaveProperty('aiConsentTransfer');
  });

  it('stamps a handoff minted directly through Supabase as consent-required', async () => {
    const { body, stamped } = await verify({ email: 'learn@example.com' });
    expect(body.aiConsentRequired).toBe(true);
    expect(stamped).toEqual([true, true]);
  });

  it('stamps a handoff whose transfer belongs to another user', async () => {
    const { stamped } = await verify({
      aiConsentTransfer: createAiConsentBrowserOriginTransfer(
        'user-2',
        'learn'
      ),
    });
    expect(stamped).toEqual([true, true]);
  });
});
