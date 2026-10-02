import { expect, it } from 'vitest';
import { projectMailCalendarTarget } from './calendar-link-adapter';
import { calendarPreviewFixture } from './calendar-link-fixture';

it('preserves actual account row, UID, source, occurrence and structured authority without pretending the account ID is the actor', () => {
  const preview = calendarPreviewFixture();
  const target = projectMailCalendarTarget('actor', 'ws', 'event', preview);
  expect(target?.identity.accountOwnerId).toBe('account-row');
  expect(target?.identity.actorUserId).toBe('actor');
  expect(target?.authority).toEqual(preview);
  expect(target?.location).toBe(
    'Meeting room, Street, City, State, Postal, Country'
  );
  expect(target?.joinUrl).toBe(preview.joinUrl);
});
it('rejects a different actor, source workspace/event or missing provider account', () => {
  for (const override of [
    { actorUserId: 'other' },
    { workspaceId: 'other' },
    { eventId: 'other' },
    { accountOwnerId: null },
    { sourceCalendarId: null },
  ]) {
    const preview = calendarPreviewFixture();
    preview.identity = { ...preview.identity, ...override };
    expect(
      projectMailCalendarTarget('actor', 'ws', 'event', preview)
    ).toBeNull();
  }
});
