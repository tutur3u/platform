import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  appCoordinationMocks,
  appCredentialMocks,
  appSessionMocks,
  storeMocks,
  supabaseMocks,
  workspaceMocks,
} = vi.hoisted(() => ({
  appCoordinationMocks: {
    getBearerAppCoordinationToken: vi.fn(),
    verifyAppCoordinationToken: vi.fn(),
  },
  appCredentialMocks: {
    authorizeExternalAppRequest: vi.fn(),
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

vi.mock('@tuturuuu/auth/app-coordination', () => appCoordinationMocks);
vi.mock('@tuturuuu/auth/app-session', () => appSessionMocks);
vi.mock('@tuturuuu/supabase/next/server', () => supabaseMocks);
vi.mock('@tuturuuu/utils/workspace-helper', () => workspaceMocks);
vi.mock('./store', () => storeMocks);
vi.mock('./app-credentials', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./app-credentials')>()),
  authorizeExternalAppRequest: appCredentialMocks.authorizeExternalAppRequest,
}));

import { requireWorkspaceExternalProjectSetupAccess } from './access';
import {
  ExternalProjectSetupForbiddenError,
  ensureWorkspaceExternalProjectStudio,
} from './studio-setup';

const workspaceId = '22222222-2222-4222-8222-222222222222';
const userId = '11111111-1111-4111-8111-111111111111';

function createPermissionsResult(permissions: string[], wsId: string) {
  // Creators and workspace admins hold every workspace permission implicitly.
  const containsPermission = vi.fn(
    (permission: string) =>
      permissions.includes('admin') || permissions.includes(permission)
  );
  return { containsPermission, permissions, wsId };
}

function mockPermissions(workspace: string[], root: string[]) {
  workspaceMocks.getPermissions.mockImplementation(
    async ({ wsId }: { wsId: string }) =>
      createPermissionsResult(
        wsId === ROOT_WORKSPACE_ID ? root : workspace,
        wsId
      )
  );
}

function createSetupRequest(headers: Record<string, string> = {}) {
  return new Request(
    `http://localhost/api/v1/workspaces/${workspaceId}/external-projects/setup`,
    { headers, method: 'POST' }
  );
}

describe('external project setup access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.createAdminClient.mockResolvedValue({ from: vi.fn() });
    supabaseMocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: userId } } })),
      },
    });
    workspaceMocks.normalizeWorkspaceId.mockResolvedValue(workspaceId);
    workspaceMocks.verifyWorkspaceMembershipType.mockResolvedValue({
      membershipType: 'MEMBER',
      ok: true,
    });
    appCoordinationMocks.getBearerAppCoordinationToken.mockReturnValue(null);
    appSessionMocks.getAppSessionTokenFromRequest.mockReturnValue(null);
  });

  it.each([
    ['workspace creator or admin', ['admin']],
    ['manage_external_projects holder', ['manage_external_projects']],
  ])(
    'forbids a %s without root access',
    async (_label, workspacePermissions) => {
      mockPermissions(workspacePermissions, []);

      const access = await requireWorkspaceExternalProjectSetupAccess({
        request: createSetupRequest(),
        wsId: workspaceId,
      });

      expect(access.ok).toBe(false);
      if (!access.ok) expect(access.response.status).toBe(403);
    }
  );

  it('forbids a workspace manager presenting an app token', async () => {
    mockPermissions(['admin'], []);
    appCoordinationMocks.getBearerAppCoordinationToken.mockReturnValue(
      'ttr_app_token'
    );
    appCoordinationMocks.verifyAppCoordinationToken.mockReturnValue({
      claims: { scopes: ['external-projects:manage'], sub: userId },
      ok: true,
    });

    const access = await requireWorkspaceExternalProjectSetupAccess({
      request: createSetupRequest({ Authorization: 'Bearer ttr_app_token' }),
      wsId: workspaceId,
    });

    expect(access.ok).toBe(false);
    if (!access.ok) expect(access.response.status).toBe(403);
  });

  it('admits a root external-project admin with root setup scope', async () => {
    mockPermissions([], ['manage_external_projects']);

    const access = await requireWorkspaceExternalProjectSetupAccess({
      request: createSetupRequest(),
      wsId: workspaceId,
    });

    expect(access.ok).toBe(true);
    if (access.ok) {
      expect(access.setupScope).toBe('root');
      expect(access.normalizedWorkspaceId).toBe(workspaceId);
    }
  });

  it('gives a linked app only workspace setup scope', async () => {
    appCredentialMocks.authorizeExternalAppRequest.mockResolvedValue({
      appId: 'yoola',
      binding: { enabled: true },
    });

    const access = await requireWorkspaceExternalProjectSetupAccess({
      request: createSetupRequest({
        'x-app-id': 'yoola',
        'x-app-secret': 'app-secret',
      }),
      wsId: workspaceId,
    });

    expect(access.ok).toBe(true);
    if (access.ok) expect(access.setupScope).toBe('workspace');
  });
});

