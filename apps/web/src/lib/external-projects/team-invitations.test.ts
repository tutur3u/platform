import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  inviteExternalProjectTeamMembers,
  updateExternalProjectTeamInvitationRoles,
} from './team-invitations';

const mocks = {
  getEffectiveAvailableSeats: vi.fn(),
};

vi.mock('@tuturuuu/payment-core/seat-limits', () => ({
  getEffectiveAvailableSeats: (...args: unknown[]) =>
    mocks.getEffectiveAvailableSeats(...args),
}));

function createAccess() {
  const calls = {
    rpcs: [] as Array<{ args: unknown; name: string }>,
  };
  const admin = {
    from(table: string) {
      if (table === 'workspace_roles') {
        return {
          select() {
            return {
              eq() {
                return this;
              },
              in(_column: string, ids: string[]) {
                return Promise.resolve({
                  data: ids.map((id) => ({ id })),
                  error: null,
                });
              },
            };
          },
        };
      }
      if (table === 'workspace_email_invites') {
        return {
          select() {
            return {
              eq() {
                return this;
              },
              maybeSingle() {
                return Promise.resolve({
                  data: { email: 'editor@example.com' },
                  error: null,
                });
              },
            };
          },
        };
      }
      if (table === 'onboarding_progress') {
        return {
          upsert() {
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
    schema() {
      return {
        rpc(name: string, args: unknown) {
          calls.rpcs.push({ args, name });
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  return {
    access: {
      admin,
      canManageRoles: true,
      normalizedWorkspaceId: 'workspace-1',
      user: { id: 'actor-1' },
    },
    calls,
  };
}

describe('external-project member invitations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEffectiveAvailableSeats.mockResolvedValue({
      effectiveAvailable: 10,
      status: { isSeatBased: true, seatCount: 10 },
    });
  });

  it('creates invitations atomically with the selected access level', async () => {
    const { access, calls } = createAccess();
    const roleId = '8f98318a-a101-4729-9e2a-b59f28b9c302';
    const response = await inviteExternalProjectTeamMembers({
      access: access as never,
      request: new Request('http://localhost/invite', {
        body: JSON.stringify({
          emails: ['Editor@Example.com'],
          roleIds: [roleId],
        }),
        method: 'POST',
      }),
    });

    expect(response.status).toBe(200);
    expect(calls.rpcs).toContainEqual({
      args: {
        p_email: 'editor@example.com',
        p_invited_by: 'actor-1',
        p_member_type: 'MEMBER',
        p_role_ids: [roleId],
        p_ws_id: 'workspace-1',
      },
      name: 'create_workspace_email_invitation_with_roles',
    });
  });

  it('can restore a pending invitation to workspace-default access', async () => {
    const { access, calls } = createAccess();
    const response = await updateExternalProjectTeamInvitationRoles({
      access: access as never,
      request: new Request('http://localhost/invite', {
        body: JSON.stringify({
          email: 'Editor@Example.com',
          roleIds: [],
        }),
        method: 'PATCH',
      }),
    });

    expect(response.status).toBe(200);
    expect(calls.rpcs).toContainEqual({
      args: {
        p_email: 'editor@example.com',
        p_role_ids: [],
        p_user_id: null,
        p_ws_id: 'workspace-1',
      },
      name: 'set_workspace_invitation_roles',
    });
  });
});
