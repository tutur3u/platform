import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/workspace-configs', () => ({
  DATABASE_AUTO_ADD_NEW_GROUPS_TO_DEFAULT_INCLUDED_GROUPS_CONFIG_ID: 'unused',
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ from: mocks.from }),
}));
vi.mock('@tuturuuu/users-core/lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: async () => ({
    withoutPermission: () => false,
  }),
}));
vi.mock('@tuturuuu/users-core/lib/user-groups/route-helpers', () => ({
  resolveUserGroupRouteWorkspaceId: async () => 'resolved-workspace',
  resolveRequestActorAuthUid: async () => null,
}));
vi.mock('@tuturuuu/users-core/lib/workspace-default-included-groups', () => ({
  appendWorkspaceDefaultIncludedGroupId: vi.fn(),
}));

import { GET } from './route';

it('retains the Contacts group list fields when the source table gains a column', async () => {
  const existingRow = {
    id: 'group',
    ws_id: 'resolved-workspace',
    name: 'Chemistry',
    description: null,
    created_at: null,
    creator_id: null,
    starting_date: null,
    ending_date: null,
    archived: false,
    is_guest: false,
    notes: null,
    cert_template: 'default',
    is_course_published: false,
  };
  const source = { ...existingRow, updated_at: '2026-11-20T00:00:00Z' };
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockImplementation((projection: string) => {
    const columns = projection.split(',').map((column) => column.trim());
    mocks.eq.mockResolvedValue({
      data: [
        Object.fromEntries(
          Object.entries(source).filter(([column]) => columns.includes(column))
        ),
      ],
      error: null,
    });
    return { eq: mocks.eq };
  });

  const response = await GET(
    new Request('https://tuturuuu.com/api/v1/workspaces/alias/user-groups'),
    { params: Promise.resolve({ wsId: 'alias' }) }
  );

  expect(mocks.from).toHaveBeenCalledWith('workspace_user_groups');
  expect(mocks.eq).toHaveBeenCalledWith('ws_id', 'resolved-workspace');
  expect(await response.json()).toEqual([existingRow]);
});
