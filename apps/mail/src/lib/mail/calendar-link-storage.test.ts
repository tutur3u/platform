import type { MailCalendarAssociation } from '@tuturuuu/internal-api';
import { expect, it } from 'vitest';
import { invitationAssociationKey } from './calendar-link';
import { calendarPreviewFixture } from './calendar-link-fixture';
import {
  readCalendarAssociation,
  updateCalendarAssociation,
} from './calendar-link-storage';

function fixture(): MailCalendarAssociation {
  return {
    invitation: {
      actorId: 'actor',
      mailboxId: 'box',
      uid: 'outlook-uid',
      organizer: 'host@example.test',
      attendee: 'guest@example.test',
      occurrence: null,
    },
    sequence: 1,
    target: calendarPreviewFixture().identity,
    receipt: 'receipt',
    authorityReceipt: 'authority',
  };
}
it('writes only actor-scoped link metadata while preserving replies, other associations and unrelated metadata', () => {
  const link = fixture();
  const key = invitationAssociationKey(link.invitation);
  const before = {
    calendar_reply_claim: { id: 'reply' },
    unrelated: { nested: 1 },
    mail_calendar_links: { other: { actor: 'other' } },
  };
  const next = updateCalendarAssociation(before, 'actor', key, null, link);
  expect(next).toMatchObject(before);
  expect(readCalendarAssociation(next, 'actor', key)).toEqual(link);
  expect(readCalendarAssociation(next, 'other', key)).toBeNull();
  expect(updateCalendarAssociation(next, 'actor', key, link, null)).toEqual({
    ...before,
    mail_calendar_links: before.mail_calendar_links,
  });
});
it('rejects stale CAS, corrupt metadata and attempts to replace another actor value', () => {
  const link = fixture();
  const key = invitationAssociationKey(link.invitation);
  const metadata = updateCalendarAssociation(null, 'actor', key, null, link);
  expect(
    updateCalendarAssociation(metadata, 'actor', key, null, link)
  ).toBeNull();
  expect(
    updateCalendarAssociation(
      {
        mail_calendar_links: {
          [key]: {
            ...link,
            invitation: { ...link.invitation, actorId: 'other' },
          },
        },
      },
      'actor',
      key,
      null,
      null
    )
  ).toBeNull();
  expect(
    updateCalendarAssociation('corrupt', 'actor', key, null, link)
  ).toBeNull();
  expect(
    updateCalendarAssociation(
      { mail_calendar_links: { [key]: { unexpected: true } } },
      'actor',
      key,
      null,
      link
    )
  ).toBeNull();
});
it('survives reordered JSON persistence without accepting a forged key or provider actor', () => {
  const link = fixture();
  const key = invitationAssociationKey(link.invitation);
  const persisted = JSON.parse(
    JSON.stringify(
      updateCalendarAssociation(null, 'actor', key, null, link),
      (_key, value) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(Object.entries(value).reverse())
          : value
    )
  );
  expect(readCalendarAssociation(persisted, 'actor', key)).toEqual(link);
  expect(
    readCalendarAssociation(persisted, 'actor', 'a'.repeat(64))
  ).toBeNull();
  expect(
    updateCalendarAssociation(null, 'actor', key, null, {
      ...link,
      target: { ...link.target, actorUserId: 'other' },
    })
  ).toBeNull();
});

it('rejects corrupt nested namespaces without discarding stored metadata', () => {
  const link = fixture();
  const key = invitationAssociationKey(link.invitation);
  for (const namespace of [null, 'corrupt', [], 1]) {
    const metadata = { unrelated: 'keep', mail_calendar_links: namespace };
    expect(
      updateCalendarAssociation(metadata, 'actor', key, null, link)
    ).toBeNull();
    expect(metadata.mail_calendar_links).toBe(namespace);
  }
  expect(
    updateCalendarAssociation({ unrelated: 'keep' }, 'actor', key, null, link)
  ).toMatchObject({ unrelated: 'keep', mail_calendar_links: { [key]: link } });
});
