import { describe, expect, it } from 'vitest';
import { graphCancellationsInRange } from './graph-snapshot';
import type {
  GraphSeriesEvent,
  ProviderSeriesObservation,
} from './observation';

const observation: ProviderSeriesObservation = {
  masterId: 'master',
  etag: 'v1',
  rule: {
    version: 1,
    frequency: 'daily',
    interval: 1,
    timeZone: 'UTC',
    end: { type: 'count', count: 3 },
  },
  anchor: {
    startLocal: '2026-10-01T09:00:00',
    endLocal: '2026-10-01T10:00:00',
    allDay: false,
  },
  event: { title: 'Fixture', description: '', location: null },
  exceptions: [],
};
const range = ['2026-10-01T00:00:00Z', '2026-10-04T00:00:00Z'] as const;
function event(day: number): GraphSeriesEvent {
  return {
    id: `occurrence-${day}`,
    type: 'occurrence',
    seriesMasterId: 'master',
    originalStart: `2026-10-0${day}T09:00:00Z`,
    start: { dateTime: `2026-10-0${day}T09:00:00`, timeZone: 'UTC' },
    end: { dateTime: `2026-10-0${day}T10:00:00`, timeZone: 'UTC' },
  };
}
describe('Graph cancellations from complete bounded views', () => {
  it('records missing original slots without extending the recurrence COUNT', () => {
    const exceptions = graphCancellationsInRange(
      observation,
      [event(1), event(3)],
      ...range
    );
    expect(exceptions).toEqual([
      {
        originalStartLocal: '2026-10-02T09:00:00',
        exception: { cancelled: true },
        payload: null,
      },
    ]);
    expect(observation.rule.end).toEqual({ type: 'count', count: 3 });
  });
  it('does not cancel a moved-out exception that no longer intersects the visible range', () => {
    const moved = {
      ...observation,
      exceptions: [
        {
          originalStartLocal: '2026-10-02T09:00:00',
          exception: {
            startLocal: '2026-11-02T09:00:00',
            endLocal: '2026-11-02T10:00:00',
          },
          payload: null,
        },
      ],
    };
    expect(
      graphCancellationsInRange(moved, [event(1), event(3)], ...range)
    ).toEqual(moved.exceptions);
  });
  it('rejects a view exception absent from the complete master exception snapshot', () => {
    expect(() =>
      graphCancellationsInRange(
        observation,
        [{ ...event(1), type: 'exception' }, event(2), event(3)],
        ...range
      )
    ).toThrow('Incomplete');
  });
  it('rejects provider occurrence drift instead of collapsing it into a native cancellation', () => {
    const shifted = event(1);
    shifted.start.dateTime = '2026-10-01T09:30:00';
    expect(() =>
      graphCancellationsInRange(
        observation,
        [shifted, event(2), event(3)],
        ...range
      )
    ).toThrow('differs');
  });
  it('rejects duplicate original-slot identity', () => {
    expect(() =>
      graphCancellationsInRange(
        observation,
        [event(1), { ...event(1), id: 'different-id' }],
        ...range
      )
    ).toThrow('Duplicate');
  });
  it('does not publish a partial cancellation set when expansion exceeds its bound', () => {
    expect(() =>
      graphCancellationsInRange(
        {
          ...observation,
          rule: { ...observation.rule, end: { type: 'never' } },
        },
        [],
        range[0],
        '2029-10-01T00:00:00Z'
      )
    ).toThrow('bound');
  });
});
