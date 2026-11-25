import { z } from 'zod';
import type { MeetRealtimeTokenPayload } from './primitives';
import type { RoomServiceResult, RoomServiceState } from './room-service';

const boardAccessCommand = z.object({ action: z.literal('board.access') });

/**
 * The Tuturuuu Whiteboard asks the room before it lists boards or mints a
 * board ticket. It answers only for someone connected to the room right now,
 * the host, or a workspace member, and never for an ended room. A remembered
 * approval is not enough: a guest who left or was removed is refused, so
 * their board ticket cannot be renewed.
 *
 * The room passes `connected`, the room ids with an open socket. Presence
 * outlives a dropped socket for the reconnect grace period, so with it a
 * person whose connection dropped is refused at once instead of after the
 * grace period.
 */
export function applyRoomBoardAccess(
  snapshot: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown,
  connected?: ReadonlySet<string>
): RoomServiceResult | null {
  if (!boardAccessCommand.safeParse(input).success) return null;
  const account = token.accountId ?? token.userId;
  const present = Object.entries(snapshot.presence).some(
    ([userId, person]) =>
      (person.accountId ?? person.userId) === account &&
      (!connected || connected.has(userId))
  );
  const allowed =
    !snapshot.ended &&
    (present ||
      token.role === 'host' ||
      token.scopes.includes('meet:workspace-member'));
  return allowed
    ? { state: snapshot, body: { ok: true } }
    : { state: snapshot, body: { error: 'Board access denied' }, status: 403 };
}
