import type { WorkspaceUserGroupTableRow } from '@tuturuuu/types/db';
import { describe, expect, it, vi } from 'vitest';
import {
  countUserGroupsForTable,
  listUserGroupsForTable,
} from './table-repository';

vi.mock('server-only', () => ({}));

type RpcCall = {
  args: Record<string, unknown>;
  fn: string;
};

function createGroup(
  overrides: Partial<WorkspaceUserGroupTableRow> = {}
): WorkspaceUserGroupTableRow {
  return {
    amount: 3,
    archived: false,
    created_at: '2026-05-01T00:00:00+00:00',
    ending_date: null,
    has_session_today: false,
    id: 'group-1',
    is_guest: false,
    name: 'Lop Co Tuyet',
    notes: null,
    sessions: ['2026-05-20'],
    starting_date: null,
    ws_id: 'ws-1',
    ...overrides,
  };
}

function createClient({
  count = 0,
  listRows = [],
}: {
  count?: number;
  listRows?: WorkspaceUserGroupTableRow[];
} = {}) {
  const rpcCalls: RpcCall[] = [];
  const from = vi.fn();

  const rpc = vi.fn((fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ args, fn });

    if (fn === 'list_workspace_user_groups_for_table') {
      return Promise.resolve({ data: listRows, error: null });
    }

    if (fn === 'count_workspace_user_groups_for_table') {
      return Promise.resolve({ data: count, error: null });
    }

    return Promise.resolve({
      data: null,
      error: new Error(`Unexpected RPC: ${fn}`),
    });
  });

  const schema = vi.fn((schemaName: string) => {
    expect(schemaName).toBe('private');
    return { rpc };
  });

  return {
    client: { from, schema },
    from,
    rpc,
    rpcCalls,
    schema,
  };
}

describe('user groups table repository', () => {
  it('lists through the private table RPC with bounded pagination', async () => {
    const row = createGroup();
    const { client, from, rpcCalls } = createClient({ listRows: [row] });

    const groups = await listUserGroupsForTable({
      accessibleGroupIds: ['group-1', 'group-2'],
      client: client as never,
      groupIds: null,
      page: 3,
      pageSize: 20,
      q: 'tuyet',
      status: 'active',
      wsId: 'ws-1',
    });

    expect(groups).toEqual([row]);
    expect(from).not.toHaveBeenCalled();
    expect(rpcCalls).toEqual([
      {
        args: {
          p_group_ids: ['group-1', 'group-2'],
          p_limit: 20,
          p_offset: 40,
          p_search: 'tuyet',
          p_status: 'active',
          p_ws_id: 'ws-1',
        },
        fn: 'list_workspace_user_groups_for_table',
      },
    ]);
  });

  it('clamps invalid pagination before calling the private list RPC', async () => {
    const { client, rpcCalls } = createClient();

    await listUserGroupsForTable({
      accessibleGroupIds: null,
      client: client as never,
      groupIds: null,
      page: 0,
      pageSize: 999,
      q: '   ',
      status: 'all',
      wsId: 'ws-1',
    });

    expect(rpcCalls).toEqual([
      {
        args: {
          p_limit: 200,
          p_offset: 0,
          p_status: 'all',
          p_ws_id: 'ws-1',
        },
        fn: 'list_workspace_user_groups_for_table',
      },
    ]);
  });

  it('intersects requested and accessible group filters before querying', async () => {
    const { client, rpcCalls } = createClient();

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

    expect(rpcCalls[0]?.args).toMatchObject({
      p_group_ids: ['group-1'],
    });
  });

  it('skips the private RPC when group filters have no allowed intersection', async () => {
    const { client, rpc } = createClient();

    const groups = await listUserGroupsForTable({
      accessibleGroupIds: ['group-3'],
      client: client as never,
      groupIds: ['group-1', 'group-2'],
      page: 1,
      pageSize: 10,
      q: undefined,
      status: 'active',
      wsId: 'ws-1',
    });
    const count = await countUserGroupsForTable({
      accessibleGroupIds: ['group-3'],
      client: client as never,
      groupIds: ['group-1', 'group-2'],
      q: undefined,
      status: 'active',
      wsId: 'ws-1',
    });

    expect(groups).toEqual([]);
    expect(count).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('counts through the private count RPC without fetching group rows', async () => {
    const { client, from, rpcCalls } = createClient({ count: 7 });

    const count = await countUserGroupsForTable({
      accessibleGroupIds: null,
      client: client as never,
      groupIds: ['group-1'],
      q: 'tuyet',
      status: 'archived',
      wsId: 'ws-1',
    });

    expect(count).toBe(7);
    expect(from).not.toHaveBeenCalled();
    expect(rpcCalls).toEqual([
      {
        args: {
          p_group_ids: ['group-1'],
          p_search: 'tuyet',
          p_status: 'archived',
          p_ws_id: 'ws-1',
        },
        fn: 'count_workspace_user_groups_for_table',
      },
    ]);
  });
});
