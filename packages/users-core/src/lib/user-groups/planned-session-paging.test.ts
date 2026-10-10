import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { listPlannedUserGroupSessionDatesByGroupIds } from './planned-session-dates';
import {
  cappedSessionDatabase,
  type PagingRow,
} from './planned-session-paging-fixture';
import { INCOMPLETE_SESSION_READ } from './session-complete-read';

const wsId = 'synthetic-workspace';
const groupId = 'synthetic-group';
const day = (n: number) => `2030-09-${String(n).padStart(2, '0')}`;
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const row = (
  id: number,
  date: string,
  seriesId: string | null = null
): PagingRow => ({
  id: uuid(id),
  ws_id: wsId,
  group_id: groupId,
  starts_at: `${date}T08:00:00.000Z`,
  ends_at: `${date}T09:00:00.000Z`,
  start_timezone: 'UTC',
  end_timezone: 'UTC',
  status: 'scheduled',
  title: null,
  series_id: seriesId,
  recurrence_instance_date: seriesId ? date : null,
});
const project = (db: ReturnType<typeof cappedSessionDatabase>) =>
  listPlannedUserGroupSessionDatesByGroupIds({
    from: '2030-09-01T00:00:00.000Z',
    to: '2030-09-30T23:59:59.999Z',
    timezone: 'UTC',
    wsId,
    groupIds: [groupId],
    supabase: db.supabase as never,
  });

describe('actual planned billing preview under PostgREST max_rows', () => {
  it('does not resurrect canceled tail occurrences beyond a capped recurrence page', async () => {
    const series: PagingRow[] = Array.from({ length: 40 }, (_, n) => ({
      id: uuid(20000 + n),
      ws_id: wsId,
      group_id: groupId,
      days_of_week: [0, 1, 2, 3, 4, 5, 6],
      interval_weeks: 1,
      start_date: day(1),
      until_date: day(30),
      start_time: '08:00:00',
      end_time: '09:00:00',
      start_timezone: 'UTC',
      end_timezone: 'UTC',
      title: null,
      description: null,
      description_json: null,
      source: null,
    }));
    // 40 tied starts each day; first 1000 rows cover only the first 25 days.
    const sessions = Array.from({ length: 30 }, (_, d) =>
      series.map((s, n) => ({
        ...row(d * 40 + n, day(d + 1), String(s.id)),
        status: d < 25 ? 'scheduled' : 'cancelled',
      }))
    ).flat();
    const db = cappedSessionDatabase({
      workspace_user_group_sessions: sessions,
      workspace_user_group_session_series: series,
      workspace_user_groups: [
        { id: groupId, ws_id: wsId, name: 'Synthetic class', archived: false },
      ],
    });
    const result = await project(db);
    expect(db.reads.some((read) => read.total === 1200)).toBe(true);
    expect(result.get(groupId)).toEqual(
      Array.from({ length: 25 }, (_, d) => day(d + 1))
    );
    expect(db.writes).not.toHaveBeenCalled();
  });
  it('includes a materialized date after 1000 equal-start rows instead of publishing partial authority', async () => {
    const sessions = Array.from({ length: 1000 }, (_, n) => row(n, day(1)));
    sessions.push(row(1000, day(2)));
    const db = cappedSessionDatabase({
      workspace_user_group_sessions: sessions,
    });
    expect((await project(db)).get(groupId)).toEqual([day(1), day(2)]);
    expect(db.writes).not.toHaveBeenCalled();
  });
  it('retains tenant, group and instant period authority and never mutates schedule', async () => {
    const db = cappedSessionDatabase({
      workspace_user_group_sessions: [
        row(0, day(1)),
        { ...row(1, day(2)), ws_id: 'other-workspace' },
        { ...row(2, day(3)), group_id: 'other-group' },
        row(3, '2030-10-01'),
        { ...row(4, day(4)), status: 'cancelled' },
      ],
    });
    expect((await project(db)).get(groupId)).toEqual([day(1)]);
    expect(db.writes).not.toHaveBeenCalled();
  });
  it('returns explicit empty authority for an empty bounded period', async () => {
    const db = cappedSessionDatabase({});
    expect((await project(db)).get(groupId)).toEqual([]);
    expect(db.writes).not.toHaveBeenCalled();
  });
  it('propagates a database read failure rather than returning authoritative dates', async () => {
    const db = cappedSessionDatabase({}, true);
    await expect(project(db)).rejects.toThrow(INCOMPLETE_SESSION_READ);
    expect(db.writes).not.toHaveBeenCalled();
  });
  for (const [label, options] of [
    ['lower deployed cap', { cap: 100 }],
    ['late page error', { lateError: true }],
    ['missing count', { missingCount: true }],
    ['changed count', { countDrift: true }],
    ['duplicate IDs', { duplicate: true }],
    ['non-advancing ordered IDs', { reverse: true }],
    ['negative exact count', { countOverride: -1 }],
    ['fractional exact count', { countOverride: 1.5 }],
  ] as const) {
    it(`fails closed without partial authority for ${label}`, async () => {
      const db = cappedSessionDatabase(
        {
          workspace_user_group_sessions: Array.from({ length: 501 }, (_, n) =>
            row(n, day(1))
          ),
        },
        false,
        options
      );
      await expect(project(db)).rejects.toThrow(INCOMPLETE_SESSION_READ);
      expect(db.writes).not.toHaveBeenCalled();
    });
  }
  it('fails closed before paging beyond its finite row budget', async () => {
    const db = cappedSessionDatabase({
      workspace_user_group_sessions: Array.from({ length: 10001 }, (_, n) =>
        row(n, day(1))
      ),
    });
    await expect(project(db)).rejects.toThrow(INCOMPLETE_SESSION_READ);
    expect(db.reads).toHaveLength(1);
    expect(db.writes).not.toHaveBeenCalled();
  });
});
