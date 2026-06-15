import type { AppCoordinationTokenClaims } from '@tuturuuu/auth/app-coordination';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  appCoordinationMocks,
  appSessionMocks,
  storeMocks,
  supabaseMocks,
  workspaceMocks,
} = vi.hoisted(() => ({
  appCoordinationMocks: {
    getBearerAppCoordinationToken: vi.fn(),
    verifyAppCoordinationToken: vi.fn(),
  },
  appSessionMocks: {
    getAppSessionTokenFromRequest: vi.fn(),
    verifyAppSessionRequest: vi.fn(),
  },
  storeMocks: {
    upsertWorkspaceExternalProjectFieldDefinitionsFromSchema: vi.fn(),
  },
  supabaseMocks: {
    createAdminClient: vi.fn(),
    createClient: vi.fn(),
  },
  workspaceMocks: {
    getPermissions: vi.fn(),
    normalizeWorkspaceId: vi.fn(),
    verifyWorkspaceMembershipType: vi.fn(),
  },
}));

vi.mock('@tuturuuu/auth/app-coordination', () => ({
  getBearerAppCoordinationToken:
    appCoordinationMocks.getBearerAppCoordinationToken,
  verifyAppCoordinationToken: appCoordinationMocks.verifyAppCoordinationToken,
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  getAppSessionTokenFromRequest: appSessionMocks.getAppSessionTokenFromRequest,
  verifyAppSessionRequest: appSessionMocks.verifyAppSessionRequest,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: supabaseMocks.createAdminClient,
  createClient: supabaseMocks.createClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: workspaceMocks.getPermissions,
  normalizeWorkspaceId: workspaceMocks.normalizeWorkspaceId,
  verifyWorkspaceMembershipType: workspaceMocks.verifyWorkspaceMembershipType,
}));

vi.mock('./store', () => storeMocks);

const cmsAppSessionClaims: AppCoordinationTokenClaims = {
  aud: 'tuturuuu-api',
  email: 'editor@example.com',
  exp: 1_800_000_000,
  iat: 1_700_000_000,
  iss: 'tuturuuu',
  jti: 'cms-session-token',
  origin_app: 'web',
  scopes: ['internal-app:session'],
  sub: '11111111-1111-4111-8111-111111111111',
  target_app: 'cms',
  typ: 'app_coordination',
};

const externalAppTokenClaims: AppCoordinationTokenClaims = {
  ...cmsAppSessionClaims,
  jti: 'external-app-token',
  scopes: ['external-projects:read'],
  target_app: 'yoola',
};

const workspaceId = '22222222-2222-4222-8222-222222222222';

function createPermissionsResult(permissions: string[], wsId: string) {
  const containsPermission = vi.fn(
    (permission: string) =>
      permissions.includes('admin') || permissions.includes(permission)
  );

  return {
    containsPermission,
    membershipType: 'MEMBER',
    permissions,
    wsId,
    withoutPermission: (permission: string) => !containsPermission(permission),
  };
}

