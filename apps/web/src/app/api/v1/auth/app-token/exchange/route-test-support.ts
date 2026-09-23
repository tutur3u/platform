import { verifyAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getUpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getAppDomainMap: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
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

vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRestRedisClient: vi.fn(),
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

import {
  INVITATION_ACTION_SCOPE,
  invitationWorkspaceScope,
} from '@/lib/app-coordination/invitation-action-token';

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
  privateFullName?: string | null;
  profileAvatarUrl?: string | null;
  profileDisplayName?: string | null;
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
    privateFullName: 'Victim Full Name',
    profileAvatarUrl: 'https://example.com/victim.png',
    profileDisplayName: 'Victim Display Name',
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
          : {
              email: adminState.privateEmail,
              full_name: adminState.privateFullName,
            }
      );
    }

    if (table === 'users') {
      return createQueryResult({
        avatar_url: adminState.profileAvatarUrl,
        display_name: adminState.profileDisplayName,
        id: victimUserId,
        user_private_details:
          adminState.privateEmail === null
            ? null
            : {
                email: adminState.privateEmail,
                full_name: adminState.privateFullName,
              },
      });
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
              id: victimUserId,
              email: 'victim@example.com',
              user_metadata: {
                avatar_url: 'https://example.com/auth-victim.png',
                display_name: 'Auth Victim',
                full_name: 'Auth Victim Full Name',
              },
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
  appId = 'yoola',
  allowedWorkspaceIds: string[] = []
) {
  mocks.verifyExternalAppSecret.mockResolvedValue({
    app: {
      allowedScopes,
      allowedWorkspaceIds,
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

function expectPendingInvitationAction(
  body: {
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
  },
  appId: string
) {
  expect(body).toMatchObject({
    code: 'PENDING_WORKSPACE_INVITE',
    invitation: {
      role: 'MEMBER',
      source: 'direct',
      workspaceId,
      workspaceName: 'Linked Workspace',
    },
    workspaceId,
  });
  expect(body.invitationUrl).toContain(encodeURIComponent(workspaceId));
  expect(body.invitationActionToken).toEqual(expect.any(String));

  const verification = verifyAppCoordinationToken(body.invitationActionToken!);
  expect(verification.ok).toBe(true);
  if (!verification.ok) return;

  expect(verification.claims.target_app).toBe(appId);
  expect(verification.claims.sub).toBe(victimUserId);
  expect(verification.claims.scopes).toEqual(
    expect.arrayContaining([
      INVITATION_ACTION_SCOPE,
      invitationWorkspaceScope(workspaceId),
    ])
  );
}

export function registerExchangeTestSetup() {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TUTURUUU_APP_COORDINATION_SECRET = 'test-secret';

    mocks.getAppDomainMap.mockReturnValue([
      {
        name: 'cms',
        url: 'https://cms.tuturuuu.com',
      },
    ]);
    mocks.redisGet.mockResolvedValue(null);
    mocks.redisSet.mockResolvedValue('OK');
    vi.mocked(getUpstashRestRedisClient).mockResolvedValue({
      del: vi.fn(),
      decr: vi.fn(),
      expire: vi.fn(),
      get: mocks.redisGet,
      incr: vi.fn(),
      mget: vi.fn(),
      scan: vi.fn(),
      set: mocks.redisSet,
      ttl: vi.fn(),
    });

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
}

export {
  createAdminClientMock,
  createExchangeRequest,
  expectPendingInvitationAction,
  mockRegisteredApp,
  mocks,
  victimUserId,
  workspaceId,
};
