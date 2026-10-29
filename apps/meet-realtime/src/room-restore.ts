import { createRoomUsage } from '../../../packages/realtime/src/meet/room-usage';
import type { RoomServiceState } from './room-service';

/** Counters live in their own key so they survive a failed snapshot write. */
export function restoreUsageCounter(
  snapshot: RoomServiceState,
  counter: number | { requests: number; writes: number }
) {
  snapshot.usage ??= createRoomUsage();
  snapshot.usage.httpRequests = Math.max(
    snapshot.usage.httpRequests,
    typeof counter === 'number' ? counter : counter.requests
  );
  snapshot.usage.httpCounterWrites = Math.max(
    snapshot.usage.httpCounterWrites ?? 0,
    typeof counter === 'number' ? counter : counter.writes
  );
}

/** Returns true when a pending request had no start time and was stamped. */
export function stampPendingRequests(snapshot: RoomServiceState) {
  let stamped = false;
  for (const request of Object.values(snapshot.aiRequests ?? {})) {
    if (request.status === 'pending' && request.startedAt === undefined) {
      request.startedAt = Date.now();
      stamped = true;
    }
  }
  return stamped;
}
