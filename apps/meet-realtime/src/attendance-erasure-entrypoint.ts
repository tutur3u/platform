import { WorkerEntrypoint } from 'cloudflare:workers';
import { eraseAttendanceRoom } from './attendance-room-erase';
import type { MeetRoomEnv } from './room-do';

/**
 * RPC-only entrypoint for Cron Control's attendance erasure. A service
 * binding is the only caller; the public fetch handler does not route here.
 */
export class AttendanceErasure extends WorkerEntrypoint<MeetRoomEnv> {
  erase(input: unknown) {
    return eraseAttendanceRoom(input, {
      secret: this.env.MEET_REALTIME_TOKEN_SECRET,
      nowMs: Date.now(),
      fetchRoom: (roomId, request) =>
        this.env.MEET_ROOM.get(this.env.MEET_ROOM.idFromName(roomId)).fetch(
          request
        ),
    });
  }
}
