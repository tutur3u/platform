import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import '@tuturuuu/users-core/lib/dayjs-setup';
import {
  buildQuickWeeklySchedulePayloads,
  buildQuickWeeklySchedulePreview,
  createQuickWeeklyScheduleDraft,
  isQuickWeeklyScheduleDraftValid,
} from './quick-weekly-schedule-utils';
import { DEFAULT_SCHEDULE_TIMEZONE } from './session-time-utils';

describe('quick weekly schedule setup helpers', () => {
  it('requires explicit weekdays and defaults the remaining schedule fields', () => {
    const draft = createQuickWeeklyScheduleDraft(
      dayjs.tz(
        '2026-06-19 09:00',
        'YYYY-MM-DD HH:mm',
        DEFAULT_SCHEDULE_TIMEZONE
      )
    );

    expect(draft).toMatchObject({
      endMode: 'date',
      intervalWeeks: 1,
      patterns: [
        {
          daysOfWeek: [],
          endTime: '20:30',
          id: 'timeframe-1',
          startTime: '19:00',
        },
      ],
      startDate: '2026-06-19',
      timezone: 'Asia/Ho_Chi_Minh',
      untilDate: '2027-06-19',
    });
  });

  it('previews first generated dates and the UTC/GMT offset', () => {
    const draft = createQuickWeeklyScheduleDraft(
      dayjs.tz(
        '2026-06-19 09:00',
        'YYYY-MM-DD HH:mm',
        DEFAULT_SCHEDULE_TIMEZONE
      )
    );
    draft.patterns[0]!.daysOfWeek = [2, 4, 6];

    const preview = buildQuickWeeklySchedulePreview(draft, 'en');

    expect(preview.count).toBe(157);
    expect(preview.offsetLabel).toBe('UTC/GMT +07:00');
    expect(preview.firstDates.map((date) => date.startsAt)).toEqual([
      '2026-06-20T12:00:00.000Z',
      '2026-06-23T12:00:00.000Z',
      '2026-06-25T12:00:00.000Z',
      '2026-06-27T12:00:00.000Z',
      '2026-06-30T12:00:00.000Z',
      '2026-07-02T12:00:00.000Z',
    ]);
  });

  it('builds the recurring session creation payload', () => {
    const draft = createQuickWeeklyScheduleDraft(
      dayjs.tz(
        '2026-06-19 09:00',
        'YYYY-MM-DD HH:mm',
        DEFAULT_SCHEDULE_TIMEZONE
      )
    );
    draft.patterns[0]!.daysOfWeek = [2, 4, 6];

    expect(
      buildQuickWeeklySchedulePayloads({
        draft,
        groupId: '00000000-0000-4000-8000-000000000101',
        groupName: 'Math A1',
      })
    ).toEqual([
      {
        endTimezone: 'Asia/Ho_Chi_Minh',
        endsAt: '2026-06-19T13:30:00.000Z',
        groupId: '00000000-0000-4000-8000-000000000101',
        recurrence: {
          daysOfWeek: [2, 4, 6],
          intervalWeeks: 1,
          untilDate: '2027-06-19',
        },
        startTimezone: 'Asia/Ho_Chi_Minh',
        startsAt: '2026-06-19T12:00:00.000Z',
        title: 'Math A1',
      },
    ]);
  });

  it('supports separate weekday timeframes that repeat forever', () => {
    const draft = createQuickWeeklyScheduleDraft(
      dayjs.tz(
        '2026-06-19 09:00',
        'YYYY-MM-DD HH:mm',
        DEFAULT_SCHEDULE_TIMEZONE
      )
    );
    draft.endMode = 'never';
    draft.patterns = [
      {
        daysOfWeek: [6],
        endTime: '20:30',
        id: 'timeframe-1',
        startTime: '19:00',
      },
      {
        daysOfWeek: [0],
        endTime: '09:30',
        id: 'timeframe-2',
        startTime: '08:00',
      },
    ];

    expect(isQuickWeeklyScheduleDraftValid(draft)).toBe(true);
    const preview = buildQuickWeeklySchedulePreview(draft, 'en');
    expect(preview.count).toBeNull();
    expect(preview.firstDates.map((date) => date.startsAt)).toEqual([
      '2026-06-20T12:00:00.000Z',
      '2026-06-21T01:00:00.000Z',
      '2026-06-27T12:00:00.000Z',
      '2026-06-28T01:00:00.000Z',
      '2026-07-04T12:00:00.000Z',
      '2026-07-05T01:00:00.000Z',
    ]);
    expect(
      buildQuickWeeklySchedulePayloads({
        draft,
        groupId: '00000000-0000-4000-8000-000000000101',
        groupName: 'Math A1',
      }).map((payload) => payload.recurrence)
    ).toEqual([
      { daysOfWeek: [6], intervalWeeks: 1, untilDate: null },
      { daysOfWeek: [0], intervalWeeks: 1, untilDate: null },
    ]);
  });
});
