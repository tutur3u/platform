import './route-test-support';
import { verifyAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { POST } from './route';
import {
  createAdminClientMock,
  createExchangeRequest,
  expectPendingInvitationAction,
  mockRegisteredApp,
  mocks,
  registerExchangeTestSetup,
  victimUserId,
  workspaceId,
} from './route-test-support';

describe('app token exchange route', () => {
  registerExchangeTestSetup();
  it('rejects configured target exchanges without app credentials', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/v1/auth/app-token/exchange', {
        body: JSON.stringify({
          requestedScopes: [],
          targetApp: 'cms',
          token: 'forged-cross-app-token',
        }),
        method: 'POST',
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Missing app credentials',
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('exchanges a valid registered app credential for a scoped app token', async () => {
    mockRegisteredApp();

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
    const body = (await response.json()) as {
      accessToken: string;
      refreshEarlySeconds: number;
      refreshExpiresAt: string;
      refreshToken: string;
      scopes: string[];
      user: Record<string, unknown>;
      workspaceId?: string;
    };
    const verification = verifyAppCoordinationToken(body.accessToken, {
      secret: 'test-secret',
    });
    const refreshVerification = verifyAppCoordinationToken(body.refreshToken, {
      secret: 'test-secret',
    });

    expect(body.refreshEarlySeconds).toBeGreaterThan(0);
    expect(body.refreshExpiresAt).toEqual(expect.any(String));
    expect(body.scopes).toEqual(['external-projects:read']);
    expect(body.user).toMatchObject({
      avatarUrl: 'https://example.com/victim.png',
      avatar_url: 'https://example.com/victim.png',
      displayName: 'Victim Display Name',
      display_name: 'Victim Display Name',
      email: 'victim@example.com',
      fullName: 'Victim Full Name',
      full_name: 'Victim Full Name',
      id: victimUserId,
      name: 'Victim Display Name',
    });
    expect(body.workspaceId).toBe(workspaceId);
    expect(verification.ok).toBe(true);
    if (verification.ok) {
      expect(verification.claims.sub).toBe(victimUserId);
      expect(verification.claims.target_app).toBe('yoola');
      expect(verification.claims.scopes).toEqual(['external-projects:read']);
    }
    expect(refreshVerification.ok).toBe(true);
    if (refreshVerification.ok) {
      expect(refreshVerification.claims.sub).toBe(victimUserId);
      expect(refreshVerification.claims.target_app).toBe('yoola');
      expect(refreshVerification.claims.scopes).toEqual(['app-token:refresh']);
    }
  });

  it('allows requested workspace session when the app is linked to the workspace', async () => {
    mockRegisteredApp([], 'workspace-app', [workspaceId]);

    const response = await POST(
      createExchangeRequest({
        appId: 'workspace-app',
        appSecret: 'ttr_app_secret_test',
        requestedScopes: ['workspace:session'],
        token: 'valid-cross-app-token',
        workspaceId,
      })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      accessToken: string;
      scopes: string[];
      user: Record<string, unknown>;
      workspaceId?: string;
    };
    const verification = verifyAppCoordinationToken(body.accessToken, {
      secret: 'test-secret',
    });

    expect(body.workspaceId).toBe(workspaceId);
    expect(body.scopes).toEqual(['workspace:session']);
    expect(verification.ok).toBe(true);
    if (verification.ok) {
      expect(verification.claims.target_app).toBe('workspace-app');
      expect(verification.claims.scopes).toEqual(['workspace:session']);
    }
  });

  it('allows configured workspace session scope when the app is linked to the workspace', async () => {
    mockRegisteredApp(['workspace:session'], 'workspace-app', [workspaceId]);

    const response = await POST(
      createExchangeRequest({
        appId: 'workspace-app',
        appSecret: 'ttr_app_secret_test',
        requestedScopes: ['workspace:session'],
        token: 'valid-cross-app-token',
        workspaceId,
      })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      accessToken: string;
      scopes: string[];
      user: Record<string, unknown>;
      workspaceId?: string;
    };
    const verification = verifyAppCoordinationToken(body.accessToken, {
      secret: 'test-secret',
    });

    expect(body.workspaceId).toBe(workspaceId);
    expect(body.scopes).toEqual(['workspace:session']);
    expect(verification.ok).toBe(true);
    if (verification.ok) {
      expect(verification.claims.target_app).toBe('workspace-app');
      expect(verification.claims.scopes).toEqual(['workspace:session']);
    }
  });

  it('infers workspace session when a workspace-linked app requests no scopes', async () => {
    mockRegisteredApp([], 'workspace-app', [workspaceId]);

    const response = await POST(
      createExchangeRequest({
        appId: 'workspace-app',
        appSecret: 'ttr_app_secret_test',
        token: 'valid-cross-app-token',
        workspaceId,
      })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      accessToken: string;
      scopes: string[];
      workspaceId?: string;
    };
    const verification = verifyAppCoordinationToken(body.accessToken, {
      secret: 'test-secret',
    });

    expect(body.workspaceId).toBe(workspaceId);
    expect(body.scopes).toEqual(['workspace:session']);
    expect(verification.ok).toBe(true);
    if (verification.ok) {
      expect(verification.claims.target_app).toBe('workspace-app');
      expect(verification.claims.scopes).toEqual(['workspace:session']);
    }
  });

  it('rejects workspace session exchanges without a workspace id', async () => {
    mockRegisteredApp([], 'workspace-app', [workspaceId]);

    const response = await POST(
      createExchangeRequest({
        appId: 'workspace-app',
        appSecret: 'ttr_app_secret_test',
        requestedScopes: ['workspace:session'],
        token: 'valid-cross-app-token',
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Missing workspace ID for workspace session scope',
    });
  });

  it('rejects workspace session exchanges for unlinked workspaces', async () => {
    mockRegisteredApp([], 'workspace-app', [
      '33333333-3333-4333-8333-333333333333',
    ]);

    const response = await POST(
      createExchangeRequest({
        appId: 'workspace-app',
        appSecret: 'ttr_app_secret_test',
        requestedScopes: ['workspace:session'],
        token: 'valid-cross-app-token',
        workspaceId,
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'App is not linked to this workspace',
    });
  });

  it('rejects non-members for workspace session exchanges', async () => {
    mockRegisteredApp([], 'workspace-app', [workspaceId]);
    mocks.createAdminClient.mockResolvedValue(
      createAdminClientMock({ workspaceMember: false })
    );

    const response = await POST(
      createExchangeRequest({
        appId: 'workspace-app',
        appSecret: 'ttr_app_secret_test',
        requestedScopes: ['workspace:session'],
        token: 'valid-cross-app-token',
        workspaceId,
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('returns pending invite details for workspace session exchanges', async () => {
    mockRegisteredApp([], 'workspace-app', [workspaceId]);
    mocks.createAdminClient.mockResolvedValue(
      createAdminClientMock({
        pendingDirectInvite: true,
        workspaceMember: false,
      })
    );

    const response = await POST(
      createExchangeRequest({
        appId: 'workspace-app',
        appSecret: 'ttr_app_secret_test',
        requestedScopes: ['workspace:session'],
        token: 'valid-cross-app-token',
        workspaceId,
      })
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as {
      code?: string;
      invitation?: {
        role?: string;
        source?: string;
        workspaceId?: string;
        workspaceName?: string | null;
      };
      invitationActionToken?: string;
      invitationUrl?: string;
      workspaceId?: string;
    };
    expectPendingInvitationAction(body, 'workspace-app');
  });
});
