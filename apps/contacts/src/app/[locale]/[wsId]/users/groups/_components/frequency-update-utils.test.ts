import type { WorkspaceUserGroupSession } from '@tuturuuu/internal-api';
import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import '@tuturuuu/users-core/lib/dayjs-setup';
import {
  buildFrequencySeriesOptions,
  buildFrequencyUpdatePayload,
  buildFrequencyUpdatePreview,
  createFrequencyUpdateDraft,
  frequencyUpdateDraftHasChanges,
} from './frequency-update-utils';

function session(
  id: string,
  date: string,
  daysOfWeek = [1, 3, 6]
): WorkspaceUserGroupSession {
  return {
    description: null,
    descriptionJson: null,
    endTimezone: 'Asia/Ho_Chi_Minh',
    endsAt: dayjs
      .tz(`${date} 20:00`, 'YYYY-MM-DD HH:mm', 'Asia/Ho_Chi_Minh')
      .toISOString(),
    files: [],
    groupId: '00000000-0000-4000-8000-000000000101',
    groupName: 'Math A1',
    id,
    recurrence: {
      daysOfWeek,
      intervalWeeks: 1,
      startDate: '2026-08-17',
      untilDate: '2026-08-23',
    },
    recurrenceInstanceDate: date,
    seriesId: '00000000-0000-4000-8000-000000000201',
    source: 'admin',
    startTimezone: 'Asia/Ho_Chi_Minh',
    startsAt: dayjs
      .tz(`${date} 19:00`, 'YYYY-MM-DD HH:mm', 'Asia/Ho_Chi_Minh')
      .toISOString(),
    status: 'scheduled',
    tags: [],
    title: 'Math A1',
  };
}

describe('frequency update helpers', () => {
  it('previews every removed, retained, and added future date', () => {
    const [option] = buildFrequencySeriesOptions(
      [
        session('monday', '2026-08-17'),
        session('wednesday', '2026-08-19'),
        session('saturday', '2026-08-22'),
      ],
      dayjs('2026-08-16T00:00:00.000Z')
    );

    const draft = createFrequencyUpdateDraft(option!);
    const preview = buildFrequencyUpdatePreview(
      option!,
      { ...draft, daysOfWeek: [0, 6] },
      'en'
    );

    expect(preview.removed.map((entry) => entry.date)).toEqual([
      '2026-08-17',
      '2026-08-19',
    ]);
    expect(preview.kept.map((entry) => entry.date)).toEqual(['2026-08-22']);
    expect(preview.added.map((entry) => entry.date)).toEqual(['2026-08-23']);
    expect(preview.adjusted).toEqual([]);
  });

  it('builds a future-scoped recurrence update without changing history', () => {
    const [option] = buildFrequencySeriesOptions(
      [session('monday', '2026-08-17')],
      dayjs('2026-08-16T00:00:00.000Z')
    );

    expect(
      buildFrequencyUpdatePayload({
        ...createFrequencyUpdateDraft(option!),
        daysOfWeek: [0, 6],
        intervalWeeks: 2,
      })
    ).toEqual({
      recurrence: {
        daysOfWeek: [0, 6],
        intervalWeeks: 2,
        untilDate: '2026-08-23',
      },
      scope: 'future',
    });
  });

  it('can switch an existing recurrence to repeat forever', () => {
    const [option] = buildFrequencySeriesOptions(
      [session('monday', '2026-08-17')],
      dayjs('2026-08-16T00:00:00.000Z')
    );

    const draft = {
      ...createFrequencyUpdateDraft(option!),
      endMode: 'never' as const,
    };
    expect(frequencyUpdateDraftHasChanges(draft, option!)).toBe(true);
    expect(buildFrequencyUpdatePayload(draft).recurrence?.untilDate).toBeNull();
  });
});
