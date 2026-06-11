import {
  createAppCoordinationToken,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getAppDomainMap: vi.fn(),
  serverLoggerWarn: vi.fn(),
  verifyExternalAppSecret: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@tuturuuu/utils/internal-domains', () => ({
  getAppDomainMap: () => mocks.getAppDomainMap(),
  getLocalInternalAppUrl: (_app: string, fallback: string) => fallback,
}));

vi.mock('@/lib/app-coordination/external-apps', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/lib/app-coordination/external-apps')
    >();

  return {
    ...actual,
    verifyExternalAppSecret: (
      ...args: Parameters<typeof mocks.verifyExternalAppSecret>
    ) => mocks.verifyExternalAppSecret(...args),
  };
});

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    warn: (...args: Parameters<typeof mocks.serverLoggerWarn>) =>
      mocks.serverLoggerWarn(...args),
  },
  withRequestLogDrain: (_metadata: unknown, handler: () => Promise<Response>) =>
    handler(),
}));

import { POST } from './route';

const victimUserId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';

type PermissionId =
  | 'manage_external_projects'
  | 'publish_external_projects'
  | 'manage_workspace_roles';

type AdminState = {
  appAdapter?: string;
  bindingEnabled?: boolean;
  canonicalActive?: boolean;
  pendingDirectInvite?: boolean;
  pendingEmailInvite?: boolean;
  privateEmail?: string | null;
  workspacePersonal?: boolean;
  workspaceMember?: boolean;
  workspacePermissions?: PermissionId[];
  rootPermissions?: PermissionId[];
};

function createQueryResult(
  data: unknown,
  error: { message: string } | null = null
) {
  return { data, error };
}

function createAdminClientMock(state: AdminState = {}) {
  const adminState = {
    appAdapter: 'yoola',
    bindingEnabled: true,
    canonicalActive: true,
    pendingDirectInvite: false,
    pendingEmailInvite: false,
    privateEmail: 'victim@example.com',
    rootPermissions: [],
    workspacePersonal: false,
    workspaceMember: true,
    workspacePermissions: ['manage_external_projects'],
    ...state,
  };

  function resolveTable(table: string, filters: Record<string, unknown>) {
    const wsId = (filters.ws_id ?? filters['workspace_roles.ws_id']) as
      | string
      | undefined;
    const userId = filters.user_id as string | undefined;

    if (table === 'workspace_secrets') {
      if (!adminState.bindingEnabled) return createQueryResult([]);

      return createQueryResult([
        { name: 'EXTERNAL_PROJECT_ENABLED', value: 'true' },
        { name: 'EXTERNAL_PROJECT_CANONICAL_ID', value: 'yoola-main' },
      ]);
    }

    if (table === 'canonical_external_projects') {
      if (!adminState.canonicalActive) return createQueryResult(null);

      return createQueryResult({
        adapter: adminState.appAdapter,
        id: 'yoola-main',
        is_active: true,
      });
    }

    if (table === 'workspace_members') {
      const requestedWorkspaceIds = Array.isArray(wsId) ? wsId : [wsId];
      const isKnownWorkspace = requestedWorkspaceIds.some(
        (id) => id === workspaceId || id === ROOT_WORKSPACE_ID
      );
      const isKnownUser = userId === victimUserId;
      const isMember = wsId === ROOT_WORKSPACE_ID || adminState.workspaceMember;

      if (Array.isArray(wsId)) {
        return createQueryResult(
          isKnownWorkspace && isKnownUser && isMember
            ? [{ ws_id: workspaceId }]
            : []
        );
      }

      return createQueryResult(
        isKnownWorkspace && isKnownUser && isMember ? { type: 'MEMBER' } : null
      );
    }

    if (table === 'workspace_role_members') {
      const permissions =
        wsId === ROOT_WORKSPACE_ID
          ? adminState.rootPermissions
          : adminState.workspacePermissions;

      return createQueryResult(
        permissions.length > 0
          ? [
              {
                workspace_roles: {
                  workspace_role_permissions: permissions.map((permission) => ({
                    permission,
                  })),
                },
              },
            ]
          : []
      );
    }

    if (table === 'workspaces') {
      return createQueryResult({
        avatar_url: null,
        creator_id: 'workspace-creator',
        handle: 'linked-workspace',
        id: workspaceId,
        logo_url: null,
        name: 'Linked Workspace',
        personal: adminState.workspacePersonal,
      });
    }

    if (table === 'user_private_details') {
      return createQueryResult(
        adminState.privateEmail === null
          ? null
          : { email: adminState.privateEmail }
      );
    }

    if (table === 'workspace_invites') {
      return createQueryResult(
        adminState.pendingDirectInvite
          ? [
              {
                created_at: '2026-06-01T00:00:00.000Z',
                type: 'MEMBER',
                ws_id: workspaceId,
              },
            ]
          : []
      );
    }

    if (table === 'workspace_email_invites') {
      return createQueryResult(
        adminState.pendingEmailInvite
          ? [
              {
                created_at: '2026-06-01T00:00:00.000Z',
                email: 'victim@example.com',
                type: 'MEMBER',
                ws_id: workspaceId,
              },
            ]
          : []
      );
    }

    if (table === 'workspace_default_permissions') {
      return createQueryResult([]);
    }

    return createQueryResult(null);
  }

  function createBuilder(table: string) {
    const filters: Record<string, unknown> = {};
    const builder = {
      eq: vi.fn((field: string, value: unknown) => {
        filters[field] = value;
        return builder;
      }),
      in: vi.fn((field: string, value: unknown) => {
        filters[field] = value;
        return builder;
      }),
      maybeSingle: vi.fn(() => Promise.resolve(resolveTable(table, filters))),
      select: vi.fn(() => builder),
      single: vi.fn(() => Promise.resolve(resolveTable(table, filters))),
    };

    Object.defineProperty(builder, 'then', {
      value: (
        onFulfilled?: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) =>
        Promise.resolve(resolveTable(table, filters)).then(
          onFulfilled,
          onRejected
        ),
    });

    return builder;
  }

  return {
    auth: {
      admin: {
        getUserById: vi.fn().mockResolvedValue({
          data: {
            user: {
              email: 'victim@example.com',
            },
          },
          error: null,
        }),
      },
    },
    from: vi.fn((table: string) => createBuilder(table)),
  };
}

