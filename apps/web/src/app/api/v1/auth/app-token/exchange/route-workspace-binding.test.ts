// @vitest-environment jsdom
import './route-test-support';
import {
  createAppCoordinationToken,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
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

  it('signs in with an identity-only token when it names no workspace and no scopes', async () => {
    const response = await exchange({
      requestedScopes: [],
      token: 'valid-cross-app-token',
    });

    expect(response.status).toBe(200);
    const claims = await accessClaims(response);
    expect(claims?.scopes).toEqual([]);
    expect(claims?.workspace_id).toBeUndefined();
  });

  it('keeps the default grant for a sign-in that names its workspace', async () => {
    const response = await exchange({
      requestedScopes: [],
      token: 'valid-cross-app-token',
      workspaceId,
    });

    expect(response.status).toBe(200);
    const claims = await accessClaims(response);
    expect(claims?.workspace_id).toBe(workspaceId);
    expect(claims?.scopes).toEqual(
      expect.arrayContaining(['workspace:drive:read', 'workspace:drive:write'])
    );
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

  it("keeps a bound refresh token's default grant when it names no workspace and no scopes", async () => {
    const response = await exchange({
      refreshToken: refreshToken(workspaceId),
      requestedScopes: [],
    });

    expect(response.status).toBe(200);
    const claims = await accessClaims(response);
    expect(claims?.workspace_id).toBe(workspaceId);
    expect(claims?.scopes).toEqual(
      expect.arrayContaining(['workspace:drive:read', 'workspace:drive:write'])
    );
  });

  it('still asks an unbound refresh token with no scopes for a workspace', async () => {
    const response = await exchange({
      refreshToken: refreshToken(),
      requestedScopes: [],
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'WORKSPACE_ID_REQUIRED',
    });
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

  it('asks for a workspace on an unbound refresh token', async () => {
    const response = await exchange({ refreshToken: refreshToken() });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'WORKSPACE_ID_REQUIRED',
    });
  });

  it('binds an unbound refresh token that names its workspace', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const response = await exchange({
      refreshToken: refreshToken(),
      workspaceId: 'linked-workspace',
    });

    expect(response.status).toBe(200);
    const body = (await response.clone().json()) as { refreshToken: string };
    expect((await accessClaims(response))?.workspace_id).toBe(workspaceId);
    const rotated = verifyAppCoordinationToken(body.refreshToken, {
      secret: 'test-secret',
    });
    expect(rotated.ok && rotated.claims.workspace_id).toBe(workspaceId);
    expect(info).toHaveBeenCalledWith(expect.any(String), {
      targetApp: 'drive-app',
    });
    info.mockRestore();
  });

  it('runs the workspace checks before binding on refresh', async () => {
    const response = await exchange({
      refreshToken: refreshToken(),
      workspaceId: otherWorkspaceId,
    });

    expect(response.status).toBe(403);
  });

  it('stops binding on refresh after the sunset', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-23T23:59:00+07:00'));
    const token = refreshToken();

    const response = await exchange({ refreshToken: token, workspaceId });

    expect(response.status).toBe(401);
  });

  it('never binds an external-project refresh token on refresh', async () => {
    mockRegisteredApp(['external-projects:read'], 'drive-app', [workspaceId]);

    const response = await exchange({
      refreshToken: refreshToken(),
      requestedScopes: ['external-projects:read'],
      workspaceId,
    });

    expect(response.status).toBe(401);
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
