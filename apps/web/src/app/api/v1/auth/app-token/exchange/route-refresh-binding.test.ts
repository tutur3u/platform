// @vitest-environment jsdom
import './route-test-support';
import {
  createAppCoordinationToken,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import { beforeEach, describe, expect, it } from 'vitest';
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

const MARKER = 'app-token:bound-on-refresh';
const grants = ['external-projects:*', 'workspace:drive:read'];

function exchange(body: Record<string, unknown>) {
  return POST(
    createExchangeRequest({
      appId: 'yoola',
      appSecret: 'ttr_app_secret_test',
      requestedScopes: ['workspace:drive:read'],
      ...body,
    })
  );
}

function refreshToken(
  boundWorkspaceId?: string,
  scopes = ['app-token:refresh']
) {
  return createAppCoordinationToken(
    {
      email: 'victim@example.com',
      expiresInSeconds: 86_400,
      originApp: 'web',
      scopes,
      targetApp: 'yoola',
      userId: victimUserId,
      workspaceId: boundWorkspaceId,
    },
    { secret: 'test-secret' }
  ).token;
}

function claimsOf(token: string) {
  const verification = verifyAppCoordinationToken(token, {
    secret: 'test-secret',
  });
  expect(verification.ok).toBe(true);
  return verification.ok ? verification.claims : null;
}

async function rotatedRefreshToken(response: Response) {
  expect(response.status).toBe(200);
  return ((await response.json()) as { refreshToken: string }).refreshToken;
}

describe('app token exchange bind on refresh', () => {
  registerExchangeTestSetup();

  beforeEach(() => {
    mockRegisteredApp(grants, 'yoola', [workspaceId]);
  });

  it('does not consume an unbound refresh token it answers 400 for', async () => {
    const token = refreshToken();

    const missing = await exchange({ refreshToken: token });
    expect(missing.status).toBe(400);
    expect(mocks.redisSet).not.toHaveBeenCalled();

    const retried = await exchange({ refreshToken: token, workspaceId });
    expect(retried.status).toBe(200);
  });

  it('marks the rotated family and keeps the marker on later refreshes', async () => {
    const bound = await rotatedRefreshToken(
      await exchange({ refreshToken: refreshToken(), workspaceId })
    );
    expect(claimsOf(bound)).toMatchObject({ workspace_id: workspaceId });
    expect(claimsOf(bound)?.scopes).toContain(MARKER);

    const next = await rotatedRefreshToken(
      await exchange({ refreshToken: bound })
    );
    expect(claimsOf(next)?.scopes).toContain(MARKER);
  });

  it('refuses external-project scopes for a family bound on refresh', async () => {
    const bound = await rotatedRefreshToken(
      await exchange({ refreshToken: refreshToken(), workspaceId })
    );

    const response = await exchange({
      refreshToken: bound,
      requestedScopes: ['external-projects:*'],
    });

    expect(response.status).toBe(401);
  });

  it('keeps external-project scopes for a refresh token bound at sign-in', async () => {
    const response = await exchange({
      refreshToken: refreshToken(workspaceId),
      requestedScopes: ['external-projects:read'],
    });

    expect(response.status).toBe(200);
  });

  it('answers a pending invitation on refresh with a plain 403', async () => {
    mocks.createAdminClient.mockResolvedValue(
      createAdminClientMock({
        pendingDirectInvite: true,
        workspaceMember: false,
      })
    );

    // Bound on refresh: a bound token would fail the refresh grant first.
    const response = await exchange({
      refreshToken: refreshToken(),
      workspaceId,
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty('invitationActionToken');
    expect(body).not.toHaveProperty('code');
  });
  it('spends the token when the named workspace refuses the user', async () => {
    mocks.createAdminClient.mockResolvedValue(
      createAdminClientMock({ workspaceMember: false })
    );
    const token = refreshToken();
    expect((await exchange({ refreshToken: token, workspaceId })).status).toBe(
      403
    );
    expect(mocks.redisSet).toHaveBeenCalled();

    // The retry finds the first use recorded outside the replay grace.
    mocks.redisSet.mockResolvedValueOnce(null);
    mocks.redisGet.mockImplementation(async (key: string) =>
      key.startsWith('app-token:refresh:family-revoked:')
        ? null
        : Math.floor(Date.now() / 1000) - 3600
    );
    expect((await exchange({ refreshToken: token, workspaceId })).status).toBe(
      401
    );
  });

  // Last: the replay fence keeps in-process state for the rest of the file.
  it('cannot bind the same unbound token twice inside the replay grace', async () => {
    const token = refreshToken();
    expect((await exchange({ refreshToken: token, workspaceId })).status).toBe(
      200
    );

    // The retry loses SET NX and reads a first use inside the grace window.
    mocks.redisSet.mockResolvedValueOnce(null);
    mocks.redisGet.mockImplementation(async (key: string) =>
      key.startsWith('app-token:refresh:family-revoked:')
        ? null
        : Math.floor(Date.now() / 1000)
    );
    const retry = await exchange({ refreshToken: token, workspaceId });

    expect(retry.status).toBe(401);
  });
});