function createAccessRequest(token = 'ttr_app_test') {
  return new Request(
    `http://localhost/api/v1/workspaces/${workspaceId}/external-projects`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
}

import {
  appTokenHasRequiredScope,
  ensureWorkspaceExternalProjectStudio,
  requireWorkspaceExternalProjectAccess,
  requireWorkspaceExternalProjectSetupAccess,
} from './access';

const baseClaims: AppCoordinationTokenClaims = {
  aud: 'tuturuuu-api',
  email: 'agent@example.com',
  exp: 1_800_000_000,
  iat: 1_700_000_000,
  iss: 'tuturuuu',
  jti: 'token-id',
  origin_app: 'web',
  scopes: [],
  sub: '11111111-1111-4111-8111-111111111111',
  target_app: 'cms',
  typ: 'app_coordination',
};

describe('external project app-token scope checks', () => {
  it('rejects empty app coordination scopes', () => {
    expect(appTokenHasRequiredScope(baseClaims, 'read')).toBe(false);
    expect(appTokenHasRequiredScope(baseClaims, 'publish')).toBe(false);
    expect(appTokenHasRequiredScope(baseClaims, 'manage')).toBe(false);
  });

  it('accepts explicit matching scopes', () => {
    expect(
      appTokenHasRequiredScope(
        {
          ...baseClaims,
          scopes: ['external-projects:read'],
        },
        'read'
      )
    ).toBe(true);
    expect(
      appTokenHasRequiredScope(
        {
          ...baseClaims,
          scopes: ['external-projects:*'],
        },
        'manage'
      )
    ).toBe(true);
  });

  it('rejects scopes that do not cover the requested mode', () => {
    expect(
      appTokenHasRequiredScope(
        {
          ...baseClaims,
          scopes: ['external-projects:read'],
        },
        'publish'
      )
    ).toBe(false);
  });
});

type CanonicalProjectFixture = {
  adapter: string;
  id: string;
  is_active: boolean;
};

function createAdminFixture(canonicalProject: CanonicalProjectFixture) {
  let project = {
    allowed_collections: ['legacy'],
    allowed_features: ['sync', 'assets', 'delivery'],
    delivery_profile: { schema: { collections: [] } },
    display_name: 'The Guyser',
    metadata: {},
    ...canonicalProject,
  };

  const workspaceSecretDelete = vi.fn(() => ({
    eq: vi.fn(() => ({
      in: vi.fn(async () => ({ error: null })),
    })),
  }));
  const workspaceSecretInsert = vi.fn(async () => ({ error: null }));
  const canonicalProjectUpdate = vi.fn((payload: Record<string, unknown>) => ({
    eq: vi.fn((_column: string, id: string) => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => {
          project = { ...project, ...payload };
          return id === project.id
            ? { data: project, error: null }
            : { data: null, error: { message: 'not found' } };
        }),
      })),
    })),
  }));

  const from = vi.fn((table: string) => {
    if (table === 'workspace_secrets') {
      return {
        delete: workspaceSecretDelete,
        insert: workspaceSecretInsert,
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(async () => ({
              data: [
                {
                  name: 'EXTERNAL_PROJECT_ENABLED',
                  value: 'true',
                },
                {
                  name: 'EXTERNAL_PROJECT_CANONICAL_ID',
                  value: project.id,
                },
              ],
              error: null,
            })),
          })),
        })),
      };
    }

    if (table === 'canonical_external_projects') {
      return {
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: project, error: null })),
          })),
        })),
        select: vi.fn(() => ({
          eq: vi.fn((_column: string, id: string) => ({
            maybeSingle: vi.fn(async () => ({
              data: id === project.id ? project : null,
              error: null,
            })),
          })),
        })),
        update: canonicalProjectUpdate,
      };
    }

    if (table === 'workspace_external_project_binding_audits') {
      return {
        insert: vi.fn(async () => ({ error: null })),
      };
    }

    throw new Error(`Unexpected table ${table}`);
  });

  return {
    admin: { from },
    canonicalProjectUpdate,
    workspaceSecretDelete,
    workspaceSecretInsert,
  };
}

