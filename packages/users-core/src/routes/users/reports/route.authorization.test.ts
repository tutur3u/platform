import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ admin: vi.fn(), permissions: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-user-link', () => ({
  getWorkspaceUserLinkForUser: async () => ({ virtual_user_id: 'teacher' }),
}));
vi.mock('../../../lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.permissions,
}));
vi.mock('../../../lib/user-groups/route-helpers', () => ({
  resolveRequestActorAuthUid: async () => 'teacher',
  resolveUserGroupRouteWorkspaceId: async () => 'ws-a',
}));
vi.mock('../../../lib/user-groups/groups-utils', () => ({
  getUserGroupMembershipsForActor: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/reports', () => ({
  PERIODIC_REPORT_STAGES: [
    'draft',
    'pending_review',
    'approved',
    'delivered',
    'blocked',
    'failed',
  ],
}));

import { POST } from './route';

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

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
const groupA = '33333333-3333-4333-8333-333333333333';
const groupB = '44444444-4444-4444-8444-444444444444';
function call(user_id = userA, group_id = groupA) {
  return POST(
    new Request('https://example.invalid/reports', {
      method: 'POST',
      body: JSON.stringify({
        user_id,
        group_id,
        title: 'Report',
        content: '',
        feedback: '',
      }),
    }),
    { params: Promise.resolve({ wsId: 'personal' }) }
  );
}
describe('report creation workspace scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writes = [];
    reads.length = 0;
    tables = {
      workspace_users: [
        { id: userA, ws_id: 'ws-a' },
        { id: userB, ws_id: 'ws-b' },
      ],
      workspace_user_groups: [
        { id: groupA, ws_id: 'ws-a' },
        { id: groupB, ws_id: 'ws-b' },
      ],
      workspace_user_groups_users: [{ user_id: userA, group_id: groupA }],
    };
    mocks.admin.mockResolvedValue(client);
    mocks.permissions.mockResolvedValue({
      wsId: 'ws-a',
      containsPermission: () => true,
    });
  });
  it.each([
    [userB, groupA],
    [userA, groupB],
    [userB, groupB],
  ])(
    'rejects foreign references before looking for duplicate reports',
    async (user, group) => {
      tables.external_user_monthly_reports = [
        { id: 'existing', user_id: user, group_id: group, title: 'Report' },
      ];
      expect((await call(user, group)).status).toBe(404);
      expect(reads).not.toContain('external_user_monthly_reports');
      expect(writes).toEqual([]);
    }
  );
  it('preserves authorized teacher report creation', async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({ id: 'new', creator_id: 'teacher' })
    );
    expect(writes).toEqual(['external_user_monthly_reports:insert']);
  });
  it('preserves duplicate detection for authorized references', async () => {
    tables.external_user_monthly_reports = [
      { id: 'existing', user_id: userA, group_id: groupA, title: 'Report' },
    ];
    expect((await call()).status).toBe(409);
    expect(writes).toEqual([]);
  });
});
