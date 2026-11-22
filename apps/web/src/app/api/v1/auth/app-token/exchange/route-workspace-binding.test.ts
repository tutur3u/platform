// @vitest-environment jsdom
import './route-test-support';
import {
  createAppCoordinationToken,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import { beforeEach, describe, expect, it } from 'vitest';
import { POST } from './route';
import {
  createExchangeRequest,
  mockRegisteredApp,
  mocks,
  registerExchangeTestSetup,
  victimUserId,
  workspaceId,
} from './route-test-support';

const otherWorkspaceId = '77777777-7777-4777-8777-777777777777';
const driveScopes = ['workspace:drive:read', 'workspace:drive:write'];

function exchange(body: Record<string, unknown>) {
  return POST(
    createExchangeRequest({
      appId: 'drive-app',
      appSecret: 'ttr_app_secret_test',
      requestedScopes: ['workspace:drive:read'],
      ...body,
    })
  );
}

function refreshToken(boundWorkspaceId?: string) {
  return createAppCoordinationToken(
    {
      email: 'victim@example.com',
      expiresInSeconds: 86_400,
      originApp: 'web',
      scopes: ['app-token:refresh'],
      targetApp: 'drive-app',
      userId: victimUserId,
      workspaceId: boundWorkspaceId,
    },
    { secret: 'test-secret' }
  ).token;
}

async function accessClaims(response: Response) {
  const body = (await response.json()) as { accessToken: string };
  const verification = verifyAppCoordinationToken(body.accessToken, {
    secret: 'test-secret',
  });
  expect(verification.ok).toBe(true);
  return verification.ok ? verification.claims : null;
}

describe('app token exchange workspace binding', () => {
  registerExchangeTestSetup();

  beforeEach(() => {
    mockRegisteredApp(driveScopes, 'drive-app', [workspaceId]);
  });

  it('refuses workspace scopes without a workspace before redeeming', async () => {
    const response = await exchange({ token: 'valid-cross-app-token' });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: 'WORKSPACE_ID_REQUIRED',
      error: 'Workspace ID is required for workspace scopes',
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('refuses an app default grant of workspace scopes without a workspace', async () => {
    const response = await exchange({
      requestedScopes: [],
      token: 'valid-cross-app-token',
    });

    expect(response.status).toBe(400);
  });

  it('binds workspace scopes to the resolved workspace', async () => {
    for (const requestedWorkspace of [workspaceId, 'linked-workspace']) {
      const response = await exchange({
        token: 'valid-cross-app-token',
        workspaceId: requestedWorkspace,
      });

      expect(response.status).toBe(200);
      const claims = await accessClaims(response);
      expect(claims?.workspace_id).toBe(workspaceId);
      expect(claims?.scopes).toEqual(['workspace:drive:read']);
    }
  });

  it('refuses a workspace the user is not a member of', async () => {
    const response = await exchange({
      token: 'valid-cross-app-token',
      workspaceId: otherWorkspaceId,
    });

    expect(response.status).toBe(403);
  });

  it('keeps the refresh token workspace when the request names none', async () => {
    const response = await exchange({
      refreshToken: refreshToken(workspaceId),
    });

    expect(response.status).toBe(200);
    expect((await accessClaims(response))?.workspace_id).toBe(workspaceId);
  });

  it('refuses a refresh that names another workspace', async () => {
    mockRegisteredApp(driveScopes, 'drive-app', [
      workspaceId,
      otherWorkspaceId,
    ]);

    const response = await exchange({
      refreshToken: refreshToken(workspaceId),
      workspaceId: otherWorkspaceId,
    });

    expect(response.status).toBe(403);
  });

  it('refuses an unbound refresh token for workspace scopes', async () => {
    for (const workspace of [undefined, workspaceId]) {
      const response = await exchange({
        refreshToken: refreshToken(),
        workspaceId: workspace,
      });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: 'Workspace-bound sign-in required',
      });
    }
  });
});

describe('app token exchange wildcard expansion', () => {
  registerExchangeTestSetup();

  it('issues no literal wildcard scope', async () => {
    mockRegisteredApp(
      ['*', 'workspace:*', 'workspace:drive:read'],
      'drive-app',
      [workspaceId]
    );

    const response = await exchange({
      requestedScopes: [],
      token: 'valid-cross-app-token',
      workspaceId,
    });

    expect(response.status).toBe(200);
    const claims = await accessClaims(response);
    expect(claims?.scopes).toEqual([
      'workspace:drive:read',
      'workspace:session',
    ]);
  });
});
