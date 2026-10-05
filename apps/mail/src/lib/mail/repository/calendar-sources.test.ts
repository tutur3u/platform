import { expect, it, vi } from 'vitest';

vi.mock('../storage', () => ({ readMailStoredObject: vi.fn() }));
vi.mock('./bootstrap', () => ({ requireMailboxAccess: vi.fn() }));
vi.mock('./shared', () => ({
  mailMessageTable: vi.fn(),
  privateTable: vi.fn(),
}));

import { calendarSourceFromMime } from './calendar-source';
import { coalesceCalendarSources } from './calendar-sources';

const bytes = (value: string) => new TextEncoder().encode(value);
it('coalesces newline-equivalent MIME copies only', () => {
  expect(
    coalesceCalendarSources([
      bytes('BEGIN:VCALENDAR\r\nUID:one'),
      bytes('BEGIN:VCALENDAR\nUID:one'),
    ])
  ).toBe('BEGIN:VCALENDAR\nUID:one');
  expect(
    coalesceCalendarSources([bytes('UID:one'), bytes('UID:two')])
  ).toBeNull();
});
it('bounds content and refuses invalid UTF8 or empty copies', () => {
  expect(coalesceCalendarSources([])).toBeNull();
  expect(coalesceCalendarSources([new Uint8Array([255])])).toBeNull();
  expect(coalesceCalendarSources([bytes('UID:one'), bytes('')])).toBeNull();
  expect(
    coalesceCalendarSources(Array.from({ length: 9 }, () => bytes('UID:one')))
  ).toBeNull();
  expect(coalesceCalendarSources([new Uint8Array(256 * 1024 + 1)])).toBeNull();
  expect(
    coalesceCalendarSources(
      Array.from({ length: 3 }, () => bytes('a'.repeat(200000)))
    )
  ).toBeNull();
});

it('coalesces real Google-style alternative and attachment MIME copies', async () => {
  const calendar =
    'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nMETHOD:REQUEST\r\nEND:VCALENDAR\r\n';
  const mime = (second: string) =>
    bytes(
      [
        'MIME-Version: 1.0',
        'Content-Type: multipart/mixed; boundary="outer"',
        '',
        '--outer',
        'Content-Type: multipart/alternative; boundary="inner"',
        '',
        '--inner',
        'Content-Type: text/plain',
        '',
        'QA invitation',
        '--inner',
        'Content-Type: text/calendar; method=REQUEST; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(calendar).toString('base64'),
        '--inner--',
        '--outer',
        'Content-Type: application/ics; name="invite.ics"',
        'Content-Disposition: attachment; filename="invite.ics"',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(second).toString('base64'),
        '--outer--',
        '',
      ].join('\r\n')
    );
  expect(await calendarSourceFromMime(mime(calendar))).toBe(
    calendar.trim().replaceAll('\r\n', '\n')
  );
  expect(
    await calendarSourceFromMime(mime(calendar.replace('REQUEST', 'CANCEL')))
  ).toBeNull();
});
