import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { describe, expect, it } from 'vitest';
import {
  listAccessibleWorkspaceSummaries,
  resolveWorkspaceContextState,
} from './workspace-context';

type QueryState = {
  table: string;
  filters: Array<[string, string, unknown]>;
};

class WorkspaceContextSupabaseMock {
  public readonly states: QueryState[] = [];

  from(table: string) {
    const state: QueryState = {
      table,
      filters: [],
    };
    this.states.push(state);

    const respond = async () => this.respond(state);

    const makeBuilder = () =>
      Object.assign(
        Promise.resolve().then(() => respond()),
        {
          select: () => makeBuilder(),
          eq: (column: string, value: unknown) => {
            state.filters.push(['eq', column, value]);
            return makeBuilder();
          },
          in: (column: string, value: unknown) => {
            state.filters.push(['in', column, value]);
            return makeBuilder();
          },
        }
      );

    return makeBuilder();
  }

  private async respond(state: QueryState) {
    if (state.table !== 'workspace_members') {
      return { data: null, error: null };
    }

    const userFilter = state.filters.find(
      ([method, column]) => method === 'eq' && column === 'user_id'
    );
    if (userFilter?.[2] === 'user-1') {
      return {
        data: [
          {
            ws_id: 'personal-ws',
            workspaces: {
              id: 'personal-ws',
              name: 'Personal',
              personal: true,
            },
          },
          {
            ws_id: 'team-ws',
            workspaces: {
              id: 'team-ws',
              name: 'Team Alpha',
              personal: false,
            },
          },
        ],
        error: null,
      };
    }

    const workspaceIdsFilter = state.filters.find(
      ([method, column]) => method === 'in' && column === 'ws_id'
    );
    if (
      Array.isArray(workspaceIdsFilter?.[2]) &&
      workspaceIdsFilter[2].includes('personal-ws') &&
      workspaceIdsFilter[2].includes('team-ws')
    ) {
      return {
        data: [
          { ws_id: 'personal-ws' },
          { ws_id: 'team-ws' },
          { ws_id: 'team-ws' },
        ],
        error: null,
      };
    }

    return { data: [], error: null };
  }
}

describe('workspace context security', () => {
  it('lists only accessible workspaces for the current user', async () => {
    const supabaseMock = new WorkspaceContextSupabaseMock();
    const supabase = supabaseMock as unknown as TypedSupabaseClient;

    await expect(
      listAccessibleWorkspaceSummaries(supabase, 'user-1')
    ).resolves.toEqual([
      {
        id: 'personal-ws',
        memberCount: 1,
        name: 'Personal',
        personal: true,
      },
      {
        id: 'team-ws',
        memberCount: 2,
        name: 'Team Alpha',
        personal: false,
      },
    ]);
    expect(supabaseMock.states[0]?.filters).toContainEqual([
      'eq',
      'user_id',
      'user-1',
    ]);
    expect(supabaseMock.states[1]?.filters).toContainEqual([
      'in',
      'ws_id',
      ['personal-ws', 'team-ws'],
    ]);
  });

  it('rejects inaccessible workspace context switches in strict mode', async () => {
    const supabaseMock = new WorkspaceContextSupabaseMock();
    const supabase = supabaseMock as unknown as TypedSupabaseClient;

    await expect(
      resolveWorkspaceContextState({
        supabase,
        userId: 'user-1',
        requestedWorkspaceContextId: 'outside-ws',
        fallbackWorkspaceId: 'team-ws',
        strict: true,
      })
    ).rejects.toThrow(
      'Workspace "outside-ws" is not accessible for this user.'
    );
    expect(supabaseMock.states[0]?.filters).toContainEqual([
      'eq',
      'user_id',
      'user-1',
    ]);
  });
});
