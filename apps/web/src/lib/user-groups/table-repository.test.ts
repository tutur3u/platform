import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countUserGroupsForTable,
  listUserGroupsForTable,
} from './table-repository';

vi.mock('server-only', () => ({}));

type FallbackRow = {
  amount: number | null;
  archived: boolean | null;
  created_at: string | null;
  ending_date: string | null;
  id: string | null;
  is_guest: boolean | null;
  name: string | null;
  notes: string | null;
  sessions: string[] | null;
  starting_date: string | null;
  ws_id: string | null;
};

type WorkspaceRow = {
  id: string;
  timezone: string | null;
};

function createClient({
  groups,
  workspaces = [{ id: 'ws-1', timezone: 'Asia/Ho_Chi_Minh' }],
}: {
  groups: FallbackRow[];
  workspaces?: WorkspaceRow[];
}) {
  const calls: Array<{
    eqs: Array<{ column: string; value: unknown }>;
    ins: Array<{ column: string; values: unknown[] }>;
    table: string;
  }> = [];
  const rowsByTable: Record<string, Array<Record<string, unknown>>> = {
    workspaces,
    workspace_user_groups_with_guest: groups,
  };

  const client = {
    from: vi.fn((table: string) => {
      const state = {
        eqs: [] as Array<{ column: string; value: unknown }>,
        ins: [] as Array<{ column: string; values: unknown[] }>,
        table,
      };
      calls.push(state);

      let query: {
        eq: ReturnType<typeof vi.fn>;
        in: ReturnType<typeof vi.fn>;
        maybeSingle: ReturnType<typeof vi.fn>;
        order: ReturnType<typeof vi.fn>;
        select: ReturnType<typeof vi.fn>;
      } & PromiseLike<{
        data: Array<Record<string, unknown>> | Record<string, unknown> | null;
        error: null;
      }>;

      query = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: unknown) => {
          state.eqs.push({ column, value });
          return query;
        }),
        in: vi.fn((column: string, values: unknown[]) => {
          state.ins.push({ column, values });
          return query;
        }),
        maybeSingle: vi.fn(() => query),
        order: vi.fn(() => query),
      } as typeof query;

      Object.defineProperty(query, 'then', {
        value: (
          onFulfilled?: (value: {
            data:
              | Array<Record<string, unknown>>
              | Record<string, unknown>
              | null;
            error: null;
          }) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) => {
          const filteredRows = (rowsByTable[table] ?? []).filter((row) => {
            const eqMatches = state.eqs.every(({ column, value }) => {
              return row[column] === value;
            });
            const inMatches = state.ins.every(({ column, values }) => {
              return values.includes(row[column]);
            });

            return eqMatches && inMatches;
          });
          const result =
            table === 'workspaces' ? (filteredRows[0] ?? null) : filteredRows;

          return Promise.resolve({ data: result, error: null }).then(
            onFulfilled,
            onRejected
          );
        },
      });

      return query;
    }),
  };

  return { calls, client };
}

describe('user groups table repository', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-19T18:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists from the Supabase view without requiring a private Postgres connection', async () => {
    const { calls, client } = createClient({
      groups: [
        {
          amount: 3,
          archived: false,
          created_at: '2026-05-01T00:00:00+00:00',
          ending_date: null,
          id: 'group-1',
          is_guest: false,
          name: 'Zed No Session',
          notes: null,
          sessions: ['2026-05-19'],
          starting_date: null,
          ws_id: 'ws-1',
        },
        {
          amount: 2,
          archived: false,
          created_at: '2026-05-02T00:00:00+00:00',
          ending_date: null,
          id: 'group-2',
          is_guest: false,
          name: 'Lớp Cô Tuyết',
          notes: null,
          sessions: ['2026-05-20'],
          starting_date: null,
          ws_id: 'ws-1',
        },
        {
          amount: 1,
          archived: true,
          created_at: '2026-05-03T00:00:00+00:00',
          ending_date: null,
          id: 'group-3',
          is_guest: false,
          name: 'Archived',
          notes: null,
          sessions: ['2026-05-20'],
          starting_date: null,
          ws_id: 'ws-1',
        },
      ],
    });

    const groups = await listUserGroupsForTable({
      accessibleGroupIds: ['group-1', 'group-2'],
      client: client as never,
      groupIds: null,
      page: 1,
      pageSize: 10,
      q: undefined,
      status: 'active',
      wsId: 'ws-1',
    });

    expect(groups.map((group) => group.id)).toEqual(['group-2', 'group-1']);
    expect(groups[0]?.has_session_today).toBe(true);

    const groupsCall = calls.find(
      (call) => call.table === 'workspace_user_groups_with_guest'
    );
    expect(groupsCall?.eqs).toEqual([
      { column: 'ws_id', value: 'ws-1' },
      { column: 'archived', value: false },
    ]);
    expect(groupsCall?.ins).toEqual([
      { column: 'id', values: ['group-1', 'group-2'] },
    ]);
  });

  it('intersects requested and accessible group filters before querying', async () => {
    const { calls, client } = createClient({
      groups: [
        {
          amount: 1,
          archived: false,
          created_at: null,
          ending_date: null,
          id: 'group-1',
          is_guest: false,
          name: 'Allowed',
          notes: null,
          sessions: null,
          starting_date: null,
          ws_id: 'ws-1',
        },
      ],
    });

    await listUserGroupsForTable({
      accessibleGroupIds: ['group-1', 'group-3'],
      client: client as never,
      groupIds: ['group-1', 'group-2'],
      page: 1,
      pageSize: 10,
      q: undefined,
      status: 'active',
      wsId: 'ws-1',
    });

    const groupsCall = calls.find(
      (call) => call.table === 'workspace_user_groups_with_guest'
    );
    expect(groupsCall?.ins).toEqual([{ column: 'id', values: ['group-1'] }]);
  });

  it('uses the view rows for accent-insensitive counts', async () => {
    const { client } = createClient({
      groups: [
        {
          amount: 2,
          archived: false,
          created_at: null,
          ending_date: null,
          id: 'group-1',
          is_guest: false,
          name: 'Lớp Cô Tuyết',
          notes: null,
          sessions: null,
          starting_date: null,
          ws_id: 'ws-1',
        },
        {
          amount: 1,
          archived: false,
          created_at: null,
          ending_date: null,
          id: 'group-2',
          is_guest: false,
          name: 'Math',
          notes: null,
          sessions: null,
          starting_date: null,
          ws_id: 'ws-1',
        },
      ],
    });

    const count = await countUserGroupsForTable({
      accessibleGroupIds: null,
      client: client as never,
      groupIds: null,
      q: 'tuyet',
      status: 'active',
      wsId: 'ws-1',
    });

    expect(count).toBe(1);
  });
});
