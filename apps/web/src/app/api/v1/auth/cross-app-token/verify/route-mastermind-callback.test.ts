import {
  createAppRedeemProof,
  createMastermindHandoffIssuerProof,
  MASTERMIND_APEX_CALLBACK,
  MASTERMIND_HOST_CALLBACK,
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
      policy: parseAppCoordinationSessionPolicy({}),
      source: 'default',
    }),
  };
});

/** The Worker's redeem: its proof, verifier, issuer proof and callback. */
const verify = (issuerProof: string | undefined, callback?: string) =>
  POST(
    new NextRequest('https://tuturuuu.com/api/v1/auth/cross-app-token/verify', {
      body: JSON.stringify({
        callback,
        codeVerifier: VERIFIER,
        issuerProof,
        targetApp: 'mastermind',
        token: 'handoff',
      }),
      headers: {
        'x-tuturuuu-app-redeem-proof': createAppRedeemProof(
          'mastermind',
          'handoff',
          'test-secret'
        ),
      },
      method: 'POST',
    })
  );

const v2 = (
  callback: typeof MASTERMIND_HOST_CALLBACK | typeof MASTERMIND_APEX_CALLBACK
) => createMastermindHandoffIssuerProof('handoff', callback);

describe('Mastermind redemption bound to its exact callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
    vi.stubEnv('MASTERMIND_SIGNIN_TRANSACTION_REQUIRED', 'true');
    vi.stubEnv('MASTERMIND_APEX_CALLBACK', 'true');
    const redeemed = {
      data: [
        { session_data: { email: 'owner@example.com' }, user_id: 'owner' },
      ],
      error: null,
    };
    mocks.rpc.mockResolvedValue(redeemed);
    mocks.adminRpc.mockResolvedValue(redeemed);
  });

  it('redeems a v2 proof only through the callback it was issued for', async () => {
    for (const callback of [
      MASTERMIND_HOST_CALLBACK,
      MASTERMIND_APEX_CALLBACK,
    ] as const) {
      expect((await verify(v2(callback), callback)).status).toBe(200);
    }
    expect(mocks.adminRpc).toHaveBeenCalledTimes(2);
  });

  it('treats a redeem without a declared callback as the host one', async () => {
    // A dedicated-host Worker that does not declare its callback still signs
    // in once v2 issuance is on; an apex handoff never redeems there.
    expect((await verify(v2(MASTERMIND_HOST_CALLBACK))).status).toBe(200);
    expect((await verify(v2(MASTERMIND_APEX_CALLBACK))).status).toBe(401);
    expect(mocks.adminRpc).toHaveBeenCalledTimes(1);
  });

  it('refuses host-to-apex and apex-to-host cross-redemption before redeeming', async () => {
    for (const [proof, callback] of [
      [v2(MASTERMIND_HOST_CALLBACK), MASTERMIND_APEX_CALLBACK],
      [v2(MASTERMIND_APEX_CALLBACK), MASTERMIND_HOST_CALLBACK],
      [v2(MASTERMIND_APEX_CALLBACK), undefined],
      [v2(MASTERMIND_HOST_CALLBACK), 'https://tuturuuu.com/verify-token'],
    ] as const) {
      expect((await verify(proof, callback)).status).toBe(401);
    }
    expect(mocks.adminRpc).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('refuses a v1 proof while the apex flag is on', async () => {
    const v1 = createMastermindHandoffIssuerProof('handoff');
    for (const callback of [
      undefined,
      MASTERMIND_HOST_CALLBACK,
      MASTERMIND_APEX_CALLBACK,
    ]) {
      expect((await verify(v1, callback)).status).toBe(401);
    }
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it('keeps v1 for the host callback only while the apex flag is off', async () => {
    vi.stubEnv('MASTERMIND_APEX_CALLBACK', '');
    const v1 = createMastermindHandoffIssuerProof('handoff');
    expect((await verify(v1)).status).toBe(200);
    expect((await verify(v1, MASTERMIND_HOST_CALLBACK)).status).toBe(200);
    expect(mocks.adminRpc).toHaveBeenCalledTimes(2);
    mocks.adminRpc.mockClear();
    // The apex callback is refused outright while its flag is off.
    expect((await verify(v1, MASTERMIND_APEX_CALLBACK)).status).toBe(401);
    expect(
      (await verify(v2(MASTERMIND_APEX_CALLBACK), MASTERMIND_APEX_CALLBACK))
        .status
    ).toBe(401);
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it('refuses the apex callback when transactions are not required', async () => {
    vi.stubEnv('MASTERMIND_SIGNIN_TRANSACTION_REQUIRED', '');
    for (const proof of [undefined, v2(MASTERMIND_APEX_CALLBACK)]) {
      expect((await verify(proof, MASTERMIND_APEX_CALLBACK)).status).toBe(401);
    }
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });
});
