import './route-test-support';
import {
  createAppCoordinationToken,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import { createSessionAssuranceTransferToken } from '@tuturuuu/utils/app-coordination-token';
import { createSessionAssuranceTransfer } from '@tuturuuu/utils/session-assurance-transfer';
import { describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import {
  createExchangeRequest,
  mockRegisteredApp,
  mocks,
  registerExchangeTestSetup,
  victimUserId,
  workspaceId,
} from './route-test-support';

type ExchangeBody = {
  aal?: string;
  accessToken: string;
  amr?: string[];
  refreshToken: string;
};

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

async function exchange(body: Record<string, unknown> = {}) {
  mockRegisteredApp();
  const response = await POST(
    createExchangeRequest({
      appId: 'yoola',
      appSecret: 'ttr_app_secret_test',
      requestedScopes: ['external-projects:read'],
      token: 'handoff-token',
      workspaceId,
      ...body,
    })
  );
  expect(response.status).toBe(200);
  return (await response.json()) as ExchangeBody;
}

function tokenClaims(token: string) {
  const verified = verifyAppCoordinationToken(token, { secret: 'test-secret' });
  if (!verified.ok) throw new Error(verified.error);
  return verified.claims;
}

describe('app token exchange session assurance', () => {
  registerExchangeTestSetup();

  it('reports an aal2 handoff and carries it into the issued tokens', async () => {
    redeemWithSessionData({
      assuranceTransfer: createSessionAssuranceTransfer(victimUserId, 'yoola', {
        aal: 'aal2',
        amr: ['password', 'totp'],
      }),
    });
    const body = await exchange();

    expect(body.aal).toBe('aal2');
    expect(body.amr).toEqual(['password', 'totp']);
    expect(tokenClaims(body.accessToken)).toMatchObject({
      aal: 'aal2',
      amr: ['password', 'totp'],
    });
    expect(tokenClaims(body.refreshToken).aal).toBe('aal2');
  });

  it('reports an aal1 handoff', async () => {
    redeemWithSessionData({
      assuranceTransfer: createSessionAssuranceTransfer(victimUserId, 'yoola', {
        aal: 'aal1',
      }),
    });
    const body = await exchange();

    expect(body.aal).toBe('aal1');
    expect(body).not.toHaveProperty('amr');
  });

  it('omits assurance when the handoff does not carry it', async () => {
    const body = await exchange();

    expect(body).not.toHaveProperty('aal');
    expect(body).not.toHaveProperty('amr');
    expect(tokenClaims(body.accessToken)).not.toHaveProperty('aal');
  });

  it.each([
    ['raw caller-written session data', { aal: 'aal2', amr: ['totp'] }],
    [
      'a transfer signed with another secret',
      {
        assuranceTransfer: createSessionAssuranceTransferToken(
          {
            aal: 'aal2',
            scopes: ['assurance:transfer'],
            targetApp: 'yoola',
            userId: victimUserId,
          },
          { secret: 'attacker-secret' }
        ).token,
      },
    ],
    [
      'a general app-coordination token',
      {
        assuranceTransfer: createAppCoordinationToken({
          aal: 'aal2',
          scopes: ['assurance:transfer'],
          targetApp: 'yoola',
          userId: victimUserId,
        }).token,
      },
    ],
    [
      'a transfer minted for another app',
      {
        assuranceTransfer: createSessionAssuranceTransfer(
          victimUserId,
          'other',
          {
            aal: 'aal2',
          }
        ),
      },
    ],
    [
      'a transfer minted for another user',
      {
        assuranceTransfer: createSessionAssuranceTransfer('attacker', 'yoola', {
          aal: 'aal2',
        }),
      },
    ],
  ])('cannot be spoofed with %s', async (_label, sessionData) => {
    redeemWithSessionData(sessionData);
    const body = await exchange();

    expect(body).not.toHaveProperty('aal');
    expect(tokenClaims(body.accessToken)).not.toHaveProperty('aal');
  });

  it('ignores assurance fields in the exchange request body', async () => {
    const body = await exchange({ aal: 'aal2', amr: ['totp'] });

    expect(body).not.toHaveProperty('aal');
  });

  it.each([
    ['carries', { aal: 'aal2' as const, amr: ['totp'] }, 'aal2'],
    ['omits', {}, undefined],
  ])('%s assurance across a refresh', async (_label, assurance, expected) => {
    const { token: refreshToken } = createAppCoordinationToken(
      {
        ...assurance,
        email: 'victim@example.com',
        expiresInSeconds: 86_400,
        scopes: ['app-token:refresh'],
        targetApp: 'yoola',
        userId: victimUserId,
      },
      { secret: 'test-secret' }
    );
    const body = await exchange({ refreshToken, token: undefined });

    expect(body.aal).toBe(expected);
    expect(tokenClaims(body.accessToken).aal).toBe(expected);
  });
});
