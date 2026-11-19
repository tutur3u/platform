import type { MeetRoomSnapshot } from './room';

/** Anonymous guests removed by the host cannot rejoin with the same id for ten minutes. */
export const MEET_REMOVED_GUEST_MS = 10 * 60_000;
const MAX_REMOVED_GUESTS = 256;

export function meetRemovedGuestExpiresAt(nowMs: number) {
  return nowMs + MEET_REMOVED_GUEST_MS;
}

export function pruneRemovedGuests(
  removed: Record<string, number> | undefined,
  nowMs: number
) {
  if (!removed) return undefined;
  const next = Object.fromEntries(
    Object.entries(removed).filter(([, until]) => until > nowMs)
  );
  return Object.keys(next).length ? next : undefined;
}

export function isGuestRemovalBlocked(
  state: Pick<MeetRoomSnapshot, 'removedGuests'>,
  accountId: string,
  nowMs: number
) {
  const removed = pruneRemovedGuests(state.removedGuests, nowMs);
  const until = removed?.[accountId];
  if (!until) return { blocked: false as const };
  return {
    blocked: true as const,
    retryAfterSeconds: Math.max(1, Math.ceil((until - nowMs) / 1000)),
  };
}

export function recordRemovedGuest(
  state: MeetRoomSnapshot,
  accountId: string,
  nowMs: number,
  guest: boolean
): MeetRoomSnapshot {
  if (!guest) return state;
  const pruned = pruneRemovedGuests(state.removedGuests, nowMs) ?? {};
  if (
    Object.keys(pruned).length >= MAX_REMOVED_GUESTS &&
    pruned[accountId] === undefined
  )
    return state;
  return {
    ...state,
    removedGuests: {
      ...pruned,
      [accountId]: meetRemovedGuestExpiresAt(nowMs),
    },
  };
}
