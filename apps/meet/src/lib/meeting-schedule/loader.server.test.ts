import { describe, expect, it, vi } from 'vitest';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { getPermissions } from '@tuturuuu/utils/workspace-helper';
vi.mock('@tanstack/react-start/server-only', () => ({}));
import { loadMeetingSchedule } from './loader.server';

type Reply = { data: unknown; error: unknown };
function fixture(calendarAccess: boolean, calendarError = false) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const from = vi.fn((table: string) => {
    const replies: Record<string, Reply> = {
      workspace_meetings: {
        data: [
          {
            id: 'fixture-meeting',
            name: 'Fixture',
            creator_id: 'fixture-account',
            time: '2099-01-01T00:00:00Z',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
        error: null,
      },
      workspace_calendar_events: {
        data: [
          {
            id: 'fixture-event',
            start_at: '2099-01-01T00:00:00Z',
            end_at: '2099-01-01T01:00:00Z',
            created_at: '2026-01-01T00:00:00Z',
            scheduling_metadata: {
              type: 'tuturuuu_meeting',
              meeting_id: 'fixture-meeting',
            },
          },
        ],
        error: calendarError ? new Error('Fixture Calendar outage') : null,
      },
      user_workspace_configs: { data: { value: 'expanded' }, error: null },
      user_private_details: { data: { timezone: 'UTC' }, error: null },
    };
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'order', 'ilike']) {
      query[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        return query;
      };
    }
    query.range = query.maybeSingle = async () => replies[table];
    return query;
  });
  return {
    calls,
    from,
    options: {
      supabase: { from } as unknown as TypedSupabaseClient,
      wsId: 'fixture-workspace',
      userId: 'fixture-account',
      search: '  Fixture  ',
      permissions: {
        withoutPermission: (permission: string) =>
          permission !== 'manage_calendar' || !calendarAccess,
      } as unknown as Awaited<ReturnType<typeof getPermissions>>,
    },
  };
}

describe('schedule read boundary', () => {
  it('retains future meetings without reading forbidden Calendar data', async () => {
    const f = fixture(false);
    const result = await loadMeetingSchedule(f.options);
    expect(result.upcoming).toHaveLength(1);
    expect(result.upcoming[0]?.calendar).toBeNull();
    expect(result.calendarAccess).toEqual({ status: 'forbidden' });
    expect(f.from).not.toHaveBeenCalledWith('workspace_calendar_events');
    expect(result.currentSource).toBe('unavailable');
    expect(result.current).toEqual([]);
    expect(f.calls).toContainEqual({
      table: 'workspace_meetings',
      method: 'ilike',
      args: ['name', '%Fixture%'],
    });
  });

  it('joins Calendar only inside the authorized workspace and metadata type', async () => {
    const f = fixture(true);
    const result = await loadMeetingSchedule(f.options);
    expect(result.upcoming[0]?.calendar?.id).toBe('fixture-event');
    for (const table of [
      'workspace_meetings',
      'workspace_calendar_events',
      'user_workspace_configs',
    ]) {
      expect(f.calls).toContainEqual({
        table,
        method: 'eq',
        args: ['ws_id', 'fixture-workspace'],
      });
    }
    expect(f.calls).toContainEqual({
      table: 'workspace_calendar_events',
      method: 'eq',
      args: ['scheduling_metadata->>type', 'tuturuuu_meeting'],
    });
    expect(f.calls).toContainEqual({
      table: 'user_workspace_configs',
      method: 'eq',
      args: ['user_id', 'fixture-account'],
    });
    expect(result.pastPreference.choice).toBe('expanded');
    expect(result.viewerTimezone).toEqual({
      source: 'user-profile',
      timeZone: 'UTC',
    });
  });

  it('preserves the meeting list during Calendar failure', async () => {
    const f = fixture(true, true);
    const result = await loadMeetingSchedule(f.options);
    expect(result.calendarAccess).toEqual({ status: 'unavailable' });
    expect(result.upcoming).toHaveLength(1);
    expect(result.upcoming[0]?.calendar).toBeNull();
  });
});
