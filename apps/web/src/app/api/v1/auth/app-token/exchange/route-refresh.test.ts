import './route-test-support';
import {
  createAppCoordinationToken,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import { describe, expect, it, vi } from 'vitest';
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
  it('refreshes workspace session app tokens without a fresh cross-app token', async () => {
    mockRegisteredApp([], 'workspace-app', [workspaceId]);
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
    expect(mocks.createClient).not.toHaveBeenCalled();
    const body = (await response.json()) as {
      accessToken: string;
      user: Record<string, unknown>;
      workspaceId?: string;
    };
    const accessVerification = verifyAppCoordinationToken(body.accessToken, {
      secret: 'test-secret',
    });

    expect(body.workspaceId).toBe(workspaceId);
    expect(body.user).toMatchObject({
      avatarUrl: 'https://example.com/victim.png',
      displayName: 'Victim Display Name',
      email: 'victim@example.com',
      fullName: 'Victim Full Name',
      name: 'Victim Display Name',
    });
    expect(accessVerification.ok).toBe(true);
    if (accessVerification.ok) {
      expect(accessVerification.claims.target_app).toBe('workspace-app');
      expect(accessVerification.claims.scopes).toEqual(['workspace:session']);
    }
  });

  it('refreshes registered app tokens without a fresh cross-app token', async () => {
    mockRegisteredApp(['external-projects:*']);
    const { token: refreshToken } = createAppCoordinationToken(
      {
        email: 'victim@example.com',
        expiresInSeconds: 86_400,
        originApp: 'web',
        scopes: ['app-token:refresh'],
        targetApp: 'yoola',
        userId: victimUserId,
      },
      { secret: 'test-secret' }
    );

    const response = await POST(
      createExchangeRequest({
        appId: 'yoola',
        appSecret: 'ttr_app_secret_test',
        refreshToken,
        requestedScopes: ['external-projects:*'],
        workspaceId,
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.createClient).not.toHaveBeenCalled();
    const body = (await response.json()) as {
      accessToken: string;
      refreshToken: string;
      workspaceId?: string;
    };
    const accessVerification = verifyAppCoordinationToken(body.accessToken, {
      secret: 'test-secret',
    });
    const nextRefreshVerification = verifyAppCoordinationToken(
      body.refreshToken,
      {
        secret: 'test-secret',
      }
    );

    expect(body.workspaceId).toBe(workspaceId);
    expect(accessVerification.ok).toBe(true);
    if (accessVerification.ok) {
      expect(accessVerification.claims.sub).toBe(victimUserId);
      expect(accessVerification.claims.target_app).toBe('yoola');
      expect(accessVerification.claims.scopes).toEqual(['external-projects:*']);
    }
    expect(nextRefreshVerification.ok).toBe(true);
    if (nextRefreshVerification.ok) {
      expect(nextRefreshVerification.claims.scopes).toEqual([
        'app-token:refresh',
      ]);
    }
    expect(mocks.redisSet).toHaveBeenCalledWith(
      expect.stringMatching(
        /^app-token:refresh:used:11111111-1111-4111-8111-111111111111:/u
      ),
      expect.any(String),
      expect.objectContaining({
        ex: expect.any(Number),
        nx: true,
      })
    );
  });

  it('rejects replayed registered app refresh tokens after the replay grace window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T00:00:00.000Z'));
    mockRegisteredApp(['external-projects:*']);
    mocks.redisGet.mockResolvedValue(Math.floor(Date.now() / 1000) - 31);
    const { token: refreshToken } = createAppCoordinationToken(
      {
        email: 'victim@example.com',
        expiresInSeconds: 86_400,
        originApp: 'web',
        scopes: ['app-token:refresh'],
        targetApp: 'yoola',
        userId: victimUserId,
      },
      { secret: 'test-secret' }
    );

    const response = await POST(
      createExchangeRequest({
        appId: 'yoola',
        appSecret: 'ttr_app_secret_test',
        refreshToken,
        requestedScopes: ['external-projects:*'],
        workspaceId,
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid or expired refresh token',
    });
    expect(mocks.redisSet).not.toHaveBeenCalled();
  });

  it('rejects refresh requests with non-refresh app tokens', async () => {
    mockRegisteredApp(['external-projects:*']);
    const { token: accessToken } = createAppCoordinationToken(
      {
        email: 'victim@example.com',
        expiresInSeconds: 86_400,
        originApp: 'web',
        scopes: ['external-projects:*'],
        targetApp: 'yoola',
        userId: victimUserId,
      },
      { secret: 'test-secret' }
    );

    const response = await POST(
      createExchangeRequest({
        appId: 'yoola',
        appSecret: 'ttr_app_secret_test',
        refreshToken: accessToken,
        requestedScopes: ['external-projects:*'],
        workspaceId,
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid or expired refresh token',
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('rejects external-project app exchanges without a linked workspace id', async () => {
    mockRegisteredApp(['external-projects:*']);

    const response = await POST(
      createExchangeRequest({
        appId: 'yoola',
        appSecret: 'ttr_app_secret_test',
        requestedScopes: ['external-projects:*'],
        token: 'valid-cross-app-token',
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Missing workspace ID for external project scopes',
    });
  });

  it('rejects users without linked workspace EPM permission', async () => {
    mockRegisteredApp(['external-projects:*']);
    mocks.createAdminClient.mockResolvedValue(
      createAdminClientMock({ workspacePermissions: [] })
    );

    const response = await POST(
      createExchangeRequest({
        appId: 'yoola',
        appSecret: 'ttr_app_secret_test',
        requestedScopes: ['external-projects:*'],
        token: 'valid-cross-app-token',
        workspaceId,
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('rejects non-members of the linked workspace', async () => {
    mockRegisteredApp(['external-projects:*']);
    mocks.createAdminClient.mockResolvedValue(
      createAdminClientMock({ workspaceMember: false })
    );

    const response = await POST(
      createExchangeRequest({
        appId: 'yoola',
        appSecret: 'ttr_app_secret_test',
        requestedScopes: ['external-projects:*'],
        token: 'valid-cross-app-token',
        workspaceId,
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it.each(['yoola', 'shiraoki'])(
    'returns pending invite details for %s workspace-scoped app exchange',
    async (appId) => {
      mockRegisteredApp(['external-projects:*'], appId);
      mocks.createAdminClient.mockResolvedValue(
        createAdminClientMock({
          appAdapter: appId,
          pendingDirectInvite: true,
          workspaceMember: false,
          workspacePermissions: [],
        })
      );

      const response = await POST(
        createExchangeRequest({
          appId,
          appSecret: 'ttr_app_secret_test',
          requestedScopes: ['external-projects:*'],
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
      expectPendingInvitationAction(body, appId);
    }
  );

  it('rejects external-project app exchanges when the app does not match the workspace adapter', async () => {
    mockRegisteredApp(['external-projects:*']);
    mocks.createAdminClient.mockResolvedValue(
      createAdminClientMock({ appAdapter: 'junly' })
    );

    const response = await POST(
      createExchangeRequest({
        appId: 'yoola',
        appSecret: 'ttr_app_secret_test',
        requestedScopes: ['external-projects:*'],
        token: 'valid-cross-app-token',
        workspaceId,
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'App is not linked to this workspace',
    });
  });

  it('rejects external-project app exchanges for disabled or unbound workspaces', async () => {
    mockRegisteredApp(['external-projects:*']);
    mocks.createAdminClient.mockResolvedValue(
      createAdminClientMock({ bindingEnabled: false })
    );

    const response = await POST(
      createExchangeRequest({
        appId: 'yoola',
        appSecret: 'ttr_app_secret_test',
        requestedScopes: ['external-projects:*'],
        token: 'valid-cross-app-token',
        workspaceId,
      })
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'External project studio unavailable for this workspace',
    });
  });

  it.each(['external-projects:read', 'external-projects:publish'])(
    'allows publish-only linked workspace access for %s app scope',
    async (requestedScope) => {
      mockRegisteredApp([requestedScope]);
      mocks.createAdminClient.mockResolvedValue(
        createAdminClientMock({
          workspacePermissions: ['publish_external_projects'],
        })
      );

      const response = await POST(
        createExchangeRequest({
          appId: 'yoola',
          appSecret: 'ttr_app_secret_test',
          requestedScopes: [requestedScope],
          token: 'valid-cross-app-token',
          workspaceId,
        })
      );

      expect(response.status).toBe(200);
    }
  );

  it('rejects publish-only linked workspace access for manage app scopes', async () => {
    mockRegisteredApp(['external-projects:*']);
    mocks.createAdminClient.mockResolvedValue(
      createAdminClientMock({
        workspacePermissions: ['publish_external_projects'],
      })
    );

    const response = await POST(
      createExchangeRequest({
        appId: 'yoola',
        appSecret: 'ttr_app_secret_test',
        requestedScopes: ['external-projects:*'],
        token: 'valid-cross-app-token',
        workspaceId,
      })
    );

    expect(response.status).toBe(403);
  });

  it('rejects root EPM admins without linked workspace membership', async () => {
    mockRegisteredApp(['external-projects:*']);
    mocks.createAdminClient.mockResolvedValue(
      createAdminClientMock({
        rootPermissions: ['manage_external_projects'],
        workspaceMember: false,
        workspacePermissions: [],
      })
    );

    const response = await POST(
      createExchangeRequest({
        appId: 'yoola',
        appSecret: 'ttr_app_secret_test',
        requestedScopes: ['external-projects:*'],
        token: 'valid-cross-app-token',
        workspaceId,
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('allows root EPM admins who are also linked workspace members', async () => {
    mockRegisteredApp(['external-projects:*']);
    mocks.createAdminClient.mockResolvedValue(
      createAdminClientMock({
        rootPermissions: ['manage_external_projects'],
        workspaceMember: true,
        workspacePermissions: [],
      })
    );

    const response = await POST(
      createExchangeRequest({
        appId: 'yoola',
        appSecret: 'ttr_app_secret_test',
        requestedScopes: ['external-projects:*'],
        token: 'valid-cross-app-token',
        workspaceId,
      })
    );

    expect(response.status).toBe(200);
  });
});
