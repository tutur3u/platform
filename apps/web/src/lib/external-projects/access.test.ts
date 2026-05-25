import type { AppCoordinationTokenClaims } from '@tuturuuu/auth/app-coordination';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { storeMocks } = vi.hoisted(() => ({
  storeMocks: {
    upsertWorkspaceExternalProjectFieldDefinitionsFromSchema: vi.fn(),
  },
}));

vi.mock('./store', () => storeMocks);

import {
  appTokenHasRequiredScope,
  ensureWorkspaceExternalProjectStudio,
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

describe('external project setup access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeMocks.upsertWorkspaceExternalProjectFieldDefinitionsFromSchema.mockResolvedValue(
      undefined
    );
  });

  it('treats same-adapter non-default canonical bindings as idempotent setup', async () => {
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

    expect(fixture.canonicalProjectUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        allowed_collections: ['games'],
        delivery_profile: { schema },
        updated_by: 'user-1',
      })
    );
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
