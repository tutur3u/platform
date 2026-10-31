import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminClient, createClient } = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient,
  createClient,
}));

import { getPermissions } from '../workspace-helper';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const foreignWorkspaceId = '22222222-2222-4222-8222-222222222222';
const user = { id: 'member-1', email: 'member@example.invalid' };

function fixture({ creator = false, guest = false } = {}) {
  const filters = new Map<string, unknown>();
  const roles = [
    { ws_id: workspaceId, permission: 'manage_workspace_roles' },
    { ws_id: foreignWorkspaceId, permission: 'manage_users' },
  ];
  const roleQuery = {
    select: vi.fn(),
    eq: vi.fn((field: string, value: unknown) => {
      filters.set(field, value);
      return roleQuery;
    }),
    // biome-ignore lint/suspicious/noThenProperty: Model Supabase builders that resolve after filters are collected.
    then: (resolve: (value: object) => unknown) =>
      Promise.resolve(
        resolve({
          data: [
            {
              workspace_roles: {
                workspace_role_permissions: roles.filter(
                  (row) =>
                    !filters.has(
                      'workspace_roles.workspace_role_permissions.ws_id'
                    ) ||
                    row.ws_id ===
                      filters.get(
                        'workspace_roles.workspace_role_permissions.ws_id'
                      )
                ),
              },
            },
          ],
          error: null,
        })
      ),
  };
  roleQuery.select.mockReturnValue(roleQuery);
  const membership = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { type: guest ? 'GUEST' : 'MEMBER' },
      error: null,
    }),
  };
  membership.select.mockReturnValue(membership);
  membership.eq.mockReturnValue(membership);
  const workspace = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn().mockResolvedValue({
      data: { creator_id: creator ? user.id : 'owner-1' },
      error: null,
    }),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { id: workspaceId },
      error: null,
    }),
  };
  workspace.select.mockReturnValue(workspace);
  workspace.eq.mockReturnValue(workspace);
  const defaults = {
    select: vi.fn(),
    eq: vi.fn(),
    // biome-ignore lint/suspicious/noThenProperty: Model Supabase builders that resolve after filters are collected.
    then: (resolve: (value: object) => unknown) =>
      Promise.resolve(resolve({ data: [], error: null })),
  };
  defaults.select.mockReturnValue(defaults);
  defaults.eq.mockReturnValue(defaults);
  const from = vi.fn((table: string) => {
    switch (table) {
      case 'workspace_members':
        return membership;
      case 'workspaces':
        return workspace;
      case 'workspace_role_members':
        return roleQuery;
      case 'workspace_default_permissions':
        return defaults;
      default:
        throw new Error(`Unexpected table: ${table}`);
    }
  });
  const client = {
    from,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
  };
  createAdminClient.mockResolvedValue(client);
  createClient.mockResolvedValue(client);
  return { roleQuery, defaults, from };
}

describe('workspace role permission isolation across getPermissions callers', () => {
  beforeEach(() => vi.clearAllMocks());

  for (const caller of ['provided-user', 'cookie', 'request'] as const) {
    for (const wsId of [workspaceId, 'personal']) {
      it(`${caller} rejects foreign permission rows for ${wsId}`, async () => {
        fixture();
        const result = await getPermissions({
          wsId,
          ...(caller === 'provided-user' ? { user } : {}),
          ...(caller === 'request'
            ? { request: new Request('https://example.invalid') }
            : {}),
        });
        expect(result?.wsId).toBe(workspaceId);
        expect(result?.containsPermission('manage_users')).toBe(false);
        expect(result?.containsPermission('manage_workspace_roles')).toBe(true);
      });
    }
  }

  it('guests use workspace-scoped defaults without role grants', async () => {
    const { roleQuery, defaults } = fixture({ guest: true });
    const result = await getPermissions({ user, wsId: workspaceId });
    expect(result?.membershipType).toBe('GUEST');
    expect(result?.containsPermission('manage_users')).toBe(false);
    expect(roleQuery.select).not.toHaveBeenCalled();
    expect(defaults.eq).toHaveBeenCalledWith('ws_id', workspaceId);
  });

  it('creators retain their existing owner permissions', async () => {
    const { roleQuery } = fixture({ creator: true });
    const result = await getPermissions({ user, wsId: workspaceId });
    expect(result?.containsPermission('manage_users')).toBe(true);
    expect(roleQuery.select).not.toHaveBeenCalled();
  });
});
