import type { PermissionId } from '@tuturuuu/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addExternalProjectRoleMembers,
  createExternalProjectTeamRole,
  inviteExternalProjectTeamMembers,
  updateExternalProjectTeamDefaultPermissions,
  updateExternalProjectTeamInvitationRoles,
  updateExternalProjectTeamRole,
} from './team-access';

vi.mock('./access', () => ({
  hasRootExternalProjectsAdminPermission: vi.fn(),
  requireWorkspaceExternalProjectAccess: vi.fn(),
  requireWorkspaceExternalProjectMemberBootstrapAccess: vi.fn(),
}));

vi.mock('@tuturuuu/payment-core/seat-limits', () => ({
  getEffectiveAvailableSeats: vi.fn(async () => ({
    effectiveAvailable: 10,
    status: { isSeatBased: false, seatCount: 0 },
  })),
}));

const BILLING_ROLE_ID = '8f98318a-a101-4729-9e2a-b59f28b9c302';
const STAFF_ROLE_ID = '0b0e7f4e-2f8a-4c55-9a51-0f2d3c3b1a10';
const CREATOR_ID = 'creator-1';

function createAccess({
  actorId,
  pendingRoleIds = [],
}: {
  actorId: string;
  pendingRoleIds?: string[];
}) {
  const writes: Array<{ op: string; rows: unknown; table: string }> = [];
  const rpcs: Array<{ args: unknown; name: string }> = [];

  const createQuery = (table: string) => {
    const filters: Record<string, unknown> = {};
    const result = () => {
      if (table === 'workspaces') {
        return { data: { creator_id: CREATOR_ID }, error: null };
      }
      if (table === 'workspace_roles') {
        const ids = (filters.id as string[] | string | undefined) ?? [];
        return Array.isArray(ids)
          ? { data: ids.map((id) => ({ id })), error: null }
          : { data: { id: ids }, error: null };
      }
      if (table === 'workspace_role_permissions') {
        const ids = (filters.role_id as string[] | string | undefined) ?? [];
        return {
          data: [ids]
            .flat()
            .filter((id) => id === BILLING_ROLE_ID)
            .map((role_id) => ({ role_id })),
          error: null,
        };
      }
      if (table === 'workspace_email_invites') {
        return { data: { email: 'editor@example.com' }, error: null };
      }
      return { data: null, error: null };
    };
    const query: Record<string, unknown> = {
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return query;
      },
      in: (column: string, values: unknown[]) => {
        filters[column] = values;
        return query;
      },
      maybeSingle: async () => result(),
      select: () => query,
      single: async () =>
        table === 'workspace_roles' && !filters.id
          ? { data: { id: 'new-role' }, error: null }
          : result(),
    };
    for (const op of ['delete', 'insert', 'update', 'upsert']) {
      query[op] = (rows: unknown) => {
        writes.push({ op, rows, table });
        return query;
      };
    }
    // biome-ignore lint/suspicious/noThenProperty: mimics the awaitable query builder.
    query.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve);
    return query;
  };

  const admin = {
    from: createQuery,
    schema: () => ({
      rpc: async (name: string, args: unknown) => {
        rpcs.push({ args, name });
        if (name === 'get_workspace_invitation_role_ids') {
          return { data: pendingRoleIds, error: null };
        }
        return { data: null, error: null };
      },
    }),
  };

  return {
    access: {
      admin,
      canManageMembers: true,
      canManageRoles: true,
      normalizedWorkspaceId: 'workspace-1',
      user: { id: actorId },
    } as never,
    rpcs,
    writtenPermissions: (table: string) =>
      writes
        .filter(
          (write) =>
            write.table === table &&
            (write.op === 'insert' || write.op === 'upsert')
        )
        .flatMap((write) => write.rows as Array<{ permission: string }>)
        .map((row) => row.permission),
    writes,
  };
}

const rolePayload: {
  name: string;
  permissions: { enabled: boolean; id: PermissionId }[];
} = {
  name: 'Finance',
  permissions: [
    { enabled: true, id: 'manage_subscription' },
    { enabled: true, id: 'manage_finance' },
  ],
};

