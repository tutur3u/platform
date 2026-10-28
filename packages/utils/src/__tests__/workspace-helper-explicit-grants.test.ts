import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateAdminClient } = vi.hoisted(() => ({
  mockCreateAdminClient: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mockCreateAdminClient,
  createClient: vi.fn(),
}));

import { ROOT_WORKSPACE_ID } from '../constants';
import { isExplicitGrantPermission } from '../explicit-grant-permissions';
import { getPermissions } from '../workspace-helper';

const USER_ID = 'user-1';
const OTHER_WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

function mockWorkspace({
  creatorId = 'owner-1',
  rolePermissions = [],
  defaultPermissions = [],
}: {
  creatorId?: string;
  rolePermissions?: string[];
  defaultPermissions?: string[];
}) {
  const chain = <T>(terminal: string, result: T) => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
      single: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockImplementation((field: string) =>
      field === terminal ? Promise.resolve(result) : query
    );
    query.maybeSingle.mockResolvedValue(result);
    query.single.mockResolvedValue(result);
    return query;
  };

  const roleMembers = chain(
    'workspace_roles.workspace_role_permissions.enabled',
    {
      data: [
        {
          workspace_roles: {
            workspace_role_permissions: rolePermissions.map((permission) => ({
              permission,
            })),
          },
        },
      ],
      error: null,
    }
  );

  mockCreateAdminClient.mockResolvedValue({
    from: vi.fn((table: string) => {
      if (table === 'workspace_members') {
        return chain('__none__', { data: { type: 'MEMBER' }, error: null });
      }
      if (table === 'workspaces') {
        return chain('__none__', {
          data: { creator_id: creatorId },
          error: null,
        });
      }
      if (table === 'workspace_role_members') return roleMembers;
      if (table === 'workspace_default_permissions') {
        return chain('enabled', {
          data: defaultPermissions.map((permission) => ({ permission })),
          error: null,
        });
      }
      throw new Error(`Unexpected admin table lookup: ${table}`);
    }),
  });
}

const load = (wsId: string) =>
  getPermissions({ user: { id: USER_ID, email: 'member@example.com' }, wsId });

// Product rule: apps/docs/platform/features/mobile-mastermind.mdx#access-rule
describe('getPermissions explicit-grant permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists manage_mastermind as an explicit-grant permission', () => {
    expect(isExplicitGrantPermission('manage_mastermind')).toBe(true);
    expect(isExplicitGrantPermission('view_infrastructure')).toBe(false);
  });

  it('never implies manage_mastermind for the root workspace creator', async () => {
    mockWorkspace({ creatorId: USER_ID });

    const permissions = await load(ROOT_WORKSPACE_ID);

    expect(permissions?.containsPermission('view_infrastructure')).toBe(true);
    expect(permissions?.containsPermission('manage_mastermind')).toBe(false);
    expect(permissions?.permissions).not.toContain('manage_mastermind');
  });

  it('never implies manage_mastermind through admin or default permissions', async () => {
    mockWorkspace({
      rolePermissions: ['admin'],
      defaultPermissions: ['manage_mastermind'],
    });

    const permissions = await load(ROOT_WORKSPACE_ID);

    expect(permissions?.containsPermission('view_infrastructure')).toBe(true);
    expect(permissions?.containsPermission('manage_mastermind')).toBe(false);
    expect(permissions?.permissions).not.toContain('manage_mastermind');
  });

  it('grants manage_mastermind through an explicit root role grant', async () => {
    mockWorkspace({ rolePermissions: ['manage_mastermind'] });

    const permissions = await load(ROOT_WORKSPACE_ID);

    expect(permissions?.containsPermission('manage_mastermind')).toBe(true);
    expect(permissions?.permissions).toContain('manage_mastermind');
  });

  it('keeps an explicit grant for a root creator who also holds the role', async () => {
    mockWorkspace({
      creatorId: USER_ID,
      rolePermissions: ['manage_mastermind'],
    });

    const permissions = await load(ROOT_WORKSPACE_ID);

    expect(permissions?.containsPermission('manage_mastermind')).toBe(true);
  });

  it('ignores a manage_mastermind role grant outside the root workspace', async () => {
    mockWorkspace({ rolePermissions: ['manage_mastermind', 'admin'] });

    const permissions = await load(OTHER_WORKSPACE_ID);

    expect(permissions?.containsPermission('manage_mastermind')).toBe(false);
    expect(permissions?.permissions).not.toContain('manage_mastermind');
  });
});
