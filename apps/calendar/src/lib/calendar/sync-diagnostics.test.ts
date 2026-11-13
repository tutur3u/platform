import { describe, expect, it } from 'vitest';
import {
  readSyncFailures,
  sanitizeSyncErrorMessage,
  SYNC_DIAGNOSTICS_MAX_CHARS,
  serializeSyncFailures,
} from './sync-diagnostics';
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
  it('keeps DNS failures separate from missing calendars', () => {
    expect(
      classifyCalendarSyncError(
        new Error('getaddrinfo ENOTFOUND www.googleapis.com')
      )
    ).toBe('network');
    expect(classifyCalendarSyncError(new Error('Calendar notFound'))).toBe(
      'not_found'
    );
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

describe('bounded calendar diagnostics', () => {
  it('keeps the stored failures under the column limit and readable', () => {
    const failures = Array.from({ length: 60 }, (_, index) => ({
      connectionId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      calendarName: 'Long calendar name '.repeat(20),
      code: 'api_limit',
    }));
    const text = serializeSyncFailures(failures);
    expect(text.length).toBeLessThanOrEqual(SYNC_DIAGNOSTICS_MAX_CHARS);
    const read = readSyncFailures(text);
    expect(read.length).toBeGreaterThan(0);
    expect(read.length).toBeLessThan(failures.length);
    expect(read[0]?.calendarName.length).toBeLessThanOrEqual(80);
  });

  it('stores an empty list for no failures', () => {
    expect(readSyncFailures(serializeSyncFailures([]))).toEqual([]);
  });

  it('redacts tokens, authorization headers, OAuth codes and URL queries', () => {
    const message = [
      'Request failed GET https://graph.microsoft.com/v1.0/me/events?$select=id&access_token=abc123secret#frag',
      'Authorization: Bearer ya29.A0AfH6SMBxyz-token',
      'refresh_token=1//0gLongRefreshTokenValueABCDEFGH',
      'body {"client_secret":"s3cr3t-value","code":"4/0AanOAuthCode"}',
      'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig_value',
    ].join(' ');
    const out = sanitizeSyncErrorMessage(message);
    for (const secret of [
      'abc123secret',
      'ya29.A0AfH6SMBxyz-token',
      '1//0gLongRefreshTokenValueABCDEFGH',
      's3cr3t-value',
      '4/0AanOAuthCode',
      'eyJhbGciOiJIUzI1NiJ9',
      '$select=id',
    ])
      expect(out).not.toContain(secret);
    expect(out).toContain('https://graph.microsoft.com/v1.0/me/events');
    expect(out).toContain('[redacted]');
  });

  it('caps a long message', () => {
    expect(
      sanitizeSyncErrorMessage('x'.repeat(5000)).length
    ).toBeLessThanOrEqual(503);
  });
});
