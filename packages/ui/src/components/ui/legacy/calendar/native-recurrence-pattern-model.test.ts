import type { NativeCalendarSeries } from '@tuturuuu/internal-api/calendar-series';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type { CalendarRecurrenceRule } from '@tuturuuu/types/primitives/calendar-recurrence';
import {
  toGoogleCalendarRecurrence,
  toGraphCalendarRecurrence,
} from '@tuturuuu/utils/calendar-recurrence-providers';
import { describe, expect, it } from 'vitest';
import {
  recurrenceDraftPayload,
  recurrenceEditDraft,
  recurrenceMutation,
} from './native-recurrence-model';

const event: CalendarEvent = {
  id: 'slot',
  seriesId: 'series',
  originalStartLocal: '2026-03-27T09:00:00',
  start_at: '2026-03-27T13:00:00Z',
  end_at: '2026-03-27T14:00:00Z',
  title: 'Monthly review',
};
function series(
  rule: Partial<CalendarRecurrenceRule>,
  day = '27'
): NativeCalendarSeries {
  return {
    id: 'series',
    ws_id: 'ws',
    revision: 3,
    workspace_calendar_id: null,
    rule: {
      version: 1,
      frequency: 'monthly',
      interval: 1,
      timeZone: 'America/New_York',
      weekdays: ['FR'],
      weekIndex: -1,
      end: { type: 'count', count: 8 },
      ...rule,
    },
    anchor: {
      startLocal: `2026-03-${day}T09:00:00`,
      endLocal: `2026-03-${day}T10:00:00`,
      allDay: false,
    },
    payload: { title: 'Monthly review' },
    exceptions: [],
  };
}
describe('editable relative recurrence provider parity', () => {
  it.each([
    { index: 1, day: '06' },
    { index: 2, day: '13' },
    { index: 3, day: '20' },
    { index: 4, day: '27' },
    { index: -1, day: '27' },
  ] as const)(
    'retains ordinal $index through details edits and provider serialization',
    ({ index, day }) => {
      for (const frequency of ['monthly', 'yearly'] as const) {
        const original = series(
          {
            frequency,
            weekIndex: index,
            ...(frequency === 'yearly' ? { month: 3 } : {}),
          },
          day
        );
        const draft = recurrenceEditDraft(original, event, 'all');
        expect(draft.retainedRule).toBeUndefined();
        expect(draft.monthPattern).toBe('weekday');
        const payload = recurrenceDraftPayload({
          ...draft,
          title: 'Updated title',
        });
        expect(payload.rule).toEqual(original.rule);
        expect(toGraphCalendarRecurrence(payload.rule, payload.anchor)).toEqual(
          toGraphCalendarRecurrence(original.rule, original.anchor)
        );
        expect(
          toGoogleCalendarRecurrence(payload.rule, payload.anchor)
        ).toEqual(toGoogleCalendarRecurrence(original.rule, original.anchor));
      }
    }
  );
  it('retains multi-weekday earliest-slot semantics and inclusive until dates', () => {
    const original = series(
      {
        weekdays: ['TH', 'FR'],
        weekIndex: 1,
        end: { type: 'until', date: '2026-12-31' },
      },
      '05'
    );
    const payload = recurrenceDraftPayload(
      recurrenceEditDraft(original, event, 'all')
    );
    expect(payload.rule).toEqual(original.rule);
    expect(
      toGraphCalendarRecurrence(payload.rule, payload.anchor).pattern.daysOfWeek
    ).toEqual(['thursday', 'friday']);
    expect(toGoogleCalendarRecurrence(payload.rule, payload.anchor)).toEqual(
      toGoogleCalendarRecurrence(original.rule, original.anchor)
    );
  });
  it('preserves Sunday week boundaries on biweekly imported series', () => {
    const original = series({
      frequency: 'weekly',
      interval: 2,
      weekIndex: undefined,
      weekdays: ['FR'],
      weekStartsOn: 'SU',
    });
    const payload = recurrenceDraftPayload(
      recurrenceEditDraft(original, event, 'all')
    );
    expect(payload.rule.weekStartsOn).toBe('SU');
    expect(
      toGraphCalendarRecurrence(payload.rule, payload.anchor).pattern
        .firstDayOfWeek
    ).toBe('sunday');
  });
  it('preserves explicit month-end clamping while editing details', () => {
    const original = series(
      {
        weekIndex: undefined,
        weekdays: undefined,
        monthDay: 31,
        monthDayOverflow: 'last-day',
      },
      '31'
    );
    const payload = recurrenceDraftPayload(
      recurrenceEditDraft(original, event, 'all')
    );
    expect(payload.rule).toEqual(original.rule);
    expect(
      toGraphCalendarRecurrence(payload.rule, payload.anchor).pattern.dayOfMonth
    ).toBe(31);
  });
  it('does not add optional normalization that could reset existing exceptions', () => {
    const original = series({
      weekIndex: undefined,
      weekdays: undefined,
      monthDay: 27,
    });
    expect(
      recurrenceDraftPayload(recurrenceEditDraft(original, event, 'all')).rule
    ).toEqual(original.rule);
  });
  it.each(['0', '5', 'invalid'])('rejects invalid ordinal %s', (weekIndex) => {
    expect(() =>
      recurrenceDraftPayload({
        ...recurrenceEditDraft(series({}), event, 'all'),
        weekIndex,
      })
    ).toThrow();
  });
  it('rejects empty weekdays, invalid yearly months and mismatched anchors', () => {
    const draft = recurrenceEditDraft(series({}), event, 'all');
    expect(() => recurrenceDraftPayload({ ...draft, weekdays: [] })).toThrow();
    for (const month of ['0', '13'])
      expect(() =>
        recurrenceDraftPayload({ ...draft, frequency: 'yearly', month })
      ).toThrow();
    expect(() =>
      recurrenceDraftPayload({ ...draft, weekIndex: '1' })
    ).toThrow();
  });
  it('keeps occurrence edits independent of the series pattern', () => {
    const original = series({});
    const draft = recurrenceEditDraft(original, event, 'this');
    expect(
      recurrenceMutation(
        { ...draft, weekIndex: 'invalid', month: '0' },
        original,
        event,
        'this',
        'request',
        'update'
      ).rule
    ).toBeUndefined();
  });
  it('uses the remaining count for a future relative split', () => {
    const original = series({});
    const later = {
      ...event,
      originalStartLocal: '2026-04-24T09:00:00',
      start_at: '2026-04-24T13:00:00Z',
      end_at: '2026-04-24T14:00:00Z',
    };
    const payload = recurrenceMutation(
      recurrenceEditDraft(original, later, 'future'),
      original,
      later,
      'future',
      'request',
      'update'
    );
    expect(payload.rule?.end).toEqual({ type: 'count', count: 7 });
    expect(payload.rule?.weekIndex).toBe(-1);
    expect(payload.originalStartLocal).toBe(later.originalStartLocal);
  });
});
