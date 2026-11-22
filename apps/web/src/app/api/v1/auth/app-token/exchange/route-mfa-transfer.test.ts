import './route-test-support';
import {
  createAppCoordinationToken,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import {
  createSessionAssuranceTransferToken,
  verifySessionAssuranceTransferToken,
} from '@tuturuuu/utils/app-coordination-token';
import { createMfaTransfer } from '@tuturuuu/utils/required-mfa-transfer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import {
  createExchangeRequest,
  mockRegisteredApp,
  mocks,
  registerExchangeTestSetup,
  victimUserId,
  workspaceId,
} from './route-test-support';

// The account requires MFA, so only a verified proof lets the exchange pass.
const boundary = vi.hoisted(() => ({ mfa: vi.fn() }));
vi.mock('@tuturuuu/utils/required-mfa-app-session', () => ({
  isRequiredMfaProofAllowed: boundary.mfa,
}));

const proof = {
  sessionId: 'victim-session',
  verifiedAt: Math.floor(Date.now() / 1000) - 5,
};

/** A transfer for the redeemed user and app, valid unless a case overrides it. */
function transferPayload() {
  return {
    expiresInSeconds: 300,
    mfa: proof,
    scopes: ['mfa:transfer'],
    targetApp: 'yoola',
    userId: victimUserId,
  };
}

function validTransfer(claims: Record<string, unknown> = {}) {
  return {
    claims: {
      mfa: proof,
      scopes: ['mfa:transfer'],
      sub: victimUserId,
      target_app: 'yoola',
      ...claims,
    },
    ok: true,
  };
}

// session_data is written by whoever calls generate_cross_app_token, so every
// signed-in user can store any value here for their own handoff.
function redeemWithSessionData(sessionData: Record<string, unknown>) {
  mocks.createClient.mockResolvedValue({
    rpc: vi.fn().mockResolvedValue({
      data: [
        {
          session_data: { email: 'victim@example.com', ...sessionData },
          user_id: victimUserId,
        },
      ],
      error: null,
    }),
  });
}

function exchange() {
  mockRegisteredApp();
  return POST(
    createExchangeRequest({
      appId: 'yoola',
      appSecret: 'ttr_app_secret_test',
      requestedScopes: ['external-projects:read'],
      token: 'handoff-token',
      workspaceId,
    })
  );
}

describe('app token exchange MFA transfer', () => {
  registerExchangeTestSetup();
  beforeEach(() => {
    boundary.mfa.mockImplementation(async (_userId, mfa) => mfa !== null);
  });

  it('carries a server-signed transfer into the issued tokens', async () => {
    redeemWithSessionData({
      mfaTransfer: createMfaTransfer(victimUserId, 'yoola', proof),
    });
    const response = await exchange();

    expect(response.status).toBe(200);
    expect(boundary.mfa).toHaveBeenCalledWith(victimUserId, proof);
    const { accessToken } = (await response.json()) as { accessToken: string };
    const claims = verifyAppCoordinationToken(accessToken, {
      secret: 'test-secret',
    });
    expect(claims.ok && claims.claims.mfa).toEqual(proof);
  });

  // Every token is signed inside the test, after the setup installs the
  // exchange secret. Each control proves the token is valid except for the one
  // binding under test, so the case cannot pass on a bad signature alone.
  it.each<[string, () => { control?: () => void; mfaTransfer: unknown }]>([
    ['a raw caller-written proof', () => ({ mfaTransfer: proof })],
    [
      'a transfer signed with another secret',
      () => {
        const { token } = createAppCoordinationToken(transferPayload(), {
          secret: 'attacker-secret',
        });
        return {
          control: () => {
            expect(
              verifyAppCoordinationToken(token, { secret: 'attacker-secret' })
            ).toMatchObject(validTransfer());
            expect(
              verifyAppCoordinationToken(token, { secret: 'test-secret' })
            ).toEqual({ error: 'Invalid token signature', ok: false });
          },
          mfaTransfer: token,
        };
      },
    ],
    [
      'a token without the transfer scope',
      () => {
        const { token } = createAppCoordinationToken(
          { ...transferPayload(), scopes: [] },
          { secret: 'test-secret' }
        );
        return {
          control: () => {
            const verified = verifyAppCoordinationToken(token, {
              secret: 'test-secret',
            });
            expect(verified).toMatchObject({
              claims: { mfa: proof, sub: victimUserId, target_app: 'yoola' },
              ok: true,
            });
            expect(verified.ok && verified.claims.scopes).not.toContain(
              'mfa:transfer'
            );
          },
          mfaTransfer: token,
        };
      },
    ],
    [
      'an assurance transfer carrying a proof',
      () => {
        const { token } = createSessionAssuranceTransferToken(
          transferPayload(),
          { secret: 'test-secret' }
        );
        return {
          control: () => {
            expect(
              verifySessionAssuranceTransferToken(token, {
                secret: 'test-secret',
              })
            ).toMatchObject(validTransfer());
            expect(
              verifyAppCoordinationToken(token, { secret: 'test-secret' })
            ).toEqual({ error: 'Invalid token claims', ok: false });
          },
          mfaTransfer: token,
        };
      },
    ],
    [
      'a transfer minted for another app',
      () => {
        const { token } = createAppCoordinationToken(
          { ...transferPayload(), targetApp: 'other' },
          { secret: 'test-secret' }
        );
        return {
          control: () =>
            expect(
              verifyAppCoordinationToken(token, { secret: 'test-secret' })
            ).toMatchObject(validTransfer({ target_app: 'other' })),
          mfaTransfer: token,
        };
      },
    ],
    [
      'a transfer minted for another user',
      () => {
        const { token } = createAppCoordinationToken(
          { ...transferPayload(), userId: 'attacker' },
          { secret: 'test-secret' }
        );
        return {
          control: () =>
            expect(
              verifyAppCoordinationToken(token, { secret: 'test-secret' })
            ).toMatchObject(validTransfer({ sub: 'attacker' })),
          mfaTransfer: token,
        };
      },
    ],
    [
      'an expired transfer',
      () => {
        const issuedAt = new Date(Date.now() - 301_000);
        const { token } = createAppCoordinationToken(transferPayload(), {
          now: issuedAt,
          secret: 'test-secret',
        });
        return {
          control: () => {
            expect(
              verifyAppCoordinationToken(token, { secret: 'test-secret' })
            ).toEqual({ error: 'Token expired', ok: false });
            expect(
              verifyAppCoordinationToken(token, {
                now: issuedAt,
                secret: 'test-secret',
              })
            ).toMatchObject(validTransfer());
          },
          mfaTransfer: token,
        };
      },
    ],
  ])('refuses %s', async (_label, build) => {
    const { control, mfaTransfer } = build();
    control?.();
    redeemWithSessionData({ mfaTransfer });
    const response = await exchange();

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'MFA_REQUIRED' });
    expect(boundary.mfa).toHaveBeenCalledWith(victimUserId, null);
  });
});
