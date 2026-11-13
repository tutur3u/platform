import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  permissions: vi.fn(),
  bindingRead: vi.fn(),
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.user,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
  normalizeWorkspaceId: async (id: string) => id,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: (table: string) => {
      if (table === 'workspace_external_project_bindings') mocks.bindingRead();
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data:
                table === 'workspace_external_project_bindings'
                  ? {
                      canonical_project_id: 'first-site',
                      is_enabled: true,
                      settings: {},
                    }
                  : {
                      id: 'first-site',
                      is_active: true,
                      allowed_features: ['chat'],
                    },
              error: null,
            }),
          }),
        }),
      };
    },
  }),
}));

import { getCmsWorkspaceAccess } from './access';

const wsId = '11111111-1111-4111-8111-111111111111';
function grant(values: string[]) {
  mocks.permissions.mockImplementation(
    async ({ wsId: id }: { wsId: string }) => ({
      containsPermission: (value: string) =>
        id === wsId && values.includes(value),
    })
  );
}

describe('CMS page role gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: 'editor', email: null });
    grant([]);
  });

  it('admits an editor to the studio and preview without publish access', async () => {
    grant(['edit_external_projects']);
    expect(await getCmsWorkspaceAccess(wsId)).toMatchObject({
      canAccessWorkspace: true,
      canPublishPages: false,
    });
  });

  it.each(['publish_external_projects', 'manage_external_projects'])(
    'allows publication with %s',
    async (permission) => {
      grant([permission]);
      expect(await getCmsWorkspaceAccess(wsId)).toMatchObject({
        canAccessWorkspace: true,
        canPublishPages: true,
      });
    }
  );

  it('preserves connected chat access under its existing explicit read permission', async () => {
    grant(['view_chat']);
    expect(await getCmsWorkspaceAccess(wsId)).toMatchObject({
      canAccessWorkspace: false,
      canAccessConnectedChat: true,
      canPublishPages: false,
    });
  });

  it('denies a non-member without reading the site binding', async () => {
    mocks.permissions.mockResolvedValue(null);
    expect(await getCmsWorkspaceAccess(wsId)).toMatchObject({
      canAccessWorkspace: false,
      canPublishPages: false,
    });
    expect(mocks.bindingRead).not.toHaveBeenCalled();
  });

  it('denies an unauthenticated actor', async () => {
    mocks.user.mockResolvedValue(null);
    expect(await getCmsWorkspaceAccess(wsId)).toMatchObject({
      canAccessWorkspace: false,
      canPublishPages: false,
    });
    expect(mocks.permissions).not.toHaveBeenCalled();
    expect(mocks.bindingRead).not.toHaveBeenCalled();
  });

  it('fails closed when permission resolution fails', async () => {
    mocks.permissions.mockRejectedValue(new Error('permission lookup failed'));
    await expect(getCmsWorkspaceAccess(wsId)).rejects.toThrow(
      'permission lookup failed'
    );
    expect(mocks.bindingRead).not.toHaveBeenCalled();
  });
});
