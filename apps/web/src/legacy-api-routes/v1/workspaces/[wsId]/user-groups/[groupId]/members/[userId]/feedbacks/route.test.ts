import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  permissions: vi.fn(),
  weak: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
  createClient: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: async () => ({ user: { id: 'teacher' } }),
}));
vi.mock('@/lib/tutoring/weak-content-access', () => ({
  denyWeakContentEdit: mocks.weak,
}));
vi.mock('@/lib/user-groups/revalidate', () => ({
  revalidateUserGroupCache: mocks.revalidate,
}));

import { DELETE, GET, POST, PUT } from './route';

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let writes: string[];
const reads: string[] = [];
function query(table: string) {
  let rows = [...(tables[table] ?? [])];
  let operation = '';
  const result = () => {
    if (operation) writes.push(`${table}:${operation}`);
    return { data: rows, error: null, count: rows.length };
  };
  const q = {
    select: () => q,
    eq: (key: string, value: unknown) => {
      rows = rows.filter((row) => row[key] === value);
      return q;
    },
    order: () => q,
    range: () => q,
    limit: () => q,
    insert: (row: Row) => {
      operation = 'insert';
      rows = [{ id: 'new', ...row }];
      return q;
    },
    update: () => {
      operation = 'update';
      return q;
    },
    delete: () => {
      operation = 'delete';
      return q;
    },
    maybeSingle: async () => ({ ...result(), data: rows[0] ?? null }),
    single: async () => ({ ...result(), data: rows[0] ?? null }),
    // biome-ignore lint/suspicious/noThenProperty: Supabase queries are awaitable.
    then: (resolve: (value: ReturnType<typeof result>) => unknown) =>
      Promise.resolve(resolve(result())),
  };
  return q;
}
const client = {
  from: vi.fn((table: string) => {
    reads.push(table);
    return query(table);
  }),
  schema: (_name: string) => client,
};

const handlers = { GET, POST, PUT, DELETE };
const permissions = {
  wsId: 'ws-a',
  containsPermission: () => true,
  withoutPermission: () => false,
};
function call(
  method: keyof typeof handlers,
  groupId = 'group-a',
  userId = 'user-a',
  wsId = 'ws-a'
) {
  return handlers[method](
    new Request('https://example.invalid/feedbacks?feedbackId=feedback', {
      method,
      ...(method === 'POST' || method === 'PUT'
        ? {
            body: JSON.stringify({
              content: 'Feedback',
              require_attention: true,
            }),
          }
        : {}),
    }),
    { params: Promise.resolve({ wsId, groupId, userId }) }
  );
}
describe('group feedback workspace scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writes = [];
    reads.length = 0;
    tables = {
      workspace_users: [
        { id: 'user-a', ws_id: 'ws-a' },
        { id: 'user-b', ws_id: 'ws-b' },
      ],
      workspace_user_groups: [
        { id: 'group-a', ws_id: 'ws-a' },
        { id: 'group-b', ws_id: 'ws-b' },
      ],
      workspace_user_linked_users: [
        {
          platform_user_id: 'teacher',
          ws_id: 'ws-a',
          virtual_user_id: 'teacher-a',
        },
      ],
      user_feedbacks: ['a', 'b'].flatMap((group) =>
        ['a', 'b'].map((user) => ({
          id: 'feedback',
          group_id: `group-${group}`,
          user_id: `user-${user}`,
          content: 'History',
          require_attention: true,
          creator: null,
        }))
      ),
    };
    mocks.admin.mockResolvedValue(client);
    mocks.permissions.mockResolvedValue(permissions);
    mocks.weak.mockResolvedValue(null);
  });
  for (const method of ['GET', 'POST', 'PUT', 'DELETE'] as const) {
    it.each([
      ['group-b', 'user-a'],
      ['group-a', 'user-b'],
      ['group-b', 'user-b'],
    ])(
      `${method} rejects resources outside the authorized workspace`,
      async (group, user) => {
        expect((await call(method, group, user)).status).toBe(404);
        expect(reads).not.toContain('user_feedbacks');
        expect(writes).toEqual([]);
        expect(mocks.revalidate).not.toHaveBeenCalled();
      }
    );
    it(`${method} allows a teacher to retain history without current group membership`, async () => {
      const response = await call(method);
      expect(response.status).toBe(200);
      if (method === 'GET')
        expect((await response.json()).data).toHaveLength(1);
      else expect(writes).toHaveLength(1);
    });
  }
  it.each(['POST', 'PUT', 'DELETE'] as const)(
    '%s preserves weak-content denial',
    async (method) => {
      mocks.weak.mockResolvedValue(new Response(null, { status: 403 }));
      expect((await call(method)).status).toBe(403);
      expect(writes).toEqual([]);
      expect(mocks.weak).toHaveBeenCalledWith(
        expect.objectContaining({ touchesWeakContent: true, wsId: 'ws-a' })
      );
    }
  );
  it('uses the normalized workspace for the feedback creator', async () => {
    expect((await call('POST', 'group-a', 'user-a', 'personal')).status).toBe(
      200
    );
    expect(writes).toEqual(['user_feedbacks:insert']);
  });
});