type ProjectRow = {
  adapter: string;
  allowed_features: string[];
  id: string;
  is_active: boolean;
};

function createSetupFixture({
  binding,
  project,
}: {
  binding: { canonical_project_id: string; is_enabled: boolean } | null;
  project: ProjectRow | null;
}) {
  let currentBinding = binding;
  let currentProject = project;
  const writes = {
    auditInsert: vi.fn(async (_row: Record<string, unknown>) => ({
      error: null,
    })),
    bindingUpsert: vi.fn(async (row: Record<string, unknown>) => {
      currentBinding = {
        canonical_project_id: row.canonical_project_id as string,
        is_enabled: row.is_enabled as boolean,
      };
      return { error: null };
    }),
    canonicalInsert: vi.fn((row: Record<string, unknown>) => {
      currentProject = row as unknown as ProjectRow;
      return {
        select: () => ({
          single: async () => ({ data: currentProject, error: null }),
        }),
      };
    }),
    canonicalUpdate: vi.fn((row: Record<string, unknown>) => ({
      eq: () => ({
        select: () => ({
          single: async () => {
            currentProject = { ...(currentProject as ProjectRow), ...row };
            return { data: currentProject, error: null };
          },
        }),
      }),
    })),
    secretDelete: vi.fn(() => ({
      eq: () => ({ in: async () => ({ error: null }) }),
    })),
    secretInsert: vi.fn(async () => ({ error: null })),
  };

  const from = vi.fn((table: string) => {
    switch (table) {
      case 'workspace_external_project_bindings':
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: currentBinding && { ...currentBinding, settings: null },
                error: null,
              }),
            }),
          }),
          upsert: writes.bindingUpsert,
        };
      case 'workspace_secrets':
        return {
          delete: writes.secretDelete,
          insert: writes.secretInsert,
          select: () => ({
            eq: () => ({ in: async () => ({ data: [], error: null }) }),
          }),
        };
      case 'canonical_external_projects':
        return {
          insert: writes.canonicalInsert,
          select: () => ({
            eq: (_column: string, id: string) => ({
              maybeSingle: async () => ({
                data: currentProject?.id === id ? currentProject : null,
                error: null,
              }),
            }),
          }),
          update: writes.canonicalUpdate,
        };
      case 'workspace_external_project_binding_audits':
        return { insert: writes.auditInsert };
      default:
        throw new Error(`Unexpected table ${table}`);
    }
  });

  return { admin: { from } as never, writes };
}

const schema = {
  collections: [{ collection_type: 'games', slug: 'games', title: 'Games' }],
} as never;

