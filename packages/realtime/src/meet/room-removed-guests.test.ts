import { describe, expect, it } from 'vitest';
import { createMeetRoomSnapshot } from './room';
import {
  isGuestRemovalBlocked,
  MEET_REMOVED_GUEST_MS,
  recordRemovedGuest,
} from './room-removed-guests';

const guestId = '2d6c8a1e-4b5f-4c3d-9e8f-0a1b2c3d4e5f';
const now = 1_700_000_000_000;

describe('removed anonymous guests', () => {
  it('blocks the same guest id until the removal window expires', () => {
    const recorded = recordRemovedGuest(
      createMeetRoomSnapshot(),
      guestId,
      now,
      true
    );
    expect(isGuestRemovalBlocked(recorded, guestId, now)).toEqual({
      blocked: true,
      retryAfterSeconds: MEET_REMOVED_GUEST_MS / 1000,
    });
    expect(
      isGuestRemovalBlocked(recorded, guestId, now + MEET_REMOVED_GUEST_MS)
    ).toEqual({ blocked: false });
    expect(
      isGuestRemovalBlocked(recorded, guestId, now + MEET_REMOVED_GUEST_MS - 1)
        .blocked
    ).toBe(true);
  });

  it('does not record removals for signed-in participants', () => {
    expect(
      recordRemovedGuest(createMeetRoomSnapshot(), guestId, now, false)
    ).not.toHaveProperty('removedGuests');
  });
});
