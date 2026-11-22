import {
  createAppRedeemProof,
  createMastermindHandoffIssuerProof,
} from '@tuturuuu/auth/app-redeem-proof';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), adminRpc: vi.fn() }));
const VERIFIER = 'v'.repeat(43);

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    rpc: mocks.adminRpc,
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

const verify = (
  headers: Record<string, string> = {},
  extra: Record<string, string | undefined> = { codeVerifier: VERIFIER }
) =>
  POST(
    new NextRequest('https://tuturuuu.com/api/v1/auth/cross-app-token/verify', {
      body: JSON.stringify({
        targetApp: 'mastermind',
        token: 'handoff',
        issuerProof: createMastermindHandoffIssuerProof('handoff'),
        ...extra,
      }),
      headers,
      method: 'POST',
    })
  );

describe('Mastermind handoff redemption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
    vi.stubEnv('MASTERMIND_SIGNIN_TRANSACTION_REQUIRED', 'true');
    const redeemed = {
      data: [
        { session_data: { email: 'owner@example.com' }, user_id: 'owner' },
      ],
      error: null,
    };
    mocks.rpc.mockResolvedValue(redeemed);
    mocks.adminRpc.mockResolvedValue(redeemed);
  });

  const proof = () => ({
    'x-tuturuuu-app-redeem-proof': createAppRedeemProof(
      'mastermind',
      'handoff',
      'test-secret'
    ),
  });

  it('refuses a handoff without the browser verifier, before redeeming it', async () => {
    for (const extra of [{}, { codeVerifier: 'short' }]) {
      const response = await verify(proof(), extra);
      expect(response.status).toBe(400);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it('redeems only through the PKCE validator with the verifier', async () => {
    expect((await verify(proof())).status).toBe(200);
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      'validate_cross_app_token_with_session_pkce',
      {
        p_code_verifier: VERIFIER,
        p_target_app: 'mastermind',
        p_token: 'handoff',
      }
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
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
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it('refuses unsigned or differently issued tokens before PKCE redemption', async () => {
    for (const issuerProof of [
      undefined,
      createMastermindHandoffIssuerProof('other-token'),
    ]) {
      expect(
        (await verify(proof(), { codeVerifier: VERIFIER, issuerProof })).status
      ).toBe(401);
    }
    expect(mocks.adminRpc).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('before the requirement is on, redeems a token without issuer proof but checks any proof sent', async () => {
    vi.stubEnv('MASTERMIND_SIGNIN_TRANSACTION_REQUIRED', '');
    expect(
      (
        await verify(proof(), {
          codeVerifier: VERIFIER,
          issuerProof: undefined,
        })
      ).status
    ).toBe(200);
    expect(mocks.adminRpc).toHaveBeenCalledTimes(1);
    mocks.adminRpc.mockClear();
    expect(
      (
        await verify(proof(), {
          codeVerifier: VERIFIER,
          issuerProof: createMastermindHandoffIssuerProof('other-token'),
        })
      ).status
    ).toBe(401);
    // The Worker proof stays required either way.
    expect(
      (await verify({}, { codeVerifier: VERIFIER, issuerProof: undefined }))
        .status
    ).toBe(401);
    expect(mocks.adminRpc).not.toHaveBeenCalled();
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