describe('ensureWorkspaceExternalProjectStudio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeMocks.upsertWorkspaceExternalProjectFieldDefinitionsFromSchema.mockResolvedValue(
      undefined
    );
  });

  it('refuses to enable the studio or create canonical rows for a workspace caller', async () => {
    const fixture = createSetupFixture({ binding: null, project: null });

    await expect(
      ensureWorkspaceExternalProjectStudio({
        actorId: null,
        adapter: 'custom',
        admin: fixture.admin,
        schema,
        scope: 'workspace',
        workspaceId,
      })
    ).rejects.toBeInstanceOf(ExternalProjectSetupForbiddenError);

    expect(fixture.writes.canonicalInsert).not.toHaveBeenCalled();
    expect(fixture.writes.canonicalUpdate).not.toHaveBeenCalled();
    expect(fixture.writes.bindingUpsert).not.toHaveBeenCalled();
    expect(fixture.writes.secretInsert).not.toHaveBeenCalled();
    expect(fixture.writes.auditInsert).not.toHaveBeenCalled();
  });

  it('leaves a shared canonical row untouched when a workspace caller refreshes an enabled studio', async () => {
    const fixture = createSetupFixture({
      binding: { canonical_project_id: 'custom-main', is_enabled: true },
      project: {
        adapter: 'custom',
        allowed_features: ['sync', 'assets', 'delivery'],
        id: 'custom-main',
        is_active: true,
      },
    });

    await expect(
      ensureWorkspaceExternalProjectStudio({
        actorId: null,
        adapter: 'custom',
        admin: fixture.admin,
        schema,
        scope: 'workspace',
        workspaceId,
      })
    ).resolves.toMatchObject({
      createdBinding: false,
      createdCanonicalProject: false,
    });

    expect(fixture.writes.canonicalInsert).not.toHaveBeenCalled();
    expect(fixture.writes.canonicalUpdate).not.toHaveBeenCalled();
    expect(fixture.writes.bindingUpsert).not.toHaveBeenCalled();
    expect(
      storeMocks.upsertWorkspaceExternalProjectFieldDefinitionsFromSchema
    ).toHaveBeenCalledWith(
      { actorId: null, schema, workspaceId },
      fixture.admin
    );
  });

  it('keeps different-adapter bindings as setup conflicts', async () => {
    const fixture = createSetupFixture({
      binding: { canonical_project_id: 'legacy-yoola', is_enabled: true },
      project: {
        adapter: 'yoola',
        allowed_features: ['sync'],
        id: 'legacy-yoola',
        is_active: true,
      },
    });

    await expect(
      ensureWorkspaceExternalProjectStudio({
        actorId: userId,
        adapter: 'theguyser',
        admin: fixture.admin,
        schema,
        scope: 'root',
        workspaceId,
      })
    ).rejects.toThrow('Workspace is already configured for legacy-yoola');

    expect(fixture.writes.secretInsert).not.toHaveBeenCalled();
  });

  it('lets a root admin enable the studio and records the binding audit row', async () => {
    const fixture = createSetupFixture({ binding: null, project: null });

    await expect(
      ensureWorkspaceExternalProjectStudio({
        actorId: userId,
        adapter: 'custom',
        admin: fixture.admin,
        schema,
        scope: 'root',
        workspaceId,
      })
    ).resolves.toMatchObject({
      binding: { canonical_id: 'custom-main', enabled: true },
      createdBinding: true,
      createdCanonicalProject: true,
    });

    expect(fixture.writes.canonicalInsert).toHaveBeenCalledWith(
      expect.objectContaining({ created_by: userId, id: 'custom-main' })
    );
    expect(fixture.writes.bindingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        canonical_project_id: 'custom-main',
        is_enabled: true,
        ws_id: workspaceId,
      }),
      { onConflict: 'ws_id' }
    );
    expect(fixture.writes.auditInsert).toHaveBeenCalledWith({
      actor_user_id: userId,
      destination_ws_id: workspaceId,
      next_canonical_id: 'custom-main',
      previous_canonical_id: null,
      source_ws_id: ROOT_WORKSPACE_ID,
    });
  });

  it('lets a root admin upgrade the shared custom project features', async () => {
    const fixture = createSetupFixture({
      binding: { canonical_project_id: 'custom-main', is_enabled: true },
      project: {
        adapter: 'custom',
        allowed_features: ['sync', 'assets', 'delivery'],
        id: 'custom-main',
        is_active: true,
      },
    });

    await ensureWorkspaceExternalProjectStudio({
      actorId: userId,
      adapter: 'custom',
      admin: fixture.admin,
      schema,
      scope: 'root',
      workspaceId,
    });

    expect(fixture.writes.canonicalUpdate).toHaveBeenCalledWith({
      allowed_features: ['sync', 'assets', 'delivery', 'chat'],
      updated_by: userId,
    });
    expect(fixture.writes.bindingUpsert).not.toHaveBeenCalled();
  });
});