describe('external project access auth dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    workspaceMocks.normalizeWorkspaceId.mockResolvedValue(workspaceId);
    workspaceMocks.verifyWorkspaceMembershipType.mockResolvedValue({
      membershipType: 'MEMBER',
      ok: true,
    });
    workspaceMocks.getPermissions.mockImplementation(
      async ({ wsId }: { wsId: string }) =>
        createPermissionsResult(
          wsId === ROOT_WORKSPACE_ID ? [] : ['publish_external_projects'],
          wsId
        )
    );
  });

  it('uses a valid CMS app-session bearer before scoped app-token auth', async () => {
    const fixture = createAdminFixture({
      adapter: 'yoola',
      id: 'yoola-main',
      is_active: true,
    });
    const request = createAccessRequest('ttr_app_cms_session');

    supabaseMocks.createAdminClient.mockResolvedValue(fixture.admin);
    appCoordinationMocks.getBearerAppCoordinationToken.mockReturnValue(
      'ttr_app_cms_session'
    );
    appSessionMocks.getAppSessionTokenFromRequest.mockReturnValue(
      'ttr_app_cms_session'
    );
    appSessionMocks.verifyAppSessionRequest.mockReturnValue({
      claims: cmsAppSessionClaims,
      ok: true,
    });
    appCoordinationMocks.verifyAppCoordinationToken.mockReturnValue({
      claims: cmsAppSessionClaims,
      ok: true,
    });

    const access = await requireWorkspaceExternalProjectAccess({
      mode: 'read',
      request,
      wsId: workspaceId,
    });

    expect(access.ok).toBe(true);
    if (access.ok) {
      expect(access.normalizedWorkspaceId).toBe(workspaceId);
      expect(access.user).toMatchObject({
        app: 'cms',
        id: cmsAppSessionClaims.sub,
      });
    }
    expect(appSessionMocks.verifyAppSessionRequest).toHaveBeenCalledWith(
      request,
      { targetApp: 'cms' }
    );
    expect(
      appCoordinationMocks.verifyAppCoordinationToken
    ).not.toHaveBeenCalled();
  });

  it('falls back to scoped external app-token auth for non-session bearer tokens', async () => {
    const fixture = createAdminFixture({
      adapter: 'yoola',
      id: 'yoola-main',
      is_active: true,
    });
    const request = createAccessRequest('ttr_app_external');

    supabaseMocks.createAdminClient.mockResolvedValue(fixture.admin);
    appCoordinationMocks.getBearerAppCoordinationToken.mockReturnValue(
      'ttr_app_external'
    );
    appSessionMocks.getAppSessionTokenFromRequest.mockReturnValue(
      'ttr_app_external'
    );
    appSessionMocks.verifyAppSessionRequest.mockReturnValue({
      error: 'App session missing required scope',
      ok: false,
    });
    appCoordinationMocks.verifyAppCoordinationToken.mockReturnValue({
      claims: externalAppTokenClaims,
      ok: true,
    });

    const access = await requireWorkspaceExternalProjectAccess({
      mode: 'read',
      request,
      wsId: workspaceId,
    });

    expect(access.ok).toBe(true);
    expect(appSessionMocks.verifyAppSessionRequest).toHaveBeenCalledWith(
      request,
      { targetApp: 'cms' }
    );
    expect(
      appCoordinationMocks.verifyAppCoordinationToken
    ).toHaveBeenCalledWith('ttr_app_external');
  });

  it('rejects scoped external app-token auth for a different linked adapter', async () => {
    const fixture = createAdminFixture({
      adapter: 'theguyser',
      id: 'theguyser-main',
      is_active: true,
    });
    const request = createAccessRequest('ttr_app_external');

    supabaseMocks.createAdminClient.mockResolvedValue(fixture.admin);
    appCoordinationMocks.getBearerAppCoordinationToken.mockReturnValue(
      'ttr_app_external'
    );
    appSessionMocks.getAppSessionTokenFromRequest.mockReturnValue(
      'ttr_app_external'
    );
    appSessionMocks.verifyAppSessionRequest.mockReturnValue({
      error: 'App session missing required scope',
      ok: false,
    });
    appCoordinationMocks.verifyAppCoordinationToken.mockReturnValue({
      claims: {
        ...externalAppTokenClaims,
        scopes: ['external-projects:*'],
      },
      ok: true,
    });

    const access = await requireWorkspaceExternalProjectAccess({
      mode: 'manage',
      request,
      wsId: workspaceId,
    });

    expect(access.ok).toBe(false);
    if (!access.ok) {
      expect(access.response.status).toBe(403);
      await expect(access.response.json()).resolves.toEqual({
        error: 'App is not linked to this workspace',
      });
    }
  });

  it('rejects scoped external app-token auth for root admins without linked workspace membership', async () => {
    const fixture = createAdminFixture({
      adapter: 'yoola',
      id: 'yoola-main',
      is_active: true,
    });
    const request = createAccessRequest('ttr_app_external');

    supabaseMocks.createAdminClient.mockResolvedValue(fixture.admin);
    workspaceMocks.verifyWorkspaceMembershipType.mockResolvedValue({
      error: 'membership_missing',
      ok: false,
    });
    workspaceMocks.getPermissions.mockImplementation(
      async ({ wsId }: { wsId: string }) =>
        createPermissionsResult(
          wsId === ROOT_WORKSPACE_ID ? ['manage_external_projects'] : [],
          wsId
        )
    );
    appCoordinationMocks.getBearerAppCoordinationToken.mockReturnValue(
      'ttr_app_external'
    );
    appSessionMocks.getAppSessionTokenFromRequest.mockReturnValue(
      'ttr_app_external'
    );
    appSessionMocks.verifyAppSessionRequest.mockReturnValue({
      error: 'App session missing required scope',
      ok: false,
    });
    appCoordinationMocks.verifyAppCoordinationToken.mockReturnValue({
      claims: externalAppTokenClaims,
      ok: true,
    });

    const access = await requireWorkspaceExternalProjectAccess({
      mode: 'read',
      request,
      wsId: workspaceId,
    });

    expect(access.ok).toBe(false);
    if (!access.ok) {
      expect(access.response.status).toBe(403);
      await expect(access.response.json()).resolves.toEqual({
        error: 'Forbidden',
      });
    }
  });

  it('allows root EPM admins with linked workspace membership through scoped external app-token auth', async () => {
    const fixture = createAdminFixture({
      adapter: 'yoola',
      id: 'yoola-main',
      is_active: true,
    });
    const request = createAccessRequest('ttr_app_external');

    supabaseMocks.createAdminClient.mockResolvedValue(fixture.admin);
    workspaceMocks.getPermissions.mockImplementation(
      async ({ wsId }: { wsId: string }) =>
        createPermissionsResult(
          wsId === ROOT_WORKSPACE_ID ? ['manage_external_projects'] : [],
          wsId
        )
    );
    appCoordinationMocks.getBearerAppCoordinationToken.mockReturnValue(
      'ttr_app_external'
    );
    appSessionMocks.getAppSessionTokenFromRequest.mockReturnValue(
      'ttr_app_external'
    );
    appSessionMocks.verifyAppSessionRequest.mockReturnValue({
      error: 'App session missing required scope',
      ok: false,
    });
    appCoordinationMocks.verifyAppCoordinationToken.mockReturnValue({
      claims: externalAppTokenClaims,
      ok: true,
    });

    const access = await requireWorkspaceExternalProjectAccess({
      mode: 'read',
      request,
      wsId: workspaceId,
    });

    expect(access.ok).toBe(true);
    if (access.ok) {
      expect(access.rootPermissions?.containsPermission).toHaveBeenCalledWith(
        'manage_external_projects'
      );
    }
  });

  it('rejects stale CMS app-session auth after linked workspace membership is removed', async () => {
    const fixture = createAdminFixture({
      adapter: 'yoola',
      id: 'yoola-main',
      is_active: true,
    });
    const request = createAccessRequest('ttr_app_cms_session');

    supabaseMocks.createAdminClient.mockResolvedValue(fixture.admin);
    workspaceMocks.verifyWorkspaceMembershipType.mockResolvedValue({
      error: 'membership_missing',
      ok: false,
    });
    appCoordinationMocks.getBearerAppCoordinationToken.mockReturnValue(
      'ttr_app_cms_session'
    );
    appSessionMocks.getAppSessionTokenFromRequest.mockReturnValue(
      'ttr_app_cms_session'
    );
    appSessionMocks.verifyAppSessionRequest.mockReturnValue({
      claims: cmsAppSessionClaims,
      ok: true,
    });

    const access = await requireWorkspaceExternalProjectAccess({
      mode: 'read',
      request,
      wsId: workspaceId,
    });

    expect(access.ok).toBe(false);
    if (!access.ok) {
      expect(access.response.status).toBe(403);
      await expect(access.response.json()).resolves.toEqual({
        error: 'Forbidden',
      });
    }
    expect(
      appCoordinationMocks.verifyAppCoordinationToken
    ).not.toHaveBeenCalled();
  });

  it('returns unauthorized for an invalid app session without falling through to Supabase auth', async () => {
    const request = createAccessRequest('ttr_app_expired');

    appCoordinationMocks.getBearerAppCoordinationToken.mockReturnValue(null);
    appSessionMocks.getAppSessionTokenFromRequest.mockReturnValue(
      'ttr_app_expired'
    );
    appSessionMocks.verifyAppSessionRequest.mockReturnValue({
      error: 'Token expired',
      ok: false,
    });

    const access = await requireWorkspaceExternalProjectAccess({
      mode: 'read',
      request,
      wsId: workspaceId,
    });

    expect(access.ok).toBe(false);
    if (!access.ok) {
      expect(access.response.status).toBe(401);
    }
    expect(supabaseMocks.createClient).not.toHaveBeenCalled();
  });

  it('uses a valid CMS app-session bearer before app-token auth for setup access', async () => {
    const fixture = createAdminFixture({
      adapter: 'yoola',
      id: 'yoola-main',
      is_active: true,
    });
    const request = createAccessRequest('ttr_app_cms_session');

    supabaseMocks.createAdminClient.mockResolvedValue(fixture.admin);
    workspaceMocks.getPermissions.mockImplementation(
      async ({ wsId }: { wsId: string }) =>
        createPermissionsResult(
          wsId === ROOT_WORKSPACE_ID ? [] : ['manage_external_projects'],
          wsId
        )
    );
    appCoordinationMocks.getBearerAppCoordinationToken.mockReturnValue(
      'ttr_app_cms_session'
    );
    appSessionMocks.getAppSessionTokenFromRequest.mockReturnValue(
      'ttr_app_cms_session'
    );
    appSessionMocks.verifyAppSessionRequest.mockReturnValue({
      claims: cmsAppSessionClaims,
      ok: true,
    });
    appCoordinationMocks.verifyAppCoordinationToken.mockReturnValue({
      claims: cmsAppSessionClaims,
      ok: true,
    });

    const access = await requireWorkspaceExternalProjectSetupAccess({
      request,
      wsId: workspaceId,
    });

    expect(access.ok).toBe(true);
    if (access.ok) {
      expect(access.normalizedWorkspaceId).toBe(workspaceId);
    }
    expect(appSessionMocks.verifyAppSessionRequest).toHaveBeenCalledWith(
      request,
      { targetApp: 'cms' }
    );
    expect(
      appCoordinationMocks.verifyAppCoordinationToken
    ).not.toHaveBeenCalled();
  });
});

