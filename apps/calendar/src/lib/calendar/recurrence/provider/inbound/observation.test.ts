import type { calendar_v3 } from '@tuturuuu/google';
import { describe, expect, it } from 'vitest';
import {
  type GraphSeriesEvent,
  observeGoogleSeries,
  observeGraphSeries,
} from './observation';

const master: calendar_v3.Schema$Event = {
  id: 'master',
  etag: 'v1',
  summary: 'Fixture',
  iCalUID: 'fixture@example.invalid',
  recurrence: ['RRULE:FREQ=DAILY;COUNT=5'],
  start: {
    dateTime: '2026-03-06T09:00:00-05:00',
    timeZone: 'America/New_York',
  },
  end: { dateTime: '2026-03-06T10:00:00-05:00', timeZone: 'America/New_York' },
};
const googleException: calendar_v3.Schema$Event = {
  id: 'exception',
  recurringEventId: 'master',
  originalStartTime: { dateTime: '2026-03-09T09:00:00-04:00' },
  summary: 'Moved',
  start: { dateTime: '2026-04-09T11:00:00-04:00' },
  end: { dateTime: '2026-04-09T12:00:00-04:00' },
};
const graphMaster: GraphSeriesEvent = {
  id: 'master',
  '@odata.etag': 'v1',
  type: 'seriesMaster',
  subject: 'Fixture',
  start: { dateTime: '2026-03-06T14:00:00.0000000', timeZone: 'UTC' },
  end: { dateTime: '2026-03-06T15:00:00.0000000', timeZone: 'UTC' },
  recurrence: {
    pattern: { type: 'daily', interval: 1 },
    range: {
      type: 'numbered',
      numberOfOccurrences: 5,
      startDate: '2026-03-06',
      recurrenceTimeZone: 'America/New_York',
    },
  },
};
const graphException: GraphSeriesEvent = {
  ...graphMaster,
  id: 'exception',
  type: 'exception',
  seriesMasterId: 'master',
  originalStart: '2026-03-09T13:00:00Z',
  subject: 'Moved',
  start: { dateTime: '2026-04-09T15:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-09T16:00:00', timeZone: 'UTC' },
  recurrence: undefined,
};
describe('canonical complete provider observations', () => {
  it.each(['google', 'microsoft'])(
    'keeps moved %s exceptions outside the active range by original slot',
    (provider) => {
      const result =
        provider === 'google'
          ? observeGoogleSeries(master, [googleException])
          : observeGraphSeries(graphMaster, [graphException]);
      expect(result.exceptions[0]).toMatchObject({
        originalStartLocal: '2026-03-09T09:00:00',
        exception: {
          startLocal: '2026-04-09T11:00:00',
          endLocal: '2026-04-09T12:00:00',
        },
        payload: { title: 'Moved' },
      });
      expect(result.anchor.startLocal).toBe('2026-03-06T09:00:00');
    }
  );
  it('imports Windows recurrence zones while preserving UTC provider response times across DST', () => {
    const result = observeGraphSeries(
      {
        ...graphMaster,
        recurrence: {
          ...graphMaster.recurrence!,
          range: {
            ...graphMaster.recurrence!.range,
            recurrenceTimeZone: 'Eastern Standard Time',
          },
        },
      },
      [graphException]
    );
    expect(result.rule.timeZone).toBe('America/New_York');
    expect(result.exceptions[0]?.originalStartLocal).toBe(
      '2026-03-09T09:00:00'
    );
  });
  it('keeps a cancellation even when Google supplies no current dates or fields', () => {
    const cancelled = {
      recurringEventId: 'master',
      originalStartTime: { dateTime: '2026-03-09T13:00:00Z' },
      status: 'cancelled',
    };
    expect(observeGoogleSeries(master, [cancelled]).exceptions[0]).toEqual({
      originalStartLocal: '2026-03-09T09:00:00',
      exception: { cancelled: true },
      payload: null,
    });
  });
  it('uses the authoritative calendar timezone for an all-day Google master', () => {
    const result = observeGoogleSeries(
      { ...master, start: { date: '2026-03-06' }, end: { date: '2026-03-08' } },
      [
        {
          recurringEventId: 'master',
          status: 'cancelled',
          originalStartTime: { date: '2026-03-09' },
        },
      ],
      'America/New_York'
    );
    expect(result.anchor).toEqual({
      startLocal: '2026-03-06T00:00:00',
      endLocal: '2026-03-08T00:00:00',
      allDay: true,
    });
    expect(result.exceptions[0]!.originalStartLocal).toBe(
      '2026-03-09T00:00:00'
    );
  });
  it('rejects timezone-free Google masters instead of using the machine zone', () => {
    expect(() =>
      observeGoogleSeries(
        { ...master, start: { dateTime: '2026-03-06T14:00:00Z' } },
        []
      )
    ).toThrow('timezone');
  });
  it('preserves unsupported Google RDATE sets by rejecting lossy canonical admission', () => {
    expect(() =>
      observeGoogleSeries(
        {
          ...master,
          recurrence: [...master.recurrence!, 'RDATE:20260310T140000Z'],
        },
        []
      )
    ).toThrow('retain original');
  });
  it.each([
    ['google', { ...googleException, recurringEventId: 'another' }],
    [
      'google',
      {
        ...googleException,
        originalStartTime: { dateTime: '2026-03-20T13:00:00Z' },
      },
    ],
  ])(
    'rejects foreign or exhausted %s exception identity',
    (_provider, exception) => {
      expect(() =>
        observeGoogleSeries(master, [exception as calendar_v3.Schema$Event])
      ).toThrow();
    }
  );
  it('rejects duplicate exception slots instead of silently overwriting one', () => {
    expect(() =>
      observeGoogleSeries(master, [googleException, googleException])
    ).toThrow('duplicate');
  });
  it('does not treat Graph generated occurrences as stored overrides', () => {
    expect(() =>
      observeGraphSeries(graphMaster, [
        { ...graphException, type: 'occurrence' },
      ])
    ).toThrow('another series');
  });
  it('rejects custom Graph timezones without substituting UTC', () => {
    expect(() =>
      observeGraphSeries(
        {
          ...graphMaster,
          recurrence: {
            ...graphMaster.recurrence!,
            range: {
              ...graphMaster.recurrence!.range,
              recurrenceTimeZone: 'tzone://Microsoft/Custom',
            },
          },
        },
        []
      )
    ).toThrow();
  });
  it.each([null, ''])(
    'requires Google master ETag %s before replacing the native snapshot',
    (etag) => {
      expect(() => observeGoogleSeries({ ...master, etag }, [])).toThrow(
        'revision'
      );
    }
  );
});
