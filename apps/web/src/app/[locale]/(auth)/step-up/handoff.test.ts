// @vitest-environment node

import {
  verifyAppSessionRefreshToken,
  verifyAppSessionToken,
} from '@tuturuuu/auth/app-session-core';
import { readMfaTransfer } from '@tuturuuu/utils/required-mfa-transfer';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../../api/v1/auth/cross-app-return/route';
import { POST as verifyHandoff } from '../../../api/v1/auth/cross-app-token/verify/route';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), claims: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: { id, app_metadata: {} } },
          error: null,
        }),
      },
    },
  }),
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: {
          user: { id: 'actor', email: 'fixture@example.com', app_metadata: {} },
        },
        error: null,
      }),
      getClaims: mocks.claims,
    },
    rpc: mocks.rpc,
  }),
}));
vi.mock('@/lib/app-coordination/external-apps', () => ({
  getExternalAppByReturnUrl: async () => null,
}));
vi.mock('@/lib/infrastructure/log-drain', () => ({
  withRequestLogDrain: (_: unknown, run: () => Promise<Response>) => run(),
}));
vi.mock('@/lib/app-coordination/session-policy', () => ({
  getAppCoordinationSessionPolicy: async () => ({
    policy: {
      browserRefreshReplayGraceSeconds: 30,
      cliAccessTtlSeconds: 28800,
      cliRefreshTtlSeconds: 7776000,
      externalAppBearerTtlSeconds: 28800,
      externalAppRefreshReplayGraceSeconds: 30,
      internalAppAccessTtlSeconds: 28800,
      internalAppOverrides: {},
      internalAppRefreshEarlySeconds: 900,
      internalAppRefreshTtlSeconds: 2592000,
    },
  }),
}));

beforeEach(() => {
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'fixture-handoff-secret');
  mocks.rpc
    .mockReset()
    .mockResolvedValue({ data: 'one-time-handoff', error: null });
  mocks.claims.mockReset();
});

describe('real central Passwords handoff', () => {
  it('preserves nested login state and signs provider-verified fresh MFA for Passwords', async () => {
    const verifiedAt = Math.floor(Date.now() / 1000) - 1;
    mocks.claims.mockResolvedValue({
      data: {
        claims: {
          sub: 'actor',
          aal: 'aal2',
          session_id: 'provider-session',
          amr: [{ method: 'totp', timestamp: verifiedAt }],
        },
      },
      error: null,
    });
    const state = 'a'.repeat(43);
    const result = await POST(
      new NextRequest('https://tuturuuu.com/api/v1/auth/cross-app-return', {
        method: 'POST',
        body: JSON.stringify({
          returnUrl: `https://passwords.tuturuuu.com/vi/workspace?tab=items&state=${state}`,
        }),
      })
    );
    expect(result.status).toBe(200);
    const body = await result.json();
    const callback = new URL(body.returnUrl);
    expect(callback.pathname).toBe('/verify-token');
    expect(callback.searchParams.get('nextUrl')).toBe(
      `/vi/workspace?tab=items&state=${state}`
    );
    expect(callback.searchParams.get('token')).toBe('one-time-handoff');
    const generated = mocks.rpc.mock.calls[0]![1];
    expect(generated.p_target_app).toBe('passwords');
    const transfer = generated.p_session_data.mfaTransfer;
    expect(readMfaTransfer(transfer, 'actor', 'passwords')).toMatchObject({
      sessionId: 'provider-session',
      verifiedAt,
    });
    expect(readMfaTransfer(transfer, 'other-actor', 'passwords')).toBeNull();
    expect(readMfaTransfer(transfer, 'actor', 'meet')).toBeNull();
    expect(callback.toString()).not.toContain(transfer);
    mocks.rpc.mockResolvedValueOnce({
      data: [{ user_id: 'actor', session_data: generated.p_session_data }],
      error: null,
    });
    const verified = await verifyHandoff(
      new NextRequest(
        'https://tuturuuu.com/api/v1/auth/cross-app-token/verify',
        {
          method: 'POST',
          body: JSON.stringify({
            targetApp: 'passwords',
            token: 'one-time-handoff',
          }),
        }
      )
    );
    expect(verified.status).toBe(200);
    const pair = await verified.json();
    const options = {
      secret: 'fixture-handoff-secret',
      targetApp: 'passwords',
    };
    const access = verifyAppSessionToken(pair.appSessionToken, options);
    const refresh = verifyAppSessionRefreshToken(
      pair.appSessionRefreshToken,
      options
    );
    expect(access.ok && access.claims.mfa).toMatchObject({
      sessionId: 'provider-session',
      verifiedAt,
    });
    expect(refresh.ok && refresh.claims.mfa).toMatchObject({
      sessionId: 'provider-session',
      verifiedAt,
    });
  });
  it('does not derive MFA from a fresh token issuance time or raw request proof', async () => {
    mocks.claims.mockResolvedValue({
      data: {
        claims: {
          sub: 'actor',
          aal: 'aal1',
          iat: Math.floor(Date.now() / 1000),
        },
      },
      error: null,
    });
    const result = await POST(
      new NextRequest('https://tuturuuu.com/api/v1/auth/cross-app-return', {
        method: 'POST',
        body: JSON.stringify({
          returnUrl: 'https://passwords.tuturuuu.com/en/workspace',
          mfa: { verifiedAt: Date.now() },
          generateToken: true,
        }),
      })
    );
    expect(result.status).toBe(200);
    expect(mocks.rpc.mock.calls[0]![1].p_session_data).not.toHaveProperty(
      'mfaTransfer'
    );
  });
});