describe('external project setup access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeMocks.upsertWorkspaceExternalProjectFieldDefinitionsFromSchema.mockResolvedValue(
      undefined
    );
  });

  it('keeps same-adapter canonical bindings immutable during idempotent setup', async () => {
    const schema = {
      collections: [
        {
          collection_type: 'games',
          fields: [{ key: 'subtitle', type: 'string' }],
          slug: 'games',
          title: 'Games',
        },
      ],
    };
    const fixture = createAdminFixture({
      adapter: 'theguyser',
      id: 'theguyser',
      is_active: true,
    });

    await expect(
      ensureWorkspaceExternalProjectStudio({
        actorId: 'user-1',
        adapter: 'theguyser',
        admin: fixture.admin as never,
        schema: schema as never,
        workspaceId: 'ws-1',
      })
    ).resolves.toMatchObject({
      binding: {
        adapter: 'theguyser',
        canonical_id: 'theguyser',
        enabled: true,
        workspace_id: 'ws-1',
      },
      createdBinding: false,
      createdCanonicalProject: false,
    });

    expect(fixture.canonicalProjectUpdate).not.toHaveBeenCalled();
    expect(fixture.workspaceSecretDelete).not.toHaveBeenCalled();
    expect(fixture.workspaceSecretInsert).not.toHaveBeenCalled();
    expect(
      storeMocks.upsertWorkspaceExternalProjectFieldDefinitionsFromSchema
    ).toHaveBeenCalledWith(
      {
        actorId: 'user-1',
        schema,
        workspaceId: 'ws-1',
      },
      fixture.admin
    );
  });

  it('keeps different-adapter existing bindings as setup conflicts', async () => {
    const fixture = createAdminFixture({
      adapter: 'yoola',
      id: 'legacy-yoola',
      is_active: true,
    });

    await expect(
      ensureWorkspaceExternalProjectStudio({
        actorId: 'user-1',
        adapter: 'theguyser',
        admin: fixture.admin as never,
        schema: { collections: [] } as never,
        workspaceId: 'ws-1',
      })
    ).rejects.toThrow('Workspace is already configured for legacy-yoola');

    expect(fixture.workspaceSecretDelete).not.toHaveBeenCalled();
    expect(fixture.workspaceSecretInsert).not.toHaveBeenCalled();
  });
});
