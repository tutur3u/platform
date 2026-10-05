import type { NativeCalendarSeries } from '@tuturuuu/internal-api/calendar-series';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { expandCalendarRecurrence } from '@tuturuuu/utils/calendar-recurrence';
import { describe, expect, it } from 'vitest';
import {
  newRecurrenceDraft,
  recurrenceAllDay,
  recurrenceDraftPayload,
  recurrenceEditDraft,
  recurrenceMutation,
  recurrenceRequestIdentity,
} from './native-recurrence-model';

const series: NativeCalendarSeries = {
  id: 'series',
  ws_id: 'ws',
  revision: 7,
  workspace_calendar_id: null,
  rule: {
    version: 1,
    frequency: 'daily',
    interval: 1,
    timeZone: 'America/New_York',
    end: { type: 'count', count: 5 },
  },
  anchor: {
    startLocal: '2026-03-06T09:00:00',
    endLocal: '2026-03-06T10:00:00',
    allDay: false,
  },
  payload: { title: 'Daily' },
  exceptions: [],
};
const event: CalendarEvent = {
  id: 'occurrence',
  seriesId: 'series',
  seriesRevision: 6,
  originalStartLocal: '2026-03-08T09:00:00',
  start_at: '2026-03-08T13:00:00Z',
  end_at: '2026-03-08T14:00:00Z',
  title: 'Moved title',
};
function draft() {
  return {
    ...newRecurrenceDraft('America/New_York', new Date('2026-03-06T14:00:00Z')),
    title: 'Planning',
    frequency: 'daily' as const,
  };
}
describe('native recurrence form contract', () => {
  it('keeps wall-clock time through DST rather than fixed UTC intervals', () => {
    const payload = recurrenceDraftPayload(draft());
    const rows = expandCalendarRecurrence({
      ...payload,
      from: '2026-03-06T00:00:00Z',
      to: '2026-03-10T00:00:00Z',
    }).occurrences;
    expect(rows.map((r) => r.start_at)).toEqual([
      '2026-03-06T14:00:00Z',
      '2026-03-07T14:00:00Z',
      '2026-03-08T13:00:00Z',
      '2026-03-09T13:00:00Z',
    ]);
  });
  it('skips nonexistent spring-forward slots and uses the earlier fold instant', () => {
    const spring = {
      ...draft(),
      startLocal: '2026-03-08T02:30',
      endLocal: '2026-03-08T03:30',
    };
    expect(
      expandCalendarRecurrence({
        ...recurrenceDraftPayload(spring),
        from: '2026-03-08T00:00:00Z',
        to: '2026-03-10T00:00:00Z',
      }).occurrences[0]?.originalStartLocal
    ).toBe('2026-03-09T02:30:00');
    const fold = {
      ...draft(),
      startLocal: '2026-11-01T01:30',
      endLocal: '2026-11-01T02:30',
    };
    expect(
      expandCalendarRecurrence({
        ...recurrenceDraftPayload(fold),
        from: '2026-11-01T00:00:00Z',
        to: '2026-11-02T00:00:00Z',
      }).occurrences[0]?.start_at
    ).toBe('2026-11-01T05:30:00Z');
  });
  it.each([
    { title: ' ' },
    { interval: '0' },
    { interval: '1.5' },
    { timeZone: '+07:00' },
    { endLocal: '2026-03-06T08:00' },
    { frequency: 'weekly' as const, weekdays: [] },
  ])('rejects invalid form data %o', (change) => {
    expect(() => recurrenceDraftPayload({ ...draft(), ...change })).toThrow();
  });
  it('uses exclusive midnight boundaries for all-day creation', () => {
    const payload = recurrenceDraftPayload(recurrenceAllDay(draft(), true));
    expect(payload.anchor).toEqual({
      startLocal: '2026-03-06T00:00:00',
      endLocal: '2026-03-07T00:00:00',
      allDay: true,
    });
  });
  it('keeps the whole-series original anchor rather than the clicked occurrence date', () => {
    expect(recurrenceEditDraft(series, event, 'all').startLocal).toBe(
      '2026-03-06T09:00'
    );
  });
  it('reduces future count by preceding slots without changing the selected original slot', () => {
    const edited = recurrenceEditDraft(series, event, 'future');
    expect(edited.endValue).toBe('3');
    const result = recurrenceMutation(
      edited,
      series,
      event,
      'future',
      'request',
      'update'
    );
    expect(result).toMatchObject({
      scope: 'future',
      expectedRevision: 7,
      originalStartLocal: '2026-03-08T09:00:00',
      rule: { end: { type: 'count', count: 3 } },
    });
  });
  it('moves a single occurrence while preserving its immutable original identity', () => {
    const edited = {
      ...recurrenceEditDraft(series, event, 'this'),
      startLocal: '2026-04-01T11:00',
      endLocal: '2026-04-01T12:00',
    };
    const result = recurrenceMutation(
      edited,
      series,
      event,
      'this',
      'request',
      'update'
    );
    expect(result.originalStartLocal).toBe(event.originalStartLocal);
    expect(result.anchor?.startLocal).toBe('2026-04-01T11:00:00');
    expect(result.rule).toBeUndefined();
    expect(result.expectedRevision).toBe(7);
  });
  it.each(['this', 'all', 'future'] as const)(
    'deletes only the explicitly selected %s scope',
    (scope) => {
      const result = recurrenceMutation(
        draft(),
        series,
        event,
        scope,
        'request',
        'delete'
      );
      expect(result).toEqual({
        requestId: 'request',
        expectedRevision: 7,
        scope,
        originalStartLocal: event.originalStartLocal,
      });
    }
  );
  it('rejects an occurrence from another series or without a slot', () => {
    expect(() =>
      recurrenceMutation(
        draft(),
        series,
        { ...event, seriesId: 'other' },
        'this',
        'request',
        'update'
      )
    ).toThrow();
    expect(() =>
      recurrenceEditDraft(
        series,
        { ...event, originalStartLocal: undefined },
        'this'
      )
    ).toThrow();
  });
  it('preserves advanced relative-weekday rules while editing event details', () => {
    const advanced = {
      ...series,
      anchor: {
        ...series.anchor,
        startLocal: '2026-03-27T09:00:00',
        endLocal: '2026-03-27T10:00:00',
      },
      rule: {
        ...series.rule,
        frequency: 'monthly' as const,
        weekdays: ['FR' as const],
        weekIndex: -1 as const,
      },
    };
    expect(
      recurrenceDraftPayload(recurrenceEditDraft(advanced, event, 'all')).rule
    ).toEqual(advanced.rule);
  });
  it('reuses retry intent IDs and resets for actor, workspace, revision, scope and changed drafts', () => {
    let count = 0;
    const id = recurrenceRequestIdentity(() => String(++count));
    const payload = recurrenceDraftPayload(draft());
    expect(id('actor:ws', payload, 'create')).toBe('1');
    expect(id('actor:ws', payload, 'create')).toBe('1');
    expect(id('other:ws', payload, 'create')).toBe('2');
    expect(id('other:next', payload, 'create')).toBe('3');
    expect(
      id('other:next', { ...payload, event: { title: 'Changed' } }, 'create')
    ).toBe('4');
    const edit = recurrenceMutation(
      draft(),
      series,
      event,
      'this',
      'unused',
      'update'
    );
    const { requestId: _, ...intent } = edit;
    expect(id('actor:ws', intent, 'update')).toBe('5');
    expect(id('actor:ws', { ...intent, expectedRevision: 8 }, 'update')).toBe(
      '6'
    );
    expect(id('actor:ws', { ...intent, scope: 'future' }, 'update')).toBe('7');
  });
});
