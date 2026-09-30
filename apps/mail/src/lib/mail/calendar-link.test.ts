import { beforeEach, expect, it, vi } from 'vitest';
import type { CalendarInvitation } from './calendar-invitation';
import {
  type AuthorizedCalendarLinkTarget,
  type CalendarLinkDependencies,
  createCalendarLinkService,
  invitationAssociationKey,
  invitationLinkIdentity,
  type MailCalendarAssociation,
} from './calendar-link';

const original: CalendarInvitation = {
  uid: 'outlook-uid@example.test',
  sequence: 2,
  organizer: 'organizer@example.test',
  attendee: 'invited@example.test',
  summary: 'Meeting',
  start: '20261002T133000',
  when: 'Original invitation time',
  recurrence: 'RECURRENCE-ID;TZID="SE Asia Standard Time":20261002T133000',
  timezone: [],
  location: 'Original Outlook location',
  joinUrl: 'https://teams.microsoft.com/meet/synthetic',
};
const hold: AuthorizedCalendarLinkTarget = {
  identity: {
    workspaceId: 'personal',
    eventId: 'hold',
    provider: 'google',
    calendarId: 'calendar',
    connectionId: 'connection',
    accountOwnerId: 'actor',
    externalEventId: 'google-private-hold',
    occurrence: null,
  },
  title: 'Meeting',
  organizer: 'self@example.test',
  attendees: [],
  location: 'Hold location',
  joinUrl: null,
  start: '2026-10-02T13:30:00+07:00',
  end: '2026-10-02T15:00:00+07:00',
  accountLabel: 'Personal account',
};
const selection = {
  actorId: 'actor',
  mailboxId: 'box',
  messageId: 'request',
  workspaceId: 'personal',
  eventId: 'hold',
};
let source: CalendarInvitation | null;
let target: AuthorizedCalendarLinkTarget | null;
let saved: MailCalendarAssociation | null;
let deps: CalendarLinkDependencies;
beforeEach(() => {
  source = structuredClone(original);
  target = structuredClone(hold);
  saved = null;
  deps = {
    readInvitation: vi.fn(async () => source),
    readTarget: vi.fn(async () => target),
    readAssociation: vi.fn(async () => saved),
    saveAssociation: vi.fn(async (_actor, _key, expected, next) => {
      if (expected !== saved) return false;
      saved = next;
      return true;
    }),
  };
});
it('keeps UID/account/occurrence identity stable across sequence updates and recurrence parameter spelling', () => {
  const identity = invitationLinkIdentity('actor', 'box', original);
  const key = invitationAssociationKey(identity);
  expect(
    invitationAssociationKey(
      invitationLinkIdentity('actor', 'box', {
        ...original,
        sequence: 3,
        recurrence:
          'recurrence-id;VALUE=DATE-TIME;TZID=SE Asia Standard Time:20261002T133000',
      })
    )
  ).toBe(key);
  for (const changed of [
    { ...identity, actorId: 'other' },
    { ...identity, mailboxId: 'other' },
    { ...identity, uid: 'different-uid' },
    { ...identity, organizer: 'different@example.test' },
    { ...identity, occurrence: null },
    {
      ...identity,
      occurrence: { ...identity.occurrence!, value: '20261003T133000' },
    },
  ])
    expect(invitationAssociationKey(changed)).not.toBe(key);
});
it('previews identical-title private hold without saving or changing original organizer/RSVP/location/join authority', async () => {
  const preview = await createCalendarLinkService(deps).preview(selection);
  expect(preview?.invitation.organizer).toBe(original.organizer);
  expect(preview?.original.location).toBe(original.location);
  expect(preview?.original.joinUrl).toBe(original.joinUrl);
  expect(preview?.target.organizer).toBe('self@example.test');
  expect(preview?.target.attendees).toEqual([]);
  expect(deps.saveAssociation).not.toHaveBeenCalled();
  expect(saved).toBeNull();
});
it('explicit confirmation saves only the association, and duplicate confirmation is idempotent', async () => {
  const service = createCalendarLinkService(deps);
  const preview = await service.preview(selection);
  expect((await service.confirm(selection, preview!.receipt)).status).toBe(
    'linked'
  );
  expect((await service.confirm(selection, preview!.receipt)).status).toBe(
    'linked'
  );
  expect(deps.saveAssociation).toHaveBeenCalledTimes(1);
  expect(saved?.target.externalEventId).toBe('google-private-hold');
  expect(saved?.invitation.uid).toBe(original.uid);
  expect(source).toEqual(original);
  expect(target).toEqual(hold);
});
it('rechecks both permissions and source revisions at confirmation', async () => {
  const service = createCalendarLinkService(deps);
  const preview = await service.preview(selection);
  source = { ...original, sequence: 3 };
  expect((await service.confirm(selection, preview!.receipt)).status).toBe(
    'changed'
  );
  source = original;
  target = null;
  expect((await service.confirm(selection, preview!.receipt)).status).toBe(
    'unavailable'
  );
  target = hold;
  source = null;
  expect((await service.confirm(selection, preview!.receipt)).status).toBe(
    'unavailable'
  );
  expect(deps.saveAssociation).not.toHaveBeenCalled();
});
it('does not borrow another account connection or accept a resolver mismatch', async () => {
  const service = createCalendarLinkService(deps);
  for (const identity of [
    { ...hold.identity, accountOwnerId: 'other' },
    { ...hold.identity, connectionId: null },
    { ...hold.identity, eventId: 'different' },
    { ...hold.identity, workspaceId: 'different' },
  ]) {
    target = { ...hold, identity };
    expect(await service.preview(selection)).toBeNull();
  }
  expect(deps.saveAssociation).not.toHaveBeenCalled();
});
it('detects changed location or conference authority without silently confirming stale preview', async () => {
  const service = createCalendarLinkService(deps);
  const preview = await service.preview(selection);
  source = { ...original, location: 'Updated organizer location' };
  expect((await service.confirm(selection, preview!.receipt)).status).toBe(
    'changed'
  );
  source = original;
  target = { ...hold, joinUrl: 'https://meet.google.com/synthetic' };
  expect((await service.confirm(selection, preview!.receipt)).status).toBe(
    'changed'
  );
  expect(deps.saveAssociation).not.toHaveBeenCalled();
});
it('fences actual concurrent distinct confirmations instead of overwriting the winner', async () => {
  deps.readTarget = vi.fn(async (_actor, _workspace, eventId) => ({
    ...hold,
    identity: {
      ...hold.identity,
      eventId,
      externalEventId: `provider-${eventId}`,
    },
  }));
  const service = createCalendarLinkService(deps);
  const second = { ...selection, eventId: 'other-hold' };
  const firstPreview = await service.preview(selection);
  const secondPreview = await service.preview(second);
  const results = await Promise.all([
    service.confirm(selection, firstPreview!.receipt),
    service.confirm(second, secondPreview!.receipt),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual([
    'conflict',
    'linked',
  ]);
  expect(saved?.target.eventId).toBe('hold');
  expect(deps.saveAssociation).toHaveBeenCalledTimes(2);
});
it('opens only the saved stable target after reauthorization and suppresses moved or revoked sources', async () => {
  const service = createCalendarLinkService(deps);
  const preview = await service.preview(selection);
  await service.confirm(selection, preview!.receipt);
  target = { ...hold, title: 'Renamed hold' };
  expect((await service.linkedTarget('actor', 'box', 'request'))?.title).toBe(
    'Renamed hold'
  );
  target = { ...hold, identity: { ...hold.identity, connectionId: 'moved' } };
  expect(await service.linkedTarget('actor', 'box', 'request')).toBeNull();
  target = null;
  expect(await service.linkedTarget('actor', 'box', 'request')).toBeNull();
  target = hold;
  source = { ...original, sequence: 1 };
  expect(await service.linkedTarget('actor', 'box', 'request')).toBeNull();
});

it('unlink deletes only own association after Calendar revocation and is idempotent', async () => {
  const service = createCalendarLinkService(deps);
  const preview = await service.preview(selection);
  await service.confirm(selection, preview!.receipt);
  target = null;
  const reads = vi.mocked(deps.readTarget).mock.calls.length;
  expect(
    (await service.unlink('actor', 'box', 'request', hold.identity)).status
  ).toBe('unlinked');
  expect(saved).toBeNull();
  expect(
    (await service.unlink('actor', 'box', 'request', hold.identity)).status
  ).toBe('unlinked');
  expect(deps.readTarget).toHaveBeenCalledTimes(reads);
  expect(source).toEqual(original);
});
it('unlink refuses a changed target and preserves a concurrently replaced association', async () => {
  const service = createCalendarLinkService(deps);
  const preview = await service.preview(selection);
  await service.confirm(selection, preview!.receipt);
  expect(
    (
      await service.unlink('actor', 'box', 'request', {
        ...hold.identity,
        eventId: 'other',
      })
    ).status
  ).toBe('changed');
  expect(saved?.target.eventId).toBe('hold');
  deps.saveAssociation = vi.fn(async () => false);
  expect(
    (await service.unlink('actor', 'box', 'request', hold.identity)).status
  ).toBe('conflict');
  expect(saved?.target.eventId).toBe('hold');
});

it('rejects a stale preview when another explicit association won before confirmation', async () => {
  deps.readTarget = vi.fn(async (_actor, _workspace, eventId) => ({
    ...hold,
    identity: {
      ...hold.identity,
      eventId,
      externalEventId: `provider-${eventId}`,
    },
  }));
  const service = createCalendarLinkService(deps);
  const stale = await service.preview(selection);
  const other = { ...selection, eventId: 'other-hold' };
  const winner = await service.preview(other);
  expect((await service.confirm(other, winner!.receipt)).status).toBe('linked');
  expect((await service.confirm(selection, stale!.receipt)).status).toBe(
    'changed'
  );
  expect(saved?.target.eventId).toBe('other-hold');
  expect(deps.saveAssociation).toHaveBeenCalledTimes(1);
  expect((await service.preview(selection))?.existingTarget?.eventId).toBe(
    'other-hold'
  );
});
