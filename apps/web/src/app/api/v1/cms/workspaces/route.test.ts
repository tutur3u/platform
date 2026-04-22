import { beforeEach, describe, expect, it, vi } from 'vitest';

const { accessMocks, authMocks, workspaceMocks } = vi.hoisted(() => ({
  accessMocks: {
    resolveWorkspaceExternalProjectBinding: vi.fn(),
  },
  authMocks: {
    createClient: vi.fn(),
  },
  workspaceMocks: {
    getPermissions: vi.fn(),
    getWorkspaces: vi.fn(),
  },
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: authMocks.createClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: workspaceMocks.getPermissions,
  getWorkspaces: workspaceMocks.getWorkspaces,
}));

vi.mock('@/lib/external-projects/access', () => ({
  hasRootExternalProjectsAdminPermission: (
    permissions: {
      containsPermission?: (permission: string) => boolean;
    } | null
  ) => Boolean(permissions?.containsPermission?.('manage_external_projects')),
  resolveWorkspaceExternalProjectBinding:
    accessMocks.resolveWorkspaceExternalProjectBinding,
}));

import { GET } from './route';

function createPermissions(...permissions: string[]) {
  return {
    containsPermission(permission: string) {
      return permissions.includes(permission);
    },
  };
}

describe('cms workspaces route', () => {
  const rootWorkspaceId = '00000000-0000-0000-0000-000000000000';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when there is no authenticated user', async () => {
    authMocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    });

    const response = await GET(
      new Request('http://localhost/api/v1/cms/workspaces')
    );

    expect(response.status).toBe(401);
  });

  it('returns only CMS-openable workspaces and internal for root admins', async () => {
    authMocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
    });
    workspaceMocks.getWorkspaces.mockResolvedValue([
      { id: rootWorkspaceId, name: 'Internal' },
      { id: 'ws-allowed', name: 'Allowed workspace' },
      { id: 'ws-disabled', name: 'Disabled workspace' },
      { id: 'ws-no-permission', name: 'No permission workspace' },
    ]);
    workspaceMocks.getPermissions.mockImplementation(
      async ({ wsId }: { wsId: string }) => {
        if (wsId === rootWorkspaceId) {
          return createPermissions('manage_external_projects');
        }

        if (wsId === 'ws-allowed') {
          return createPermissions('publish_external_projects');
        }

        return createPermissions();
      }
    );
    accessMocks.resolveWorkspaceExternalProjectBinding.mockImplementation(
      async (workspaceId: string) => {
        if (workspaceId === 'ws-allowed') {
          return {
            canonical_project: { id: 'project-1' },
            enabled: true,
          };
        }

        if (workspaceId === 'ws-no-permission') {
          return {
            canonical_project: { id: 'project-2' },
            enabled: true,
          };
        }

        return {
          canonical_project: null,
          enabled: false,
        };
      }
    );

    const response = await GET(
      new Request('http://localhost/api/v1/cms/workspaces')
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { id: rootWorkspaceId, name: 'Internal' },
      { id: 'ws-allowed', name: 'Allowed workspace' },
      { id: 'ws-no-permission', name: 'No permission workspace' },
    ]);
  });
});
