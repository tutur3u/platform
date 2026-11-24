import { emptyRoomDeadline } from '../../../packages/realtime/src/meet/room-lifecycle';
import {
  earliestDeadline,
  runSelfOutboxDelivery,
  selfOutboxDeadline,
} from '../../../packages/realtime/src/meet/room-self-capture-delivery';
import { settleSelfCapture } from '../../../packages/realtime/src/meet/room-self-capture-state';
import type { MeetRoomEnv } from './room-env';
import type { RoomServiceState } from './room-service';

/** Per-speaker outbox hooks of the room Durable Object. */
export const selfOutbox = {
  /** Applies room-side endings to the legal outbox before every write. */
  settle: (snapshot: RoomServiceState) => settleSelfCapture(snapshot),
  /** The room's next wake: empty-room expiry or the next outbox delivery. */
  wakeAt: (snapshot: RoomServiceState, env: MeetRoomEnv) =>
    earliestDeadline(
      emptyRoomDeadline(snapshot),
      selfOutboxDeadline(snapshot, env)
    ),
  deliver: (input: {
    env: MeetRoomEnv;
    roomName: string | undefined;
    now: number;
    read: () => RoomServiceState;
    commit: (snapshot: RoomServiceState) => Promise<void>;
  }) =>
    runSelfOutboxDelivery({
      ...input,
      // A cold alarm knows the room only from its stored snapshot.
      roomName: input.roomName ?? input.read().roomName,
      secret: input.env.MEET_REALTIME_TOKEN_SECRET,
    }),
};
