import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ members: vi.fn() }));
vi.mock('@/lib/workspace-members', () => ({
  getWorkspaceMembers: mocks.members,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@tuturuuu/auth/app-coordination', () => ({
  getBearerAppCoordinationToken: vi.fn(),
  verifyAppCoordinationToken: vi.fn(),
}));
vi.mock('@tuturuuu/payment-core/seat-limits', () => ({
  getEffectiveAvailableSeats: vi.fn(),
}));
vi.mock('@/lib/app-coordination/external-apps', () => ({
  getExternalAppById: vi.fn(),
}));

import { removeExternalAppWorkspaceMember } from './workspace-members';

const creator = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const member = 'fedcbafe-dcba-4fed-8cba-fedcbafedcba';
const actor = 'aabbccdd-aabb-4ccd-8aab-aabbccddeeff';
type Row = Record<string, unknown>;
const filters: Array<[string, string, unknown]> = [];
const writes: string[] = [];
const uuidValue = (value: unknown) =>
  typeof value === 'string' ? value.replace(/[{}-]/g, '').toLowerCase() : value;
function query(table: string) {
  let rows: Row[] =
    table === 'workspaces'
      ? [{ id: 'ws-a', creator_id: creator, personal: true }]
      : [];
  const q = {
    select: () => q,
    delete: () => {
      writes.push(table);
      return q;
    },
    eq: (key: string, value: unknown) => {
      filters.push([table, key, value]);
      rows = rows.filter((row) => uuidValue(row[key]) === uuidValue(value));
      return q;
    },
    in: () => q,
    ilike: () => q,
    single: async () => ({ data: rows[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then: (
      resolve: (value: { data: Row[]; error: null; count: number }) => unknown
    ) =>
      Promise.resolve(resolve({ data: rows, error: null, count: rows.length })),
  };
  return q;
}
const admin = { from: vi.fn(query), rpc: vi.fn() };

function fixture(id: string, isCreator = false, isAdmin = false) {
  return {
    id,
    is_creator: isCreator,
    pending: false,
    avatar_url: null,
    display_name: 'Member',
    email: 'member@example.invalid',
    default_permissions: [],
    roles: isAdmin
      ? [{ id: 'role', permissions: [{ permission: 'admin', enabled: true }] }]
      : [],
  };
}
function call(userId: string | null, email?: string) {
  return removeExternalAppWorkspaceMember({
    access: {
      admin,
      normalizedWorkspaceId: 'ws-a',
      user: { id: actor, email: 'actor@example.invalid' },
    } as never,
    request: new Request('https://example.invalid/members/access', {
      method: 'DELETE',
      body: JSON.stringify({
        ...(userId === null ? {} : { userId }),
        ...(email ? { email } : {}),
      }),
    }),
  });
}
describe('external app member removal target identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    filters.length = 0;
    writes.length = 0;
    admin.rpc.mockReset();
    admin.rpc.mockImplementation(
      async (_name, args: { p_user_id: string }) => ({
        data:
          args.p_user_id === creator
            ? 'creator_protected'
            : args.p_user_id === actor
              ? 'self_protected'
              : 'removed',
        error: null,
      })
    );
    mocks.members.mockResolvedValue([
      fixture(creator, true),
      fixture(member),
      fixture(actor),
    ]);
  });
  it.each([creator, creator.toUpperCase()])(
    'preserves creator protection for canonical UUID identity',
    async (id) => {
      const response = await call(id);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        message: 'Workspace creator access cannot be changed here',
      });
      expect(admin.from).not.toHaveBeenCalled();
      expect(writes).toEqual([]);
    }
  );
  it.each([actor, actor.toUpperCase()])(
    'preserves self protection',
    async (id) => {
      const response = await call(id);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        message: 'Cannot change your own access',
      });
      expect(admin.from).not.toHaveBeenCalled();
      expect(writes).toEqual([]);
    }
  );
  it.each([member, member.toUpperCase()])(
    'preserves last-admin protection',
    async (id) => {
      admin.rpc.mockResolvedValue({ data: 'last_admin', error: null });
      const response = await call(id);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        message: 'At least one workspace admin is required',
      });
      expect(admin.from).not.toHaveBeenCalled();
      expect(writes).toEqual([]);
    }
  );
  it.each([`{${creator}}`, creator.replaceAll('-', ''), 'not-a-uuid'])(
    'rejects noncanonical member identifier syntax',
    async (id) => {
      const response = await call(id);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        message: 'Missing member identifier',
      });
      expect(admin.rpc).not.toHaveBeenCalled();
      expect(writes).toEqual([]);
    }
  );
  it.each([member, member.toUpperCase()])(
    'uses the canonical target for scoped deletion',
    async (id) => {
      expect((await call(id)).status).toBe(200);
      expect(admin.rpc).toHaveBeenCalledExactlyOnceWith(
        'remove_workspace_member_guarded_in_mode',
        {
          p_actor_id: actor,
          p_guard_self: false,
          p_mode: 'external_app',
          p_user_id: member,
          p_ws_id: 'ws-a',
        }
      );
      expect(admin.rpc.mock.invocationCallOrder[0]).toBeLessThan(
        admin.from.mock.invocationCallOrder[0]!
      );
      expect(filters).toContainEqual(['workspace_invites', 'user_id', member]);
      expect(writes).toEqual(['workspace_invites']);
    }
  );
  it.each([
    [
      'last_manager',
      409,
      {
        code: 'WORKSPACE_LAST_MANAGER',
        message: 'At least one member must be able to manage members',
      },
    ],
    ['forbidden', 403, { error: 'Forbidden' }],
    ['unexpected', 500, { message: 'Error removing workspace access' }],
  ])(
    'maps %s without cancellation or direct removal',
    async (data, status, body) => {
      admin.rpc.mockResolvedValue({ data, error: null });
      const response = await call(member, 'invite@example.invalid');
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual(body);
      expect(admin.from).not.toHaveBeenCalled();
    }
  );

  it('preserves access records on an RPC error', async () => {
    admin.rpc.mockResolvedValue({
      data: 'removed',
      error: new Error('unavailable'),
    });
    const response = await call(member, 'invite@example.invalid');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: 'Error removing workspace access',
    });
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('cancels a direct invitation when membership is already absent', async () => {
    mocks.members.mockResolvedValue([fixture(creator, true), fixture(actor)]);
    admin.rpc.mockResolvedValue({ data: 'not_found', error: null });
    const response = await call(member);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: 'success' });
    expect(writes).toEqual(['workspace_invites']);
  });

  it('keeps the last-admin check for a listed board guest without membership', async () => {
    mocks.members.mockResolvedValue([
      { ...fixture(member), direct_board_guest: true },
      fixture(actor),
    ]);
    admin.rpc.mockResolvedValue({ data: 'not_found', error: null });

    const response = await call(member);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      message: 'At least one workspace admin is required',
    });
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('cancels both invitations only after a matching membership is removed', async () => {
    const response = await call(member, 'invite@example.invalid');
    expect(response.status).toBe(200);
    expect(writes).toEqual(['workspace_invites', 'workspace_email_invites']);
    expect(admin.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      admin.from.mock.invocationCallOrder[0]!
    );
    expect(admin.from).not.toHaveBeenCalledWith(
      'workspace_members_and_invites'
    );
  });

  it('retains email-only invitation removal', async () => {
    expect((await call(null, 'invite@example.invalid')).status).toBe(200);
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(writes).toEqual(['workspace_email_invites']);
  });
});
