import { describe, expect, it } from 'vitest';
import { readSyncFailures } from './sync-diagnostics';
import { classifyCalendarSyncError } from './sync-errors';

describe('safe calendar failure diagnostics', () => {
  it('only exposes versioned, typed recovery fields', () => {
    expect(
      readSyncFailures(
        JSON.stringify({
          version: 1,
          failedCalendars: [
            {
              connectionId: 'a',
              calendarName: 'Calendar',
              code: 'not_found',
              privatePayload: 'hidden',
            },
          ],
        })
      )
    ).toEqual([
      { connectionId: 'a', calendarName: 'Calendar', code: 'not_found' },
    ]);
    expect(readSyncFailures('private provider stack trace')).toEqual([]);
    expect(
      readSyncFailures(JSON.stringify({ version: 2, failedCalendars: [] }))
    ).toEqual([]);
  });
  it.each([
    [404, 'not_found'],
    [403, 'access_denied'],
    [401, 'auth'],
    [429, 'api_limit'],
    [503, 'network'],
  ])('classifies provider status %s', (code, expected) => {
    expect(classifyCalendarSyncError({ code })).toBe(expected);
  });
});