describe('external project team creator-grant permissions', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['a non-creator', 'admin-1', ['manage_finance']],
    ['the creator', CREATOR_ID, ['manage_subscription', 'manage_finance']],
  ])('filters role creation by %s', async (_label, actorId, expected) => {
    const team = createAccess({ actorId });
    const response = await createExternalProjectTeamRole({
      access: team.access,
      payload: rolePayload,
    });

    expect(response.status).toBe(200);
    expect(team.writtenPermissions('workspace_role_permissions')).toEqual(
      expected
    );
  });

  it.each([
    ['a non-creator', 'admin-1', ['manage_finance']],
    ['the creator', CREATOR_ID, ['manage_subscription', 'manage_finance']],
  ])('filters role updates by %s', async (_label, actorId, expected) => {
    const team = createAccess({ actorId });
    const response = await updateExternalProjectTeamRole({
      access: team.access,
      payload: rolePayload,
      roleId: STAFF_ROLE_ID,
    });

    expect(response.status).toBe(200);
    expect(team.writtenPermissions('workspace_role_permissions')).toEqual(
      expected
    );
  });

  it.each([
    ['a non-creator', 'admin-1', ['manage_finance']],
    ['the creator', CREATOR_ID, ['manage_subscription', 'manage_finance']],
  ])('filters default permissions by %s', async (_label, actorId, expected) => {
    const team = createAccess({ actorId });
    const response = await updateExternalProjectTeamDefaultPermissions({
      access: team.access,
      memberType: 'MEMBER',
      payload: { permissions: rolePayload.permissions },
    });

    expect(response.status).toBe(200);
    expect(team.writtenPermissions('workspace_default_permissions')).toEqual(
      expected
    );
  });

  it.each([
    ['a non-creator', 'admin-1', 403],
    ['the creator', CREATOR_ID, 200],
  ])(
    'lets only the creator add people to a billing role (%s)',
    async (_label, actorId, status) => {
      const team = createAccess({ actorId });
      const response = await addExternalProjectRoleMembers({
        access: team.access,
        request: new Request('http://localhost', {
          body: JSON.stringify({ memberIds: ['user-1'] }),
          method: 'POST',
        }),
        roleId: BILLING_ROLE_ID,
      });

      expect(response.status).toBe(status);
      expect(
        team.writes.some((write) => write.table === 'workspace_role_members')
      ).toBe(status === 200);
    }
  );

  it.each([
    ['a non-creator', 'admin-1', 403],
    ['the creator', CREATOR_ID, 200],
  ])(
    'lets only the creator invite with a billing role (%s)',
    async (_label, actorId, status) => {
      const team = createAccess({ actorId });
      const response = await inviteExternalProjectTeamMembers({
        access: team.access,
        request: new Request('http://localhost/invite', {
          body: JSON.stringify({
            emails: ['editor@example.com'],
            roleIds: [BILLING_ROLE_ID],
          }),
          method: 'POST',
        }),
      });

      expect(response.status).toBe(status);
      expect(
        team.rpcs.some(
          (rpc) => rpc.name === 'create_workspace_email_invitation_with_roles'
        )
      ).toBe(status === 200);
    }
  );

  it.each([
    ['adds the role as a non-creator', 'admin-1', [], 403],
    [
      'keeps an assigned role as a non-creator',
      'admin-1',
      [BILLING_ROLE_ID],
      200,
    ],
    ['adds the role as the creator', CREATOR_ID, [], 200],
  ])(
    'pending invitation edit %s',
    async (_label, actorId, pendingRoleIds, status) => {
      const team = createAccess({ actorId, pendingRoleIds });
      const response = await updateExternalProjectTeamInvitationRoles({
        access: team.access,
        request: new Request('http://localhost/invite', {
          body: JSON.stringify({
            email: 'editor@example.com',
            roleIds: [STAFF_ROLE_ID, BILLING_ROLE_ID],
          }),
          method: 'PATCH',
        }),
      });

      expect(response.status).toBe(status);
      const setCall = team.rpcs.find(
        (rpc) => rpc.name === 'set_workspace_invitation_roles'
      );
      if (status === 200) {
        expect(setCall?.args).toMatchObject({ p_actor_id: actorId });
      } else {
        expect(setCall).toBeUndefined();
      }
    }
  );
});
