import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ create: vi.fn(), normalize: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.create,
  createAdminClient: vi.fn(),
}));
vi.mock('@tuturuuu/payment/polar/server', () => ({
  createPolarClient: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalize,
  getPermissions: vi.fn(),
}));

import { GET } from './route';

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

const auth = { getUser: vi.fn() };
const supabase = { ...client, auth };
function call(appSession = true) {
  return GET(
    new NextRequest('https://example.invalid/members'),
    { params: Promise.resolve({ wsId: 'personal' }) },
    appSession
      ? { user: { id: 'actor' }, supabase: supabase as never }
      : undefined
  );
}
describe('members read authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writes = [];
    reads.length = 0;
    tables = {
      workspaces: [{ id: 'ws-a', creator_id: 'actor' }],
      workspace_members: [
        {
          ws_id: 'ws-a',
          user_id: 'actor',
          type: 'MEMBER',
          users: {
            id: 'actor',
            display_name: 'Teacher',
            avatar_url: null,
            email: 'teacher@example.invalid',
          },
        },
      ],
    };
    mocks.normalize.mockResolvedValue('ws-a');
    mocks.create.mockResolvedValue(supabase);
    auth.getUser.mockResolvedValue({ data: { user: { id: 'actor' } } });
  });
  it('rejects a nonmember app-session actor before reading member details', async () => {
    tables.workspace_members = [
      {
        ws_id: 'ws-a',
        user_id: 'other',
        type: 'MEMBER',
        users: { id: 'other', email: 'other@example.invalid' },
      },
    ];
    expect((await call()).status).toBe(403);
    expect(reads).not.toContain('workspaces');
  });
  it.each(['MEMBER', 'GUEST'])(
    'preserves the %s member picker shape',
    async (type) => {
      tables.workspace_members![0]!.type = type;
      const response = await call();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        members: [
          {
            id: 'actor',
            user_id: 'actor',
            display_name: 'Teacher',
            avatar_url: null,
            email: 'teacher@example.invalid',
            is_creator: true,
          },
        ],
      });
    }
  );
  it('rejects an unauthenticated cookie request', async () => {
    auth.getUser.mockResolvedValue({ data: { user: null } });
    expect((await call(false)).status).toBe(401);
    expect(reads).toEqual([]);
  });
  it('preserves authenticated cookie member reads', async () => {
    expect((await call(false)).status).toBe(200);
  });
});
