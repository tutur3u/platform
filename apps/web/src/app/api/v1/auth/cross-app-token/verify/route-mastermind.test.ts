import { createAppRedeemProof } from '@tuturuuu/auth/app-redeem-proof';
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
              email: 'owner@example.com',
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
vi.mock('@/lib/app-coordination/session-policy', async () => {
  const { parseAppCoordinationSessionPolicy } =
    await import('@tuturuuu/auth/app-session-policy');
  return {
    getAppCoordinationSessionPolicy: vi.fn().mockResolvedValue({
      policy: parseAppCoordinationSessionPolicy({
        internalAppAccessTtlSeconds: 86_400,
      }),
      source: 'default',
    }),
  };
});

const verify = (headers: Record<string, string> = {}) =>
  POST(
    new NextRequest('https://tuturuuu.com/api/v1/auth/cross-app-token/verify', {
      body: JSON.stringify({ targetApp: 'mastermind', token: 'handoff' }),
      headers,
      method: 'POST',
    })
  );

describe('Mastermind handoff redemption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
    mocks.rpc.mockResolvedValue({
      data: [
        { session_data: { email: 'owner@example.com' }, user_id: 'owner' },
      ],
      error: null,
    });
  });

  it('refuses a handoff token without the Worker proof, before redeeming it', async () => {
    for (const proof of [
      undefined,
      'forged',
      createAppRedeemProof('mastermind', 'other-token', 'test-secret'),
      createAppRedeemProof('calendar', 'handoff', 'test-secret'),
      createAppRedeemProof('mastermind', 'handoff', 'other-secret'),
    ]) {
      const response = await verify(
        proof ? { 'x-tuturuuu-app-redeem-proof': proof } : {}
      );
      expect(response.status).toBe(401);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('mints a 300 s session for the Worker even under a looser policy', async () => {
    const response = await verify({
      'x-tuturuuu-app-redeem-proof': createAppRedeemProof(
        'mastermind',
        'handoff',
        'test-secret'
      ),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.internalAppSessionPolicy.internalAppAccessTtlSeconds).toBe(300);
    expect(
      Date.parse(body.appSessionExpiresAt) - Date.now()
    ).toBeLessThanOrEqual(300_000);
  });
});
