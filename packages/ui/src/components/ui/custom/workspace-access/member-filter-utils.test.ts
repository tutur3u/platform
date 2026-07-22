import type { InternalApiEnhancedWorkspaceMember } from '@tuturuuu/types';
import { describe, expect, it } from 'vitest';
import {
  filterWorkspaceMembers,
  getEffectiveMemberPermissionIds,
  getMemberFilterOptions,
  parseInviteEmails,
  shouldShowProtectedMemberStatus,
} from './member-filter-utils';

function member(
  overrides: Partial<InternalApiEnhancedWorkspaceMember>
): InternalApiEnhancedWorkspaceMember {
  return {
    avatar_url: null,
    birthday: null,
    created_at: null,
    default_permissions: [],
    display_name: null,
    email: null,
    handle: null,
    id: crypto.randomUUID(),
    is_creator: false,
    new_email: null,
    password_hash: undefined,
    pending: false,
    phone: null,
    roles: [],
    workspace_member_type: 'MEMBER',
    ws_id: null,
    ...overrides,
  };
}

describe('workspace access member filter utilities', () => {
  it('deduplicates line and comma separated invite emails', () => {
    expect(
      parseInviteEmails('one@example.com, two@example.com\none@example.com')
    ).toEqual(['one@example.com', 'two@example.com']);
  });

  it('builds role and permission options from effective member access', () => {
    const members = [
      member({
        roles: [
          {
            id: 'role-admin',
            name: 'Admin',
            permissions: [{ enabled: true, permission: 'manage_workspace' }],
          },
        ],
      }),
      member({
        default_permissions: [{ enabled: true, permission: 'view_drive' }],
        roles: [
          {
            id: 'role-admin',
            name: 'Admin',
            permissions: [{ enabled: true, permission: 'manage_workspace' }],
          },
        ],
      }),
    ];

    const options = getMemberFilterOptions(members, [
      {
        groupTitle: 'Workspace',
        id: 'manage_workspace',
        title: 'Manage workspace',
      },
      { groupTitle: 'Drive', id: 'view_drive', title: 'View drive' },
    ]);

    expect(options.roles).toEqual([
      { count: 2, id: 'role-admin', name: 'Admin' },
    ]);
    expect(options.permissions).toEqual([
      {
        count: 2,
        groupTitle: 'Workspace',
        id: 'manage_workspace',
        title: 'Manage workspace',
      },
      {
        count: 1,
        groupTitle: 'Drive',
        id: 'view_drive',
        title: 'View drive',
      },
    ]);
  });

  it('filters by status, text, role, and effective permissions', () => {
    const admin = member({
      display_name: 'Ada Admin',
      id: 'admin-user',
      roles: [
        {
          id: 'role-admin',
          name: 'Admin',
          permissions: [{ enabled: true, permission: 'manage_workspace' }],
        },
      ],
    });
    const viewer = member({
      display_name: 'Vera Viewer',
      id: 'viewer-user',
      default_permissions: [{ enabled: true, permission: 'view_drive' }],
      roles: [
        {
          id: 'role-viewer',
          name: 'Viewer',
          permissions: [],
        },
      ],
    });
    const invited = member({
      email: 'pending@example.com',
      id: null,
      pending: true,
    });

    expect(
      filterWorkspaceMembers([admin, viewer, invited], {
        permissionIds: ['manage_workspace'],
        roleIds: ['role-admin'],
        search: 'ada',
        status: 'joined',
      }).map((item) => item.id)
    ).toEqual(['admin-user']);
  });

  it('treats creator and admin permission as all-access for permission filters', () => {
    const creator = member({
      id: 'creator-user',
      is_creator: true,
    });
    const roleAdmin = member({
      id: 'role-admin-user',
      roles: [
        {
          id: 'role-owner',
          name: 'Owner',
          permissions: [{ enabled: true, permission: 'admin' }],
        },
      ],
    });
    const pending = member({
      id: null,
      pending: true,
      roles: [],
    });

    expect(
      filterWorkspaceMembers([creator, roleAdmin, pending], {
        permissionIds: ['manage_workspace_members'],
        roleIds: [],
      }).map((item) => item.id)
    ).toEqual(['creator-user', 'role-admin-user']);
  });

  it('ignores disabled permissions when deriving effective access', () => {
    const disabled = member({
      default_permissions: [{ enabled: false, permission: 'view_drive' }],
      roles: [
        {
          id: 'role-drive',
          name: 'Drive',
          permissions: [{ enabled: false, permission: 'manage_drive' }],
        },
      ],
    });

    expect([...getEffectiveMemberPermissionIds(disabled)]).toEqual([]);
  });

  it('only labels the actual creator as a protected member', () => {
    expect(
      shouldShowProtectedMemberStatus({
        isCreator: true,
      })
    ).toBe(true);
    expect(
      shouldShowProtectedMemberStatus({
        isCreator: false,
      })
    ).toBe(false);
  });
});
