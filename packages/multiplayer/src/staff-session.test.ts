import { expect, it } from 'vitest';
import { createRoom, joinRoom, memberOf, normalizeRoom, staff } from './index';

it('does not turn an email-only session into staff authority', () => {
  expect(staff({ email: 'staff@tuturuuu.com' })).toBe(false);
});
it('accepts only the server-verified staff assertion', () => {
  expect(staff({ email: 'staff@tuturuuu.com', staffVerified: true })).toBe(
    true
  );
});

it.each([true, false])(
  'retains a stored grant while rechecking the current identity: %s',
  (staffVerified) => {
    const now = Date.now();
    const owner = {
      id: 'owner',
      email: 'owner@tuturuuu.com',
      name: 'Owner',
      staffVerified: true,
      expires: now + 3600_000,
    };
    const colleague = {
      id: 'colleague',
      email: 'colleague@tuturuuu.com',
      name: 'Colleague',
      staffVerified: true,
      expires: owner.expires,
    };
    const room = createRoom(
      'room',
      owner,
      {
        title: 'Room',
        startsAt: null,
        endsAt: null,
        maxUsers: 4,
        teamCount: 1,
      },
      now
    );
    room.invites.push(colleague.email);
    joinRoom(room, colleague, 'team-1', false, now);
    const saved = room.members.find((member) => member.id === colleague.id);
    if (!saved) throw new Error('Fixture member missing');
    saved.admin = true;
    delete saved.staffVerified;
    normalizeRoom(room);
    expect(memberOf(room, { ...colleague, staffVerified }, now).admin).toBe(
      staffVerified
    );
    if (staffVerified) {
      joinRoom(room, colleague, 'team-1', false, now);
      expect(
        room.members.find((member) => member.id === colleague.id)?.staffVerified
      ).toBe(true);
    }
  }
);
