import type { MeetRealtimeTokenPayload } from '../../../packages/realtime/src/meet';
import { roomRatingResponse } from '../../../packages/realtime/src/meet/room-rating';
import { personalReceiptStorage } from './personal-receipt-storage';
import type { RoomServiceState } from './room-service';

/**
 * Room-service commands backed by per-account storage keys instead of the
 * snapshot: personal chat receipts and the post-call rating. Each private
 * write also counts itself and its durable usage-counter write.
 */
export async function privateRoomStorage(
  storage: DurableObjectStorage,
  snapshot: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  body: unknown
): Promise<Response | undefined> {
  const personal = await personalReceiptStorage(storage, token, body);
  const rating = personal
    ? undefined
    : await roomRatingResponse(storage, snapshot, token, body);
  const wrote = personal ? personal.status !== 403 : rating?.wrote;
  if (wrote) {
    snapshot.usage!.httpCounterWrites =
      (snapshot.usage!.httpCounterWrites ?? 0) + 2;
    await storage.put('usage-http-requests', {
      requests: snapshot.usage!.httpRequests,
      writes: snapshot.usage!.httpCounterWrites,
    });
  }
  return personal ?? rating?.response;
}
