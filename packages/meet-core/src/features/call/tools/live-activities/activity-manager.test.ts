import { expect, it } from 'vitest';
import { runsRoomActivities } from './activity-manager';

it('matches the room: hosts, participant managers and workspace co-hosts run activities', () => {
  expect(runsRoomActivities({ role: 'host', classRole: 'host' })).toBe(true);
  expect(
    runsRoomActivities({ role: 'speaker', canManageParticipants: true })
  ).toBe(true);
  // A workspace admin in someone else's meeting: a speaker with the co-host
  // class role and no participant management.
  expect(
    runsRoomActivities({
      role: 'speaker',
      canManageParticipants: false,
      classRole: 'cohost',
    })
  ).toBe(true);
  expect(
    runsRoomActivities({
      role: 'speaker',
      canManageParticipants: false,
      classRole: 'participant',
    })
  ).toBe(false);
  expect(runsRoomActivities({ role: 'viewer' })).toBe(false);
  expect(runsRoomActivities({})).toBe(false);
});
