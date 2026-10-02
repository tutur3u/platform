import { describe, expect, it } from 'vitest';
import { parseCalendarEventRead } from './event-read-pagination';

const start = '2026-01-01T00:00:00.000Z';
const end = '2027-01-01T00:00:00.000Z';
const id = '00000000-0000-4000-8000-000000000001';
function params(extra: Record<string, string> = {}) {
  return new URLSearchParams({ start_at: start, end_at: end, ...extra });
}

describe('calendar read bounds', () => {
  it('preserves full leap-year and ordinary year views', () => {
    expect(parseCalendarEventRead(params()).pageSize).toBeUndefined();
    expect(
      parseCalendarEventRead(
        params({
          start_at: '2024-01-01T00:00:00Z',
          end_at: '2025-01-01T00:00:00Z',
        })
      ).pageSize
    ).toBeUndefined();
  });
  it.each(['', 'not-a-date', '2026-99-01T00:00:00Z'])(
    'rejects invalid dates %s',
    (start_at) => {
      expect(() => parseCalendarEventRead(params({ start_at }))).toThrow();
    }
  );
  it('rejects reversed, empty and oversized unpaginated ranges', () => {
    for (const end_at of [
      start,
      '2025-01-01T00:00:00Z',
      '9999-12-31T23:59:59Z',
    ]) {
      expect(() => parseCalendarEventRead(params({ end_at }))).toThrow();
    }
  });
  it('allows full history only with bounded pagination', () => {
    expect(
      parseCalendarEventRead(
        params({
          start_at: '0001-01-01T00:00:00Z',
          end_at: '9999-12-31T23:59:59Z',
          page_size: '500',
        })
      ).pageSize
    ).toBe(500);
  });
  it.each(['', '0', '501', '-1', '1.5', 'Infinity', '2e2'])(
    'rejects unsafe page_size %s',
    (page_size) => {
      expect(() => parseCalendarEventRead(params({ page_size }))).toThrow();
    }
  );
  it('validates cursor shape before constructing database filters', () => {
    const cursor = JSON.stringify({ start_at: start, id });
    expect(
      parseCalendarEventRead(params({ page_size: '200', cursor })).cursor
    ).toEqual({ start_at: start, id });
    expect(() => parseCalendarEventRead(params({ cursor }))).toThrow();
    for (const bad of [
      '{}',
      'garbage',
      JSON.stringify({ start_at: 'gt.inject', id }),
      JSON.stringify({ start_at: start, id: 'bad' }),
      JSON.stringify({ start_at: start, id, injected: true }),
    ]) {
      expect(() =>
        parseCalendarEventRead(params({ page_size: '200', cursor: bad }))
      ).toThrow();
    }
  });
});
