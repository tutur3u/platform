import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { describe, expect, it } from 'vitest';
import type { MiraToolContext } from '../../mira-tools';
import {
  executeGetTimeTrackingSession,
  executeListTimeTrackingSessions,
} from './timer-sessions-executor';

type QueryState = {
  filters: Array<[string, string, unknown]>;
};

class TimeTrackingSessionsSupabaseMock {
  public readonly states: QueryState[] = [];

  from(table: string) {
    const state: QueryState = { filters: [] };
    this.states.push(state);

    const respond = async () => {
      if (table !== 'time_tracking_sessions') {
        return { data: null, error: null };
      }

      return {
        data: [
          {
            id: 'session-1',
            title: 'Deep work',
            start_time: '2026-03-13T08:00:00.000Z',
            end_time: '2026-03-13T09:00:00.000Z',
            duration_seconds: 3600,
            is_running: false,
            pending_approval: false,
          },
        ],
        error: null,
      };
    };

    const makeBuilder = () =>
      Object.assign(
        Promise.resolve().then(() => respond()),
        {
          select: () => makeBuilder(),
          order: () => makeBuilder(),
          limit: () => makeBuilder(),
          eq: (column: string, value: unknown) => {
            state.filters.push(['eq', column, value]);
            return makeBuilder();
          },
          maybeSingle: async () => {
            const result = await respond();
            return {
              data: Array.isArray(result.data)
                ? (result.data[0] ?? null)
                : null,
              error: result.error,
            };
          },
        }
      );

    return makeBuilder();
  }
}

function createCtx(
  supabase: TypedSupabaseClient,
  workspaceContextWsId = 'workspace-2'
): MiraToolContext {
  return {
    wsId: 'workspace-1',
    userId: 'user-1',
    supabase,
    timezone: 'UTC',
    workspaceContext: {
      workspaceContextId: workspaceContextWsId,
      wsId: workspaceContextWsId,
      name: 'Workspace Two',
      personal: false,
      memberCount: 3,
    },
  };
}

describe('timer session executor workspace context', () => {
  it('lists sessions from the current workspace context instead of the base wsId', async () => {
    const supabase =
      new TimeTrackingSessionsSupabaseMock() as unknown as TypedSupabaseClient;
    const ctx = createCtx(supabase);

    const result = await executeListTimeTrackingSessions({}, ctx);

    expect(result).toMatchObject({
      success: true,
      count: 1,
    });
    expect(
      (supabase as unknown as TimeTrackingSessionsSupabaseMock).states[0]
        ?.filters
    ).toContainEqual(['eq', 'ws_id', 'workspace-2']);
  });

  it('loads a single session from the current workspace context', async () => {
    const supabase =
      new TimeTrackingSessionsSupabaseMock() as unknown as TypedSupabaseClient;
    const ctx = createCtx(supabase);

    const result = await executeGetTimeTrackingSession(
      { sessionId: 'session-1' },
      ctx
    );

    expect(result).toMatchObject({
      success: true,
      session: { id: 'session-1' },
    });
    expect(
      (supabase as unknown as TimeTrackingSessionsSupabaseMock).states[0]
        ?.filters
    ).toContainEqual(['eq', 'ws_id', 'workspace-2']);
  });
});
