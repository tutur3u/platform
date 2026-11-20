import { parseAttendanceRoomId } from '../../../packages/realtime/src/meet/attendance-directory';
import {
  MEET_SERVICE_TTL_SECONDS,
  signMeetServiceCredential,
} from '../../../packages/realtime/src/meet/service-credential';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type EraseClaim =
  | { erase: 'meeting' }
  | { erase: 'subject'; userId: string }
  | { erase: 'subject'; guestId: string };

function claimFor(key: unknown): EraseClaim | null {
  if (key === 'meeting') return { erase: 'meeting' };
  if (typeof key !== 'string') return null;
  const [prefix, id, extra] = key.split(':');
  if (extra !== undefined || !id || !UUID.test(id)) return null;
  if (prefix === 'user') return { erase: 'subject', userId: id };
  if (prefix === 'guest') return { erase: 'subject', guestId: id };
  return null;
}

/**
 * Erases the requested claims from one room copy and returns the claim keys
 * the room accepted. The room applies an erase at most once per generation,
 * so a repeated call is safe. Invalid input erases nothing.
 */
export async function eraseAttendanceRoom(
  input: unknown,
  deps: {
    secret: string;
    nowMs: number;
    fetchRoom: (roomId: string, request: Request) => Promise<Response>;
  }
): Promise<{ acked: string[] }> {
  if (typeof input !== 'object' || input === null) return { acked: [] };
  const { roomId, generation, keys } = input as Record<string, unknown>;
  const room =
    typeof roomId === 'string' ? parseAttendanceRoomId(roomId) : null;
  if (
    typeof roomId !== 'string' ||
    !room ||
    !UUID.test(room.wsId) ||
    !UUID.test(room.meetingId) ||
    typeof generation !== 'number' ||
    !Number.isSafeInteger(generation) ||
    generation < 1 ||
    !Array.isArray(keys) ||
    keys.length < 1 ||
    keys.length > 3
  )
    return { acked: [] };
  const acked: string[] = [];
  for (const key of new Set(keys)) {
    const claim = claimFor(key);
    if (!claim) continue;
    const response = await deps
      .fetchRoom(
        roomId,
        new Request('https://meet.internal/class-service', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${signMeetServiceCredential(
              {
                aud: 'meet-service',
                purpose: 'attendance-erase',
                roomId,
                exp: Math.floor(deps.nowMs / 1000) + MEET_SERVICE_TTL_SECONDS,
                generation,
                ...claim,
              },
              deps.secret
            )}`,
          },
        })
      )
      .catch(() => null);
    if (response) void response.body?.cancel().catch(() => undefined);
    if (response?.ok) acked.push(key as string);
  }
  return { acked };
}
