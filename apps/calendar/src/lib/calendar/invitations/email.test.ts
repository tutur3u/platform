import { describe, expect, it } from 'vitest';
import {
  buildInvitationEmail,
  buildInvitationSubject,
  escapeHtml,
  sanitizeSubject,
} from './email';
import {
  attendeesVisibleTo,
  deliveryIdempotencyKey,
  type InvitationSnapshot,
} from './snapshot';
import {
  createInviteToken,
  hashInviteToken,
  inviteTokenExpiry,
  isWellFormedInviteToken,
} from './tokens';

const snapshot: InvitationSnapshot = {
  v: 1,
  eventId: '00000000-0000-4000-8000-000000000001',
  wsId: '00000000-0000-4000-8000-000000000002',
  uid: 'uid@calendar.tuturuuu.com',
  sequence: 0,
  title: '<script>alert(1)</script> Sync',
  description: 'Agenda & notes',
  location: null,
  conferenceUrl: 'https://tuturuuu.com/meet/ws/meetings/m1',
  start: '2026-12-01T09:00:00.000Z',
  end: '2026-12-01T10:00:00.000Z',
  allDay: false,
  timeZone: 'Asia/Ho_Chi_Minh',
  organizer: {
    email: 'owner@example.com',
    name: 'Owner',
    userId: '00000000-0000-4000-8000-000000000003',
  },
  guestsCanSeeGuestList: false,
  attendees: [
    {
      email: 'owner@example.com',
      name: 'Owner',
      status: 'accepted',
      optional: false,
    },
    { email: 'a@example.com', name: null, status: 'pending', optional: false },
    { email: 'b@example.com', name: null, status: 'pending', optional: true },
  ],
};

const links = {
  rsvpUrl:
    'https://tuturuuu.com/calendar/api/v1/calendar/invitations/rsvp?token=t',
  unsubscribeUrl:
    'https://tuturuuu.com/calendar/api/v1/calendar/invitations/unsubscribe?token=u',
  blockSenderUrl:
    'https://tuturuuu.com/calendar/api/v1/calendar/invitations/unsubscribe?token=u&scope=sender',
};

describe('invitation email', () => {
  it('escapes event content and never emits raw HTML from the event', () => {
    const email = buildInvitationEmail({
      snapshot,
      kind: 'invite',
      locale: 'en',
      recipientEmail: 'a@example.com',
      attendees: attendeesVisibleTo(snapshot, 'a@example.com'),
      links,
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('Agenda &amp; notes');
    expect(email.html).toContain('response=accepted');
    expect(email.html).toContain('Join with Tuturuuu Meet');
    expect(email.text).toContain('https://tuturuuu.com/meet/ws/meetings/m1');
  });

  it('hides other guests when the guest list is private', () => {
    const visible = attendeesVisibleTo(snapshot, 'a@example.com').map(
      (a) => a.email
    );
    expect(visible).toEqual(['owner@example.com', 'a@example.com']);
    expect(
      attendeesVisibleTo(
        { ...snapshot, guestsCanSeeGuestList: true },
        'a@example.com'
      )
    ).toHaveLength(3);
  });

  it('drops RSVP and join buttons from cancellations', () => {
    const email = buildInvitationEmail({
      snapshot,
      kind: 'cancel',
      locale: 'vi',
      recipientEmail: 'a@example.com',
      attendees: [],
      links: { ...links, rsvpUrl: null },
    });
    expect(email.subject.startsWith('Sự kiện đã huỷ:')).toBe(true);
    expect(email.html).not.toContain('response=');
    expect(email.html).not.toContain('Tham gia bằng Tuturuuu Meet');
    expect(email.html).toContain('Ngừng nhận mọi lời mời');
  });

  it('builds header-safe subjects', () => {
    expect(sanitizeSubject('a\r\nBcc: x')).toBe('a Bcc: x');
    const subject = buildInvitationSubject(
      { ...snapshot, title: 'Line\nbreak' },
      'update',
      'en'
    );
    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject.startsWith('Updated invitation: Line break @')).toBe(true);
  });

  it('escapes HTML attribute characters', () => {
    expect(escapeHtml(`"'<>&`)).toBe('&quot;&#39;&lt;&gt;&amp;');
  });
});

describe('invitation tokens', () => {
  it('creates 256-bit tokens and stores only their hash', () => {
    const { token, tokenHash } = createInviteToken();
    expect(isWellFormedInviteToken(token)).toBe(true);
    expect(tokenHash).toBe(hashInviteToken(token));
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(token);
  });

  it('rejects malformed tokens before any lookup', () => {
    expect(isWellFormedInviteToken('short')).toBe(false);
    expect(isWellFormedInviteToken(`${'a'.repeat(42)}=`)).toBe(false);
    expect(isWellFormedInviteToken(null)).toBe(false);
  });

  it('expires RSVP links a week after the event, within the TTL', () => {
    const now = new Date('2026-11-23T00:00:00Z');
    const end = new Date('2026-12-01T10:00:00Z');
    expect(inviteTokenExpiry('rsvp', end, now).toISOString()).toBe(
      '2026-12-08T10:00:00.000Z'
    );
    const far = new Date('2027-12-01T00:00:00Z');
    expect(inviteTokenExpiry('rsvp', far, now).getTime()).toBe(
      now.getTime() + 60 * 24 * 60 * 60 * 1000
    );
  });

  it('derives one idempotency key per event, recipient, version and kind', () => {
    const key = deliveryIdempotencyKey({
      eventId: snapshot.eventId,
      recipientEmail: 'a@example.com',
      sequence: 3,
      kind: 'update',
    });
    expect(key).toBe(
      `cal-invite-v1:${snapshot.eventId}:a@example.com:3:update`
    );
  });
});
