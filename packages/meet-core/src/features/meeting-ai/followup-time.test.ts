import { expect, it } from 'vitest';
import { localTimeToIso, suggestedLocalTime } from './followup-time';

it('respects Vietnamese local dates across UTC day boundaries', () => {
  expect(localTimeToIso('2026-09-15T00:30', 'Asia/Ho_Chi_Minh')).toBe(
    '2026-09-14T17:30:00.000Z'
  );
});
it('converts notes time into the reviewing user timezone', () => {
  expect(
    suggestedLocalTime(
      '2026-09-15T09:00',
      'Asia/Ho_Chi_Minh',
      'America/New_York'
    )
  ).toBe('2026-09-14T22:00');
});
it('rejects missing and repeated DST wall times instead of silently moving events', () => {
  expect(() => localTimeToIso('2026-03-08T02:30', 'America/New_York')).toThrow(
    'invalid_time'
  );
  expect(() => localTimeToIso('2026-11-01T01:30', 'America/New_York')).toThrow(
    'ambiguous_time'
  );
  expect(() =>
    localTimeToIso('2026-10-04T02:15', 'Australia/Lord_Howe')
  ).toThrow('invalid_time');
});
it('rejects invalid dates, zones and ungrounded suggestions', () => {
  expect(() => localTimeToIso('2026-02-31T12:00', 'UTC')).toThrow(
    'invalid_time'
  );
  expect(() => localTimeToIso('2026-09-15T12:00', 'invalid')).toThrow();
  expect(suggestedLocalTime('tomorrow at 9', 'UTC', 'UTC')).toBe('');
  expect(suggestedLocalTime('2026-09-15T09:00', null, 'UTC')).toBe('');
});
