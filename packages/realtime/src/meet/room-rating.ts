import { z } from 'zod';
import type { MeetRealtimeTokenPayload } from './primitives';
import type { MeetRoomSnapshot } from './room';

export const roomRatingCommand = z.discriminatedUnion('action', [
  z.object({ action: z.literal('rating.read') }),
  z.object({
    action: z.literal('rating.set'),
    value: z.number().int().min(1).max(5),
  }),
]);
export type RoomRatingCommand = z.infer<typeof roomRatingCommand>;
export type RoomRating = { value: number; updatedAt: string };

/** Durable storage key: one private record per account, never in the snapshot. */
export const roomRatingKey = (accountId: string) => `room-rating:${accountId}`;

/**
 * Who may rate: the signed host, or an account the room admitted. Admission
 * is recorded by the room itself (`approved`) when a non-host joins, so a
 * workspace member who never attended cannot rate. Removing a participant
 * from the approved list also removes their ability to rate.
 */
export function canRateRoom(
  snapshot: Pick<MeetRoomSnapshot, 'approved'>,
  token: MeetRealtimeTokenPayload
) {
  if (!token.scopes.includes('meet:server')) return false;
  if (token.role === 'host') return true;
  const accountId = token.accountId ?? token.userId;
  return !!snapshot.approved?.[accountId];
}

/**
 * Applies a rating command to the actor's own record. A set replaces the
 * whole record, so repeating it only changes the stored value.
 */
export function applyRoomRating(
  current: RoomRating | undefined,
  command: RoomRatingCommand,
  now = new Date().toISOString()
): { next: RoomRating | undefined; body: { rating: number | null } } {
  if (command.action === 'rating.read')
    return { next: current, body: { rating: current?.value ?? null } };
  const next = { value: command.value, updatedAt: now };
  return { next, body: { rating: next.value } };
}

/** The subset of Durable Object storage the rating needs. */
export interface RoomRatingStorage {
  transaction<T>(
    run: (transaction: {
      get<V>(key: string): Promise<V | undefined>;
      put<V>(key: string, value: V): Promise<void>;
    }) => Promise<T>
  ): Promise<T>;
}

const headers = { 'Cache-Control': 'private, no-store' };

/**
 * Serves a rating command from the room's private storage, or returns
 * undefined for any other command. The record lives in its own key, outside
 * the snapshot that room and media events rewrite, is replaced inside one
 * storage transaction, and is only ever returned to the same account.
 */
export async function roomRatingResponse(
  storage: RoomRatingStorage,
  snapshot: Pick<MeetRoomSnapshot, 'approved'>,
  token: MeetRealtimeTokenPayload,
  input: unknown
): Promise<Response | undefined> {
  const parsed = roomRatingCommand.safeParse(input);
  if (!parsed.success) return;
  if (!canRateRoom(snapshot, token))
    return Response.json(
      { error: 'Only meeting attendees can rate this meeting' },
      { status: 403, headers }
    );
  const key = roomRatingKey(token.accountId ?? token.userId);
  return storage.transaction(async (transaction) => {
    const current = await transaction.get<RoomRating>(key);
    const result = applyRoomRating(current, parsed.data);
    if (result.next && result.next !== current)
      await transaction.put(key, result.next);
    return Response.json(result.body, { headers });
  });
}
