import {
  confirmMailCalendarLink,
  getMailCalendarLink,
  parseMailCalendarEventUrl,
  previewMailCalendarLink,
  unlinkMailCalendarLink,
} from '@tuturuuu/internal-api/mail';
import { expect, it, vi } from 'vitest';

it('uses encoded Mail paths, uncached authenticated requests and the exact preview/confirm/unlink payloads', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(
        JSON.stringify({
          status: 'linked',
          target: null,
          association: null,
          preview: null,
        }),
        { headers: { 'content-type': 'application/json' } }
      )
  );
  const options = { baseUrl: 'https://mail.example.test', fetch };
  const selected = { calendarWorkspaceId: 'calendar-ws', eventId: 'event' };
  await getMailCalendarLink('mail/ws', 'box?', 'message#', options);
  await previewMailCalendarLink(
    'mail/ws',
    'box?',
    'message#',
    selected,
    options
  );
  await confirmMailCalendarLink(
    'mail/ws',
    'box?',
    'message#',
    { ...selected, receipt: 'receipt' },
    options
  );
  await unlinkMailCalendarLink(
    'mail/ws',
    'box?',
    'message#',
    'saved-receipt',
    options
  );
  expect(fetch.mock.calls.map((call) => call[0])).toEqual([
    'https://mail.example.test/api/v1/workspaces/mail%2Fws/mail/mailboxes/box%3F/messages/message%23/calendar-link',
    'https://mail.example.test/api/v1/workspaces/mail%2Fws/mail/mailboxes/box%3F/messages/message%23/calendar-link/preview',
    'https://mail.example.test/api/v1/workspaces/mail%2Fws/mail/mailboxes/box%3F/messages/message%23/calendar-link',
    'https://mail.example.test/api/v1/workspaces/mail%2Fws/mail/mailboxes/box%3F/messages/message%23/calendar-link',
  ]);
  for (const [, init] of fetch.mock.calls) {
    expect(init?.cache).toBe('no-store');
    expect(init?.credentials).toBe('include');
  }
  expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual(selected);
  expect(JSON.parse(String(fetch.mock.calls[2]?.[1]?.body))).toEqual({
    ...selected,
    receipt: 'receipt',
  });
  expect(JSON.parse(String(fetch.mock.calls[3]?.[1]?.body))).toEqual({
    receipt: 'saved-receipt',
  });
});
it('extracts only a selected Calendar event reference and rejects misleading or ambiguous URLs', () => {
  const ws = '11111111-1111-4111-8111-111111111111',
    event = '22222222-2222-4222-8222-222222222222';
  expect(
    parseMailCalendarEventUrl(
      `https://calendar.tuturuuu.com/en/${ws}?eventId=${event}`
    )
  ).toEqual({ calendarWorkspaceId: ws, eventId: event });
  expect(
    parseMailCalendarEventUrl(
      `https://calendar.tuturuuu.com/personal?eventId=${event}`
    )
  ).toEqual({ calendarWorkspaceId: 'personal', eventId: event });
  for (const value of [
    `https://evil.example.test/${ws}?eventId=${event}`,
    `https://calendar.tuturuuu.com/${ws}?eventId=${event}&eventId=${event}`,
    `https://user@calendar.tuturuuu.com/${ws}?eventId=${event}`,
    `https://calendar.tuturuuu.com/${ws}`,
  ])
    expect(parseMailCalendarEventUrl(value)).toBeNull();
});
