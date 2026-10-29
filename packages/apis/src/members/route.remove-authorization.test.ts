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

import { DELETE } from './route';

const creator = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const member = 'fedcbafe-dcba-4fed-8cba-fedcbafedcba';
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
    mocks.admin.mockResolvedValue(admin);
    mocks.permissions.mockResolvedValue({ withoutPermission: () => false });
  });
  it.each([creator, creator.toUpperCase()])(
    'preserves creator protection for canonical UUID identity',
    async (id) => {
      expect((await call(id)).status).toBe(409);
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
    'uses the canonical target for every scoped member and invite deletion',
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
