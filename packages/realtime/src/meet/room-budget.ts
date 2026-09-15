import type { MeetRealtimeRoomTrack } from './messages';
import type { MeetRealtimeRole, MeetRealtimeTokenPayload } from './primitives';
import type { MeetRoomSnapshot } from './room';
import { outcome } from './room-outcome';
import { failActiveRecording } from './room-recording';
import { publicationCleanupKey } from './room-tracks';

export { closeBudgetPublications } from './room-provider-cleanup';

/** Free/legacy room duration; paid entitlements arrive in server-signed join tokens. */
export const MEET_MAX_ROOM_DURATION_MS = 2 * 60 * 60_000;
export const MEET_MAX_ROOM_PARTICIPANTS = 104;
export interface RoomBudget {
  historicalUsageUnknown?: boolean;
  expiresAt: number;
  accountedAt: number;
  participantMilliseconds: number;
  maxPublishers: number;
  maxViewers: number;
  pendingPublications?: MeetRealtimeRoomTrack[];
  cleanupAttempts?: number;
  nextCleanupAt?: number;
}
export function startRoomBudget(
  state: MeetRoomSnapshot,
  token: MeetRealtimeTokenPayload,
  now: number
): MeetRoomSnapshot {
  if (state.budget || !Number.isFinite(now)) return state;
  return {
    ...state,
    budget: {
      expiresAt:
        now +
        (token.limits.maxRoomDurationSeconds ??
          MEET_MAX_ROOM_DURATION_MS / 1000) *
          1000,
      accountedAt: now,
      participantMilliseconds: 0,
      maxPublishers: Math.min(32, token.limits.maxPublishers),
      maxViewers: Math.min(96, token.limits.maxViewers),
    },
  };
}
export function accountRoomTime(
  state: MeetRoomSnapshot,
  now: number
): MeetRoomSnapshot {
  if (!Number.isFinite(now)) return state;
  if (!state.budget && !state.ended && Object.keys(state.presence).length) {
    // Legacy presence omits departed participants: it cannot establish the first
    // admission time. End the room now instead of granting a fresh deadline.
    const expiresAt = now;
    state = {
      ...state,
      budget: {
        expiresAt,
        accountedAt: Math.min(now, expiresAt),
        participantMilliseconds: 0,
        historicalUsageUnknown: true,
        maxPublishers: 8,
        maxViewers: 96,
      },
    };
  }
  const budget = state.budget;
  if (!budget || now <= budget.accountedAt) return state;
  const until = Math.min(now, budget.expiresAt);
  const elapsed = Math.max(0, until - budget.accountedAt);
  return {
    ...state,
    budget: {
      ...budget,
      accountedAt: Math.max(budget.accountedAt, until),
      participantMilliseconds:
        budget.participantMilliseconds +
        elapsed * Object.keys(state.presence).length,
    },
  };
}
export function roomCapacityError(
  state: MeetRoomSnapshot,
  token: MeetRealtimeTokenPayload,
  userId = token.userId,
  role: MeetRealtimeRole = token.role
): string | null {
  const others = Object.values(state.presence).filter(
    (person) => person.userId !== userId
  );
  const limits = state.budget ?? token.limits;
  if (others.length >= MEET_MAX_ROOM_PARTICIPANTS)
    return 'participant_limit_reached';
  if (role === 'viewer')
    return others.filter((person) => person.role === 'viewer').length >=
      Math.min(96, limits.maxViewers)
      ? 'participant_limit_reached'
      : null;
  return others.filter((person) => person.role !== 'viewer').length >=
    Math.min(32, limits.maxPublishers)
    ? 'publisher_limit_reached'
    : null;
}
export function expireRoomBudget(state: MeetRoomSnapshot, now = Date.now()) {
  const accounted = accountRoomTime(state, now);
  if (accounted.ended || !accounted.budget || now < accounted.budget.expiresAt)
    return null;
  const budget = {
    ...accounted.budget,
    nextCleanupAt: 0,
    pendingPublications: [
      ...new Map(
        [
          ...(accounted.budget?.pendingPublications ?? []),
          ...Object.values(accounted.tracks),
        ].map((track) => [publicationCleanupKey(track), track])
      ).values(),
    ],
  };
  return outcome(
    {
      ...failActiveRecording(accounted, new Date(now).toISOString()),
      budget,
      ended: true,
      presence: {},
      waiting: {},
      tracks: {},
      lastReactionAt: {},
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
/** Expose measurements without leaking provider cleanup identifiers. */
export function roomBudgetSummary(state: MeetRoomSnapshot, now = Date.now()) {
  const budget = accountRoomTime(state, now).budget;
  if (!budget) return undefined;
  const { expiresAt, participantMilliseconds, maxPublishers, maxViewers } =
    budget;
  return {
    expiresAt,
    participantMilliseconds,
    maxPublishers,
    maxViewers,
    historicalUsageUnknown: budget.historicalUsageUnknown ?? false,
  };
}

/** Retain unresolved closures, with bounded provider retry traffic. */
export function deferBudgetCleanup(
  state: MeetRoomSnapshot,
  now = Date.now(),
  attemptedState?: MeetRoomSnapshot
): MeetRoomSnapshot {
  if (!state.budget) return state;
  const attempted = new Set(
    (attemptedState?.budget?.pendingPublications ?? []).map(
      publicationCleanupKey
    )
  );
  if (
    attemptedState &&
    state.budget.pendingPublications?.some(
      (track) => !attempted.has(publicationCleanupKey(track))
    )
  ) {
    return {
      ...state,
      budget: { ...state.budget, cleanupAttempts: 0, nextCleanupAt: 0 },
    };
  }
  const attempts = Math.min(32, (state.budget.cleanupAttempts ?? 0) + 1);
  return {
    ...state,
    budget: {
      ...state.budget,
      cleanupAttempts: attempts,
      nextCleanupAt: now + Math.min(3_600_000, 10_000 * 2 ** (attempts - 1)),
    },
  };
}
