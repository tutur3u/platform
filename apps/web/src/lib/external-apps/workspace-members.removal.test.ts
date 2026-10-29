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
    // biome-ignore lint/suspicious/noThenProperty: Supabase queries are awaitable.
    then: (
      resolve: (value: { data: Row[]; error: null; count: number }) => unknown
    ) =>
      Promise.resolve(resolve({ data: rows, error: null, count: rows.length })),
  };
  return q;
}
const admin = { from: vi.fn(query) };

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
    mocks.members.mockResolvedValue([
      fixture(creator, true),
      fixture(member),
      fixture(actor),
    ]);
  });
  it.each([creator, creator.toUpperCase()])(
    'preserves creator protection for canonical UUID identity',
    async (id) => {
      expect((await call(id)).status).toBe(403);
      expect(writes).toEqual([]);
    }
  );
  it.each([actor, actor.toUpperCase()])(
    'preserves self protection',
    async (id) => {
      expect((await call(id)).status).toBe(403);
      expect(writes).toEqual([]);
    }
  );
  it.each([member, member.toUpperCase()])(
    'preserves last-admin protection',
    async (id) => {
      mocks.members.mockResolvedValue([
        fixture(member, false, true),
        fixture(actor),
      ]);
      expect((await call(id)).status).toBe(403);
      expect(writes).toEqual([]);
    }
  );
  it.each([`{${creator}}`, creator.replaceAll('-', ''), 'not-a-uuid'])(
    'rejects noncanonical member identifier syntax',
    async (id) => {
      expect((await call(id)).status).toBe(400);
      expect(writes).toEqual([]);
    }
  );
  it.each([member, member.toUpperCase()])(
    'uses the canonical target for scoped deletion',
    async (id) => {
      expect((await call(id)).status).toBe(200);
      expect(filters).toContainEqual(['workspace_members', 'ws_id', 'ws-a']);
      expect(filters).toContainEqual(['workspace_members', 'user_id', member]);
      expect(filters).toContainEqual(['workspace_invites', 'user_id', member]);
      expect(writes).toEqual(['workspace_invites', 'workspace_members']);
    }
  );
  it('retains email-only invitation removal', async () => {
    expect((await call(null, 'invite@example.invalid')).status).toBe(200);
    expect(writes).toEqual(['workspace_email_invites']);
  });
});
