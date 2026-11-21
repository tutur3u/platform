import { createAppRedeemProof } from '@tuturuuu/auth/app-redeem-proof';
import { createAppSessionTokenPair } from '@tuturuuu/auth/app-session';
import { DEFAULT_APP_COORDINATION_SESSION_POLICY } from '@tuturuuu/auth/app-session-policy';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({ getUserById: vi.fn() }));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    auth: { admin: { getUserById: mocks.getUserById } },
  }),
}));
vi.mock('@/lib/app-coordination/session-policy', () => ({
  getAppCoordinationSessionPolicy: vi.fn().mockResolvedValue({
    policy: DEFAULT_APP_COORDINATION_SESSION_POLICY,
    source: 'default',
  }),
}));

describe('Mastermind refresh redemption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
  });

  it('refuses a refresh credential without the Worker proof', async () => {
    const { refresh } = createAppSessionTokenPair(
      { targetApp: 'mastermind', userId: 'owner', email: 'owner@example.com' },
      { secret: 'test-secret' }
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const proof of [
      undefined,
      createAppRedeemProof('mastermind', 'another', 'test-secret'),
    ]) {
      const response = await POST(
        new NextRequest(
          'https://tuturuuu.com/api/v1/auth/cross-app-session/refresh',
          {
            body: JSON.stringify({
              refreshToken: refresh.token,
              targetApp: 'mastermind',
            }),
            headers: proof ? { 'x-tuturuuu-app-redeem-proof': proof } : {},
            method: 'POST',
          }
        )
      );
      expect(response.status).toBe(401);
    }
    expect(mocks.getUserById).not.toHaveBeenCalled();
    expect(
      warn.mock.calls.every(
        ([line]) => JSON.parse(String(line)).code === 'REDEEM_PROOF_REQUIRED'
      )
    ).toBe(true);
  });
});
