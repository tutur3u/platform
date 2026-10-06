import { z } from 'zod';
import type { MeetRealtimeTokenPayload } from './primitives';
import type { MeetRoomSnapshot } from './room';
import { accountRoomTime } from './room-budget';
import { endMeetRoom } from './room-ending';
import { outcome } from './room-outcome';
import type { RoomServiceState } from './room-service';

export const MEET_EMPTY_ROOM_TIMEOUT_MS = 5 * 60_000;
export interface MeetRoomLifecycle {
  version: number;
  hadConnection: boolean;
  ownerAccountId?: string;
  emptySince?: number;
}
export function emptyRoomDeadline(state: MeetRoomSnapshot) {
  const since = state.lifecycle?.emptySince;
  return !state.ended && since !== undefined
    ? since + MEET_EMPTY_ROOM_TIMEOUT_MS
    : undefined;
}

/** Presence grace is not a connected call. Only admitted OPEN sockets count. */
export function observeRoomConnections<T extends MeetRoomSnapshot>(
  state: T,
  connectedUserIds: ReadonlySet<string>,
  now: number,
  token?: MeetRealtimeTokenPayload
): T {
  const previous = state.lifecycle;
  const next: MeetRoomLifecycle = {
    version: 0,
    hadConnection: !!state.budget,
    ...previous,
  };
  if (token?.role === 'host' && !next.ownerAccountId)
    next.ownerAccountId = token.accountId ?? token.userId;
  const connected = Object.keys(state.presence).some((id) =>
    connectedUserIds.has(id)
  );
  if (connected) {
    next.hadConnection = true;
    if (next.emptySince !== undefined) {
      delete next.emptySince;
      next.version++;
    }
  } else if (
    !state.ended &&
    next.hadConnection &&
    next.emptySince === undefined
  ) {
    next.emptySince = now;
    next.version++;
  }
  if (
    previous?.version === next.version &&
    previous.hadConnection === next.hadConnection &&
    previous.ownerAccountId === next.ownerAccountId &&
    previous.emptySince === next.emptySince
  )
    return state;
  return { ...state, lifecycle: next };
}

export function expireEmptyRoom(
  state: RoomServiceState,
  expectedVersion: number | undefined,
  connectedUserIds: ReadonlySet<string>,
  now: number
) {
  const deadline = emptyRoomDeadline(state);
  if (
    deadline === undefined ||
    now < deadline ||
    expectedVersion !== state.lifecycle?.version ||
    Object.keys(state.presence).some((id) => connectedUserIds.has(id))
  )
    return null;
  return outcome(
    {
      ...endMeetRoom(accountRoomTime(state, now), new Date(now).toISOString()),
    },
    {
      broadcast: [{ type: 'room.ended' }],
      disconnect: [
        ...new Set([
          ...Object.keys(state.presence),
          ...Object.keys(state.waiting),
        ]),
      ],
    }
  );
}

const restoreCommand = z
  .object({
    action: z.literal('room.restore'),
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();
export function applyRoomRestore(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown,
  now = Date.now()
): { state: RoomServiceState; body: unknown; status?: number } | null {
  if (
    !input ||
    typeof input !== 'object' ||
    !('action' in input) ||
    input.action !== 'room.restore'
  )
    return null;
  const fail = (error: string, status: number) => ({
    state,
    body: { error },
    status,
  });
  if (token.role !== 'host' || !token.scopes.includes('meet:server'))
    return fail('Only the original room owner can restore', 403);
  const accountId = token.accountId ?? token.userId;
  if (
    state.lifecycle?.ownerAccountId &&
    state.lifecycle.ownerAccountId !== accountId
  )
    return fail('Only the original room owner can restore', 403);
  const parsed = restoreCommand.safeParse(input);
  if (!parsed.success) return fail('Invalid restore request', 400);
  if (
    !state.ended ||
    parsed.data.expectedVersion !== (state.lifecycle?.version ?? 0)
  )
    return fail('Meeting state changed', 409);
  if (
    !state.budget ||
    state.budget.historicalUsageUnknown ||
    now >= state.budget.expiresAt
  )
    return fail('Room resource allowance exhausted', 409);
  const version = (state.lifecycle?.version ?? 0) + 1;
  const clean = endMeetRoom(state, new Date(now).toISOString());
  return {
    state: {
      ...clean,
      ended: false,
      liveAssistant: undefined,
      liveShares: {},
      budget: {
        ...clean.budget!,
        nextCleanupAt: state.budget.nextCleanupAt,
        accountedAt: Math.max(state.budget.accountedAt, now),
      },
      lifecycle: {
        version,
        hadConnection: true,
        ownerAccountId: accountId,
        emptySince: now,
      },
    },
    body: { ended: false, lifecycleVersion: version },
  };
}
