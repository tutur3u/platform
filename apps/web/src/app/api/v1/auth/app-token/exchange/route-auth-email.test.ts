import './route-test-support';
import {
  createAppCoordinationToken,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import { describe, expect, it } from 'vitest';
import { POST } from './route';
import {
  createAdminClientMock,
  createExchangeRequest,
  mockRegisteredApp,
  mocks,
  registerExchangeTestSetup,
  victimUserId,
  workspaceId,
} from './route-test-support';

// SR-926: user_private_details.email is user-editable profile data. It must
// never become the mailbox authority (`email`) in the exchange response or in
// the bearer claims consumers authorise by.
const PROFILE_EMAIL = 'sr926-profile-claim@attacker.example';

type ExchangeBody = {
  accessToken: string;
  refreshToken: string;
  user: Record<string, unknown>;
};

function expectNoProfileEmail(body: ExchangeBody) {
  expect(JSON.stringify(body)).not.toContain(PROFILE_EMAIL);
  for (const token of [body.accessToken, body.refreshToken]) {
    const verification = verifyAppCoordinationToken(token, {
      secret: 'test-secret',
    });
    expect(verification.ok).toBe(true);
    if (verification.ok) {
      expect(JSON.stringify(verification.claims)).not.toContain(PROFILE_EMAIL);
    }
  }
}

function claimEmail(token: string) {
  const verification = verifyAppCoordinationToken(token, {
    secret: 'test-secret',
  });
  return verification.ok ? (verification.claims.email ?? null) : 'invalid';
}

describe('app token exchange email authority (SR-926)', () => {
  registerExchangeTestSetup();

  it('uses the confirmed Auth email when the profile email differs', async () => {
    mockRegisteredApp();
    mocks.createAdminClient.mockResolvedValue(
      createAdminClientMock({ privateEmail: PROFILE_EMAIL })
    );

    const response = await POST(
      createExchangeRequest({
        appId: 'yoola',
        appSecret: 'ttr_app_secret_test',
        requestedScopes: ['external-projects:read'],
        token: 'valid-cross-app-token',
        workspaceId,
      })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ExchangeBody;
    expect(body.user.email).toBe('victim@example.com');
    expect(claimEmail(body.accessToken)).toBe('victim@example.com');
    expect(claimEmail(body.refreshToken)).toBe('victim@example.com');
    expectNoProfileEmail(body);
  });

  it('never falls back to the profile email when Auth email is unconfirmed', async () => {
    mockRegisteredApp();
    mocks.createAdminClient.mockResolvedValue(
      createAdminClientMock({
        authEmailConfirmed: false,
        privateEmail: PROFILE_EMAIL,
      })
    );

    const response = await POST(
      createExchangeRequest({
        appId: 'yoola',
        appSecret: 'ttr_app_secret_test',
        requestedScopes: ['external-projects:read'],
        token: 'valid-cross-app-token',
        workspaceId,
      })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ExchangeBody;
    expect(body.user.email).toBeNull();
    expect(claimEmail(body.accessToken)).toBeNull();
    expect(claimEmail(body.refreshToken)).toBeNull();
    expectNoProfileEmail(body);
  });

  it('keeps the confirmed Auth email on refresh when the profile email differs', async () => {
    mockRegisteredApp([], 'workspace-app', [workspaceId]);
    mocks.createAdminClient.mockResolvedValue(
      createAdminClientMock({ privateEmail: PROFILE_EMAIL })
    );
    const { token: refreshToken } = createAppCoordinationToken(
      {
        email: 'victim@example.com',
        expiresInSeconds: 86_400,
        originApp: 'web',
        scopes: ['app-token:refresh'],
        targetApp: 'workspace-app',
        userId: victimUserId,
      },
      { secret: 'test-secret' }
    );

    const response = await POST(
      createExchangeRequest({
        appId: 'workspace-app',
        appSecret: 'ttr_app_secret_test',
        refreshToken,
        requestedScopes: ['workspace:session'],
        workspaceId,
      })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ExchangeBody;
    expect(body.user.email).toBe('victim@example.com');
    expect(claimEmail(body.accessToken)).toBe('victim@example.com');
    expectNoProfileEmail(body);
  });
});
