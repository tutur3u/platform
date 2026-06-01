import { describe, expect, it } from 'vitest';
import {
  getWorkspaceMembers,
  resolveWorkspaceMemberDisplayName,
} from './workspace-members';

type QueryResult = {
  data: unknown;
  error: unknown;
};

type TableResult = QueryResult | (() => QueryResult);

function createSupabaseMock(tableResults: Record<string, TableResult>) {
  const selects: Record<string, string[]> = {};
  const resolveTableResult = (table: string): QueryResult => {
    const result = tableResults[table];

    if (!result) {
      throw new Error(`Missing Supabase mock result for ${table}`);
    }

    return typeof result === 'function' ? result() : result;
  };

  const from = (table: string) => {
    const query = {
      eq: () => query,
      in: () => query,
      order: () => query,
      select: (value: string) => {
        selects[table] = [...(selects[table] ?? []), value];
        return query;
      },
      single: async () => resolveTableResult(table),
    };

    Object.defineProperty(query, 'then', {
      value: (resolve: (value: QueryResult) => unknown) =>
        Promise.resolve(resolveTableResult(table)).then(resolve),
    });

    return query;
  };

  return {
    client: { from },
    selects,
  };
}

describe('resolveWorkspaceMemberDisplayName', () => {
  it('prefers a non-empty workspace display name', () => {
    expect(
      resolveWorkspaceMemberDisplayName({
        workspaceDisplayName: 'Workspace Alias',
        workspaceFullName: 'Workspace Full Name',
        userDisplayName: 'User Display Name',
      })
    ).toBe('Workspace Alias');
  });

  it('falls back to workspace full name when workspace display name is empty', () => {
    expect(
      resolveWorkspaceMemberDisplayName({
        workspaceDisplayName: '   ',
        workspaceFullName: 'Workspace Full Name',
        userDisplayName: 'User Display Name',
      })
    ).toBe('Workspace Full Name');
  });

  it('falls back to user display name when workspace profile names are empty', () => {
    expect(
      resolveWorkspaceMemberDisplayName({
        workspaceDisplayName: null,
        workspaceFullName: '',
        userDisplayName: 'User Display Name',
      })
    ).toBe('User Display Name');
  });
});

describe('getWorkspaceMembers', () => {
  it('uses the shared-with user relation when enriching direct board guests', async () => {
    const baseResults = {
      workspace_default_permissions: { data: [], error: null },
      workspace_members_and_invites: {
        data: [
          {
            avatar_url: null,
            created_at: '2026-01-01T00:00:00.000Z',
            display_name: 'Member One',
            email: 'member@example.com',
            handle: 'member-one',
            id: 'user-1',
            pending: false,
            type: 'MEMBER',
          },
        ],
        error: null,
      },
      workspace_role_members: { data: [], error: null },
      workspaces: { data: { creator_id: 'user-1' }, error: null },
    };
    const adminResults = {
      task_board_shares: {
        data: [
          {
            created_at: '2026-01-02T00:00:00.000Z',
            id: 'share-1',
            permission: 'edit',
            shared_with_email: null,
            shared_with_user_id: 'guest-user-1',
            users: {
              avatar_url: 'https://example.com/avatar.png',
              display_name: 'Board Guest',
              handle: 'board-guest',
              id: 'guest-user-1',
            },
            workspace_boards: {
              id: 'board-1',
              name: 'Roadmap',
            },
          },
        ],
        error: null,
      },
      user_private_details: {
        data: [{ email: 'member@example.com', user_id: 'user-1' }],
        error: null,
      },
      workspace_secrets: { data: [], error: null },
      workspace_user_linked_users: { data: [], error: null },
      workspace_users: { data: [], error: null },
    };
    const supabase = createSupabaseMock(baseResults);
    const sbAdmin = createSupabaseMock(adminResults);

    const members = await getWorkspaceMembers({
      sbAdmin: sbAdmin.client as never,
      supabase: supabase.client as never,
      wsId: 'workspace-1',
    });

    expect(sbAdmin.selects.task_board_shares?.at(0)).toContain(
      'users:shared_with_user_id(id, display_name, handle, avatar_url)'
    );
    expect(members).toHaveLength(2);
    expect(members[1]).toMatchObject({
      direct_board_guest: true,
      display_name: 'Board Guest',
      guest_access_type: 'task_board',
      guest_board_count: 1,
      guest_board_names: ['Roadmap'],
      guest_highest_permission: 'edit',
      id: 'guest-user-1',
      pending: false,
      workspace_member_type: 'GUEST',
    });
  });
});
