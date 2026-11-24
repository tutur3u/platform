import { emptyRoomDeadline } from '../../../packages/realtime/src/meet/room-lifecycle';
import {
  earliestDeadline,
  runSelfOutboxDelivery,
  selfOutboxDeadline,
  selfSessionWake,
} from '../../../packages/realtime/src/meet/room-self-capture-delivery';
import {
  expireMiraOn,
  nextMiraOnExpiry,
} from '../../../packages/realtime/src/meet/room-mira-pending';
import { settleSelfCapture } from '../../../packages/realtime/src/meet/room-self-capture-state';
import type { MeetRoomEnv } from './room-env';
import type { RoomServiceState } from './room-service';

/**
 * Room-side fences applied before every write: expired Mira on choices that
 * were never confirmed are dropped, then per-speaker endings reach the outbox.
 */
function settleRoom(snapshot: RoomServiceState, now: number) {
  return settleSelfCapture(expireMiraOn(snapshot, now), now);
}

/** Per-speaker outbox hooks of the room Durable Object. */
export const selfOutbox = {
  /** Applies room-side endings to the legal outbox before every write. */
  settle: (snapshot: RoomServiceState) => settleRoom(snapshot, Date.now()),
  /**
   * The room's next wake: empty-room expiry, the next outbox delivery, or
   * the moment its per-speaker session stops being live.
   */
  wakeAt: (snapshot: RoomServiceState, env: MeetRoomEnv) =>
    earliestDeadline(
      emptyRoomDeadline(snapshot),
      selfOutboxDeadline(snapshot, env),
      selfSessionWake(snapshot, env),
      // An unconfirmed Mira on is dropped when it expires.
      nextMiraOnExpiry(snapshot)
    ),
  deliver: async (input: {
    env: MeetRoomEnv;
    roomName: string | undefined;
    now: number;
    read: () => RoomServiceState;
    commit: (snapshot: RoomServiceState) => Promise<void>;
  }) => {
    // An alarm with no other change still ends a session that is no longer
    // live, so its close and `end` entries are stored before the delivery.
    const current = input.read();
    const settled = settleRoom(current, input.now);
    if (settled !== current) await input.commit(settled);
    await runSelfOutboxDelivery({
      ...input,
      // A cold alarm knows the room only from its stored snapshot.
      roomName: input.roomName ?? input.read().roomName,
      secret: input.env.MEET_REALTIME_TOKEN_SECRET,
    });
  },
};
