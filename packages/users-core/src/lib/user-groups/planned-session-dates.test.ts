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

type CalendarCase = {
  date: string;
  startsAt: string;
  endsAt: string;
  startTime: string;
  endTime: string;
  seriesTimezone: string;
  workspaceTimezone: string;
  billingDate: string;
};
const calendarCases: CalendarCase[] = [
  {
    date: '2026-09-30',
    startsAt: '2026-09-30T23:30:00.000Z',
    endsAt: '2026-10-01T00:30:00.000Z',
    startTime: '23:30:00',
    endTime: '00:30:00',
    seriesTimezone: 'UTC',
    workspaceTimezone: 'Asia/Ho_Chi_Minh',
    billingDate: '2026-10-01',
  },
  {
    date: '2026-12-31',
    startsAt: '2027-01-01T02:00:00.000Z',
    endsAt: '2027-01-01T03:00:00.000Z',
    startTime: '18:00:00',
    endTime: '19:00:00',
    seriesTimezone: 'America/Los_Angeles',
    workspaceTimezone: 'Asia/Ho_Chi_Minh',
    billingDate: '2027-01-01',
  },
  {
    date: '2026-03-08',
    startsAt: '2026-03-08T06:30:00.000Z',
    endsAt: '2026-03-08T07:30:00.000Z',
    startTime: '01:30:00',
    endTime: '03:30:00',
    seriesTimezone: 'America/New_York',
    workspaceTimezone: 'America/Los_Angeles',
    billingDate: '2026-03-07',
  },
];
function calendarFixture(
  value: CalendarCase,
  state: 'projected' | 'materialized' | 'cancelled',
  extraStartsAt?: string
) {
  const instance = {
    end_timezone: value.seriesTimezone,
    ends_at: value.endsAt,
    group_id: groupId,
    id: '00000000-0000-4000-8000-000000000211',
    recurrence_instance_date: value.date,
    series_id: seriesId,
    start_timezone: value.seriesTimezone,
    starts_at: value.startsAt,
    title: null,
  };
  const extra = extraStartsAt
    ? [
        {
          ...instance,
          id: '00000000-0000-4000-8000-000000000212',
          series_id: null,
          recurrence_instance_date: null,
          starts_at: extraStartsAt,
        },
      ]
    : [];
  const scheduled = [...(state === 'materialized' ? [instance] : []), ...extra];
  let sessionReads = 0;
  const privateDb = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_user_group_session_series')
        return query([
          {
            days_of_week: [new Date(`${value.date}T12:00:00Z`).getUTCDay()],
            description: null,
            description_json: null,
            end_time: value.endTime,
            end_timezone: value.seriesTimezone,
            group_id: groupId,
            id: seriesId,
            interval_weeks: 1,
            source: null,
            start_date: value.date,
            start_time: value.startTime,
            start_timezone: value.seriesTimezone,
            title: null,
            until_date: value.date,
            ws_id: wsId,
          },
        ]);
      if (table !== 'workspace_user_group_sessions')
        throw new Error(`Unexpected table ${table}`);
      sessionReads += 1;
      // The real helper first reads materialized dates, then recurrence identity,
      // then scheduled reconciliation candidates. No write method is provided.
      return query(
        sessionReads === 2
          ? state === 'projected'
            ? []
            : [instance]
          : scheduled
      );
    }),
  };
  const supabase = {
    from: vi.fn((table: string) => {
      if (table !== 'workspace_user_groups')
        throw new Error(`Unexpected table ${table}`);
      return query([{ id: groupId, name: 'Synthetic class' }]);
    }),
    schema: vi.fn(() => privateDb),
  };
  return { supabase, privateDb };
}
async function calendarDates(
  value: CalendarCase,
  state: 'projected' | 'materialized' | 'cancelled',
  extraStartsAt?: string
) {
  const fixture = calendarFixture(value, state, extraStartsAt);
  const dates = await listPlannedUserGroupSessionDatesByGroupIds({
    from: new Date(Date.parse(value.startsAt) - 86_400_000).toISOString(),
    groupIds: [groupId],
    supabase: fixture.supabase as never,
    timezone: value.workspaceTimezone,
    to: new Date(Date.parse(value.endsAt) + 86_400_000).toISOString(),
    wsId,
  });
  expect(fixture.privateDb.from).toHaveBeenCalledTimes(4);
  expect(fixture.supabase.from).toHaveBeenCalledWith('workspace_user_groups');
  return dates.get(groupId);
}
describe('invoice civil dates remain stable across materialization', () => {
  it.each(calendarCases)(
    'uses workspace date $billingDate for series date $date ($seriesTimezone)',
    async (value) => {
      const materialized = await calendarDates(value, 'materialized');
      expect(materialized).toEqual([value.billingDate]);
      expect(await calendarDates(value, 'projected')).toEqual(materialized);
    }
  );
  it('deduplicates projected and materialized classes on one workspace billing date', async () => {
    expect(
      await calendarDates(
        calendarCases[0]!,
        'projected',
        '2026-10-01T03:00:00.000Z'
      )
    ).toEqual(['2026-10-01']);
  });
  it.each(calendarCases)(
    'preserves cancelled series identity across timezone boundary $date',
    async (value) => {
      expect(await calendarDates(value, 'cancelled')).toEqual([]);
    }
  );
});