function mockRegisteredApp(
  allowedScopes = ['external-projects:read'],
  appId = 'yoola'
) {
  mocks.verifyExternalAppSecret.mockResolvedValue({
    app: {
      allowedScopes,
      createdAt: null,
      createdBy: null,
      displayName: appId,
      enabled: true,
      id: appId,
      origins: [`https://${appId}.example.com`],
      secretIssuedAt: null,
      secretLastFour: 'test',
      updatedAt: null,
      updatedBy: null,
    },
    ok: true,
  });
}

function createExchangeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/v1/auth/app-token/exchange', {
    body: JSON.stringify(body),
    method: 'POST',
  });
}

describe('app token exchange route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TUTURUUU_APP_COORDINATION_SECRET = 'test-secret';

    mocks.getAppDomainMap.mockReturnValue([
      {
        name: 'cms',
        url: 'https://cms.tuturuuu.com',
      },
    ]);

    mocks.createClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            session_data: { email: 'victim@example.com' },
            user_id: victimUserId,
          },
        ],
        error: null,
      }),
    });
    mocks.createAdminClient.mockResolvedValue(createAdminClientMock());
  });

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

  it.each([
    'yoola',
    'shiraoki',
  ])('returns pending invite details for %s workspace-scoped app exchange', async (appId) => {
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
      invitationUrl?: string;
      workspaceId?: string;
    };
    expect(body).toMatchObject({
      code: 'PENDING_WORKSPACE_INVITE',
      workspaceId,
    });
    expect(body.invitationUrl).toContain(encodeURIComponent(workspaceId));
  });

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

  it.each([
    'external-projects:read',
    'external-projects:publish',
  ])('allows publish-only linked workspace access for %s app scope', async (requestedScope) => {
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
  });

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
