import { createClient } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types';
import { beforeEach, expect, it, vi } from 'vitest';
import { calendarPreviewFixture } from '../calendar-link-fixture';
import type { MailRouteContext } from '../types';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  invitation: vi.fn(),
  target: vi.fn(),
  table: vi.fn(),
}));
vi.mock('./bootstrap', () => ({ requireMailboxAccess: mocks.access }));
vi.mock('./calendar', () => ({ getMailInvitation: mocks.invitation }));
vi.mock('./shared', () => ({ mailMessageTable: mocks.table }));
vi.mock('@tuturuuu/internal-api/calendar', () => ({
  getCalendarEventLinkPreview: mocks.target,
}));

import { mailCalendarLinks } from './calendar-links';

const ctx: MailRouteContext = {
  normalizedWsId: 'mail-ws',
  user: { id: 'actor' },
  supabase: createClient<Database>(
    'https://synthetic.example.test',
    'synthetic-key',
    { auth: { persistSession: false } }
  ),
};
const invitation = {
  uid: 'outlook-uid',
  sequence: 1,
  organizer: 'host@example.test',
  attendee: 'guest@example.test',
  summary: 'Meeting',
  start: '20261002T063000Z',
  when: 'Original time',
  recurrence: null,
  timezone: [],
  location: 'Original room',
  joinUrl: null,
};
const selection = {
  actorId: 'actor',
  mailboxId: 'box',
  messageId: 'request',
  workspaceId: 'ws',
  eventId: 'event',
};
let metadata: unknown;
let conflict: boolean;
let writes: number;
function query() {
  let next: Record<string, unknown> | undefined;
  const filters = new Map<string, unknown>();
  const q = {
    select: (_columns: string) => q,
    eq: (field: string, value: unknown) => {
      filters.set(field, value);
      return q;
    },
    is: (field: string, value: unknown) => {
      filters.set(field, value);
      return q;
    },
    update: (value: { metadata: Record<string, unknown> }) => {
      next = value.metadata;
      return q;
    },
    maybeSingle: async () => {
      expect(filters.get('id')).toBe('request');
      expect(filters.get('mailbox_id')).toBe('box');
      if (!next) return { data: { metadata }, error: null };
      expect(filters.has('metadata')).toBe(true);
      const expected = filters.get('metadata');
      if (
        conflict ||
        (metadata === null
          ? expected !== null
          : expected !== JSON.stringify(metadata))
      )
        return { data: null, error: null };
      metadata = next;
      writes++;
      return { data: { id: 'request' }, error: null };
    },
  };
  return q;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('CALENDAR_APP_URL', 'https://calendar.example.test');
  vi.stubEnv('NEXT_PUBLIC_CALENDAR_APP_URL', 'https://calendar.tuturuuu.com');
  metadata = { calendar_reply_claim: { id: 'reply' }, other: 'keep' };
  conflict = false;
  writes = 0;
  mocks.access.mockResolvedValue({ admin: {}, mailbox: { groupPolicy: null } });
  mocks.invitation.mockResolvedValue({ invitation });
  mocks.target.mockResolvedValue(calendarPreviewFixture());
  mocks.table.mockImplementation(query);
});
it('uses authorized Mail helpers and exact read-only Calendar selection, then CAS preserves RSVP and unrelated metadata', async () => {
  const { service } = mailCalendarLinks(
    ctx,
    new Headers({ authorization: 'Bearer synthetic-test-only' }),
    'box',
    'request'
  );
  const preview = await service.preview(selection);
  expect(preview).not.toBeNull();
  expect(mocks.access).toHaveBeenCalledWith(ctx, 'box', [
    'owner',
    'admin',
    'sender',
  ]);
  expect(mocks.target).toHaveBeenCalledWith(
    'ws',
    'event',
    expect.objectContaining({ baseUrl: 'https://calendar.example.test' })
  );
  expect((await service.confirm(selection, preview!.receipt)).status).toBe(
    'linked'
  );
  expect(metadata).toMatchObject({
    calendar_reply_claim: { id: 'reply' },
    other: 'keep',
  });
  expect(writes).toBe(1);
  expect((await service.confirm(selection, preview!.receipt)).status).toBe(
    'linked'
  );
  expect(writes).toBe(1);
});
it('fails closed on Mail revocation, group delivery, stale invitation and Calendar account mismatch', async () => {
  const { service } = mailCalendarLinks(ctx, new Headers(), 'box', 'request');
  const preview = await service.preview(selection);
  expect(preview).not.toBeNull();
  mocks.access.mockResolvedValue(null);
  expect((await service.confirm(selection, preview!.receipt)).status).toBe(
    'conflict'
  );
  expect(writes).toBe(0);
  mocks.access.mockResolvedValue({
    admin: {},
    mailbox: { groupPolicy: { group: 'test' } },
  });
  expect((await service.confirm(selection, preview!.receipt)).status).toBe(
    'conflict'
  );
  mocks.invitation.mockResolvedValue(null);
  expect((await service.confirm(selection, preview!.receipt)).status).toBe(
    'unavailable'
  );
  mocks.invitation.mockResolvedValue({ invitation });
  const other = calendarPreviewFixture();
  other.identity.actorUserId = 'other';
  mocks.target.mockResolvedValue(other);
  expect(await service.preview(selection)).toBeNull();
  expect(writes).toBe(0);
});
it('returns conflict on concurrent metadata change and unlinks only the saved actor association', async () => {
  const { service } = mailCalendarLinks(ctx, new Headers(), 'box', 'request');
  const preview = await service.preview(selection);
  conflict = true;
  expect((await service.confirm(selection, preview!.receipt)).status).toBe(
    'conflict'
  );
  expect(writes).toBe(0);
  conflict = false;
  expect((await service.confirm(selection, preview!.receipt)).status).toBe(
    'linked'
  );
  expect(
    (
      await service.unlink(
        'actor',
        'box',
        'request',
        preview!.target.identity,
        preview!.receipt
      )
    ).status
  ).toBe('unlinked');
  expect(metadata).toMatchObject({
    calendar_reply_claim: { id: 'reply' },
    other: 'keep',
    mail_calendar_links: {},
  });
});
