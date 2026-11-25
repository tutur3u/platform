import type { MeetRealtimeTokenPayload } from '../../../packages/realtime/src/meet';
import { readSharedTutorChat as readShared } from '../../../packages/realtime/src/meet/room-mira-share-storage';
import type { RoomServiceState } from './room-service';

export { MiraShareStorage } from '../../../packages/realtime/src/meet/room-mira-share-storage';

const headers = { 'Cache-Control': 'private, no-store' };

/** A Private Mira read of shared tutor chat, answered from room storage. */
export async function readSharedTutorChat(
  storage: Pick<DurableObjectStorage, 'get'>,
  snapshot: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  body: unknown,
  now = Date.now()
): Promise<Response | undefined> {
  const result = await readShared(storage, snapshot, token, body, now);
  return (
    result &&
    Response.json(result.body, { status: result.status ?? 200, headers })
  );
}
