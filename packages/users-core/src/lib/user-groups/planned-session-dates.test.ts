import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { listPlannedUserGroupSessionDatesByGroupIds } from './planned-session-dates';

const groupId = '00000000-0000-4000-8000-000000000101';
const wsId = '00000000-0000-4000-8000-000000000001';
const seriesId = '00000000-0000-4000-8000-000000000301';

function query(data: unknown) {
  const result = Promise.resolve({ data, error: null });
  const builder = {
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    in: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    order: vi.fn(() => builder),
    select: vi.fn(() => builder),
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are thenable.
    then: result.then.bind(result),
  };
  return builder;
}

describe('planned group session dates', () => {
  it('projects unmaterialized recurring classes, excludes canceled dates, and never writes', async () => {
    const cancelled = {
      end_timezone: 'Asia/Ho_Chi_Minh',
      ends_at: '2026-09-06T10:00:00.000Z',
      group_id: groupId,
      id: '00000000-0000-4000-8000-000000000201',
      recurrence_instance_date: '2026-09-06',
      series_id: seriesId,
      start_timezone: 'Asia/Ho_Chi_Minh',
      starts_at: '2026-09-06T09:00:00.000Z',
      title: null,
    };
    const detached = {
      ...cancelled,
      ends_at: '2026-09-12T10:00:00.000Z',
      id: '00000000-0000-4000-8000-000000000202',
      recurrence_instance_date: null,
      series_id: null,
      starts_at: '2026-09-12T09:00:00.000Z',
    };
    let sessionReads = 0;
    const privateDb = {
      from: vi.fn((table: string) => {
        if (table === 'workspace_user_group_session_series') {
          return query([
            {
              days_of_week: [0, 6],
              description: null,
              description_json: null,
              end_time: '17:00:00',
              end_timezone: 'Asia/Ho_Chi_Minh',
              group_id: groupId,
              id: seriesId,
              interval_weeks: 1,
              source: null,
              start_date: '2026-09-01',
              start_time: '16:00:00',
              start_timezone: 'Asia/Ho_Chi_Minh',
              title: null,
              until_date: null,
              ws_id: wsId,
            },
          ]);
        }
        if (table === 'workspace_user_group_sessions') {
          sessionReads += 1;
          return query(
            sessionReads === 2
              ? [cancelled]
              : [1, 3].includes(sessionReads)
                ? [detached]
                : []
          );
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };
    const supabase = {
      from: vi.fn(() => query([{ id: groupId, name: 'Class 7' }])),
      schema: vi.fn(() => privateDb),
    };

    const dates = await listPlannedUserGroupSessionDatesByGroupIds({
      from: '2026-08-31T00:00:00.000Z',
      groupIds: [groupId],
      supabase: supabase as never,
      timezone: 'Asia/Ho_Chi_Minh',
      to: '2026-10-02T00:00:00.000Z',
      wsId,
    });

    expect(dates.get(groupId)).toEqual([
      '2026-09-05',
      '2026-09-12',
      '2026-09-13',
      '2026-09-19',
      '2026-09-20',
      '2026-09-26',
      '2026-09-27',
    ]);
    expect(privateDb.from).toHaveBeenCalledTimes(4);
  });
});
