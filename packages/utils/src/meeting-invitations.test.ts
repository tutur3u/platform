import { describe, expect, it } from 'vitest';
import {
  MeetingInvitationInputSchema,
  normalizeGoogleResponse,
  normalizeMicrosoftResponse,
} from './meeting-invitations';

describe('meeting invitation contract', () => {
  it('normalizes internal and external guests without accepting response spoofing', () => {
    const invitation = MeetingInvitationInputSchema.parse({
      guests: [
        { email: 'NAME@TUTURUUU.COM', response: 'accepted' },
        { email: 'friend@gmail.com', optional: true },
      ],
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    expect(invitation.guests[0]).toEqual({ email: 'name@tuturuuu.com' });
    expect(invitation.guests[1]?.optional).toBe(true);
  });
  it.each([
    { guests: [], timeZone: 'UTC' },
    { guests: [{ email: 'invalid' }], timeZone: 'UTC' },
    { guests: [{ email: 'a@example.com' }], timeZone: 'fake/zone' },
    {
      guests: [{ email: 'a@example.com' }, { email: 'A@EXAMPLE.COM' }],
      timeZone: 'UTC',
    },
    {
      guests: Array.from({ length: 101 }, (_, i) => ({
        email: `${i}@example.com`,
      })),
      timeZone: 'UTC',
    },
  ])('rejects invalid or ambiguous invitation input', (input) => {
    expect(MeetingInvitationInputSchema.safeParse(input).success).toBe(false);
  });
  it.each(['accepted', 'declined', 'tentative', 'needsAction'])(
    'preserves Google %s',
    (value) => {
      expect(normalizeGoogleResponse(value)).toBe(value);
    }
  );
  it.each([
    ['accepted', 'accepted'],
    ['declined', 'declined'],
    ['tentativelyAccepted', 'tentative'],
    ['notResponded', 'needsAction'],
    ['none', 'needsAction'],
    ['unexpected', 'needsAction'],
  ])('normalizes Microsoft %s', (value, expected) => {
    expect(normalizeMicrosoftResponse(value)).toBe(expected);
  });
});

describe('untrusted invitation input boundaries', () => {
  it.each([
    null,
    undefined,
    'accepted',
    [],
    { guests: [{ email: 'a@example.com', optional: 'yes' }], timeZone: 'UTC' },
    {
      guests: [{ email: 'a@example.com', name: 'a'.repeat(201) }],
      timeZone: 'UTC',
    },
    {
      guests: [{ email: 'a@example.com\r\nBcc: victim@example.com' }],
      timeZone: 'UTC',
    },
    { guests: [{ email: 'a@example.com' }], timeZone: null },
  ])('rejects malformed input without throwing from safeParse', (input) => {
    expect(MeetingInvitationInputSchema.safeParse(input).success).toBe(false);
  });

  it('accepts the maximum guest count and strips organizer-controlled provider state', () => {
    const result = MeetingInvitationInputSchema.parse({
      guests: Array.from({ length: 100 }, (_, i) => ({
        email: `guest${i}@example.com`,
        self: true,
        response: 'accepted',
      })),
      timeZone: 'UTC',
      organizer: { email: 'spoof@example.com' },
      cancelled: true,
    });
    expect(result.guests).toHaveLength(100);
    expect(result).not.toHaveProperty('organizer');
    expect(result).not.toHaveProperty('cancelled');
    for (const guest of result.guests) {
      expect(guest).not.toHaveProperty('self');
      expect(guest).not.toHaveProperty('response');
    }
  });

  it.each([null, undefined, {}, [], 0, 'ACCEPTED', '<script>'])(
    'treats unknown provider responses as unanswered',
    (value) => {
      expect(normalizeGoogleResponse(value)).toBe('needsAction');
      expect(normalizeMicrosoftResponse(value)).toBe('needsAction');
    }
  );
});
