import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateAdminClient } = vi.hoisted(() => ({
  mockCreateAdminClient: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mockCreateAdminClient,
  createClient: vi.fn(),
}));

import {
  hasConfiguredMemberDefaults,
  SEEDED_MEMBER_DEFAULT_PERMISSIONS,
} from '../member-default-permissions';
import { getPermissions } from '../workspace-helper';

const workspaceId = '11111111-1111-4111-8111-111111111111';

function chain<T extends Record<string, unknown>>(query: T, terminal: string) {
  for (const key of Object.keys(query)) {
    if (key !== terminal)
      (query[key] as ReturnType<typeof vi.fn>).mockReturnValue(query);
  }
  return query;
}

function mockPlainMember(defaultPermissions: readonly string[]) {
  const membershipQuery = chain(
    { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() },
    'maybeSingle'
  );
  membershipQuery.maybeSingle.mockResolvedValue({
    data: { type: 'MEMBER' },
    error: null,
  });

  const workspaceQuery = chain(
    { select: vi.fn(), eq: vi.fn(), single: vi.fn() },
    'single'
  );
  workspaceQuery.single.mockResolvedValue({
    data: { creator_id: 'owner-1' },
    error: null,
  });

  const roleMembersQuery = { select: vi.fn(), eq: vi.fn() };
  roleMembersQuery.select.mockReturnValue(roleMembersQuery);
  roleMembersQuery.eq.mockImplementation((field) =>
    field === 'workspace_roles.workspace_role_permissions.enabled'
      ? Promise.resolve({ data: [], error: null })
      : roleMembersQuery
  );

  const defaultsQuery = { select: vi.fn(), eq: vi.fn() };
  defaultsQuery.select.mockReturnValue(defaultsQuery);
  defaultsQuery.eq.mockImplementation((field) =>
    field === 'enabled'
      ? Promise.resolve({
          data: defaultPermissions.map((permission) => ({ permission })),
          error: null,
        })
      : defaultsQuery
  );

  mockCreateAdminClient.mockResolvedValue({
    from: vi.fn((table: string) => {
      if (table === 'workspace_members') return membershipQuery;
      if (table === 'workspaces') return workspaceQuery;
      if (table === 'workspace_role_members') return roleMembersQuery;
      if (table === 'workspace_default_permissions') return defaultsQuery;
      throw new Error(`Unexpected admin table lookup: ${table}`);
    }),
  });
}

describe('seeded MEMBER defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('never seeds admin', () => {
    expect(SEEDED_MEMBER_DEFAULT_PERMISSIONS).not.toContain('admin');
  });

  it('give a plain member drive and chat access only', async () => {
    mockPlainMember(SEEDED_MEMBER_DEFAULT_PERMISSIONS);

    const permissions = await getPermissions({
      user: { id: 'member-1', email: 'member@example.com' },
      wsId: workspaceId,
    });

    expect(permissions?.containsPermission('view_drive')).toBe(true);
    expect(permissions?.containsPermission('create_chat')).toBe(true);
    for (const sensitive of [
      'admin',
      'manage_workspace_members',
      'manage_workspace_roles',
      'manage_workspace_secrets',
      'manage_workspace_security',
      'manage_workspace_billing',
      'manage_api_keys',
    ]) {
      expect(permissions?.containsPermission(sensitive as never)).toBe(false);
    }
  });

  it('do not count the seeded baseline or admin as configured access', () => {
    expect(hasConfiguredMemberDefaults(SEEDED_MEMBER_DEFAULT_PERMISSIONS)).toBe(
      false
    );
    expect(hasConfiguredMemberDefaults(['admin'])).toBe(false);
    expect(hasConfiguredMemberDefaults(['view_drive', 'manage_projects'])).toBe(
      true
    );
  });
});
