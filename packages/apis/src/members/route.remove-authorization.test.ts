import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ admin: vi.fn(), permissions: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
  createClient: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async () => 'ws-a',
  getPermissions: mocks.permissions,
}));
vi.mock('@tuturuuu/payment/polar/server', () => ({
  createPolarClient: vi.fn(),
}));

import { GUARD_WORKSPACE_SELF_REMOVAL } from './guarded-removal';
import { DELETE } from './route';

const creator = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const member = 'fedcbafe-dcba-4fed-8cba-fedcbafedcba';
type Row = Record<string, unknown>;
const filters: Array<[string, string, unknown]> = [];
const writes: string[] = [];
const tableErrors = new Map<string, Error>();
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
      resolve: (value: {
        data: Row[];
        error: Error | null;
        count: number;
      }) => unknown
    ) =>
      Promise.resolve(
        resolve({
          data: rows,
          error: tableErrors.get(table) ?? null,
          count: rows.length,
        })
      ),
  };
  return q;
}
const admin = { from: vi.fn(query), rpc: vi.fn() };

function call(userId: string | null, email?: string) {
  const params = new URLSearchParams();
  if (userId !== null) params.set('id', userId);
  if (email) params.set('email', email);
  return DELETE(
    new NextRequest(`https://example.invalid/members?${params}`, {
      method: 'DELETE',
    }),
    { params: Promise.resolve({ wsId: 'ws-a' }) },
    { supabase: {} as never, user: { id: 'actor' } }
  );
}
describe('member removal target identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    filters.length = 0;
    writes.length = 0;
    tableErrors.clear();
    admin.rpc.mockReset();
    admin.rpc.mockImplementation(
      async (_name, input: { p_user_id: string }) => ({
        data: input.p_user_id === creator ? 'creator_protected' : 'removed',
        error: null,
      })
    );
    mocks.admin.mockResolvedValue(admin);
    mocks.permissions.mockResolvedValue({ withoutPermission: () => false });
  });
  it.each([creator, creator.toUpperCase()])(
    'preserves creator protection for canonical UUID identity',
    async (id) => {
      const response = await call(id);
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        code: 'WORKSPACE_CREATOR_PROTECTED',
        message: 'Workspace creator cannot be removed',
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
      expect(await response.json()).toEqual({ message: 'Invalid member id' });
      expect(admin.rpc).not.toHaveBeenCalled();
      expect(writes).toEqual([]);
    }
  );
  it.each([member, member.toUpperCase()])(
    'uses the canonical target for every scoped member and invite deletion',
    async (id) => {
      expect((await call(id)).status).toBe(200);
      expect(admin.rpc).toHaveBeenCalledExactlyOnceWith(
        'remove_workspace_member_guarded_in_mode',
        {
          p_actor_id: 'actor',
          p_guard_self: GUARD_WORKSPACE_SELF_REMOVAL,
          p_mode: 'workspace',
          p_user_id: member,
          p_ws_id: 'ws-a',
        }
      );
      expect(GUARD_WORKSPACE_SELF_REMOVAL).toBe(false);
      expect(filters).toContainEqual(['workspace_invites', 'user_id', member]);
      expect(admin.rpc.mock.invocationCallOrder[0]).toBeLessThan(
        admin.from.mock.invocationCallOrder[0]!
      );
      expect(writes).toEqual(['workspace_invites']);
    }
  );
  it.each([
    ['forbidden', 403, { message: 'Forbidden' }],
    [
      'last_manager',
      409,
      {
        code: 'WORKSPACE_LAST_MANAGER',
        message: 'At least one member must be able to manage members',
      },
    ],
    ['unknown', 500, { message: 'Error deleting workspace member' }],
    ['self_protected', 500, { message: 'Error deleting workspace member' }],
    ['last_admin', 500, { message: 'Error deleting workspace member' }],
    ['role_protected', 500, { message: 'Error deleting workspace member' }],
    [
      'default_admin_enabled',
      500,
      { message: 'Error deleting workspace member' },
    ],
  ])('keeps access records on response %s', async (data, status, body) => {
    admin.rpc.mockResolvedValue({ data, error: null });
    const response = await call(member);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(body);
    expect(admin.from).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it('halts on an RPC error even if a success result is present', async () => {
    admin.rpc.mockResolvedValue({
      data: 'removed',
      error: new Error('DB unavailable'),
    });
    const response = await call(member);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: 'Error deleting workspace member',
    });
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('cleans up a direct invitation when there is no matching member', async () => {
    admin.rpc.mockResolvedValue({ data: 'not_found', error: null });
    const response = await call(member);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      message: 'success',
      workspace_deleted: false,
    });
    expect(writes).toEqual(['workspace_invites']);
  });

  it('attempts board-share cleanup after a later invitation cleanup failure', async () => {
    tableErrors.set('workspace_invites', new Error('invitation write failed'));
    const response = await call(member);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: 'Error deleting workspace member',
    });
    expect(admin.rpc).toHaveBeenCalledTimes(1);
    expect(admin.from).toHaveBeenCalledWith('workspace_boards');
    expect(admin.from).not.toHaveBeenCalledWith('workspaces');
    expect(writes).toEqual(['workspace_invites']);
  });

  it('retains email-only invitation removal', async () => {
    expect((await call(null, 'invite@example.invalid')).status).toBe(200);
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(writes).toEqual(['workspace_email_invites']);
  });
});
