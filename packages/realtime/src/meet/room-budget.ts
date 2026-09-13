import type { MeetRealtimeRoomTrack } from './messages';
import type { MeetRealtimeRole, MeetRealtimeTokenPayload } from './primitives';
import type { MeetRoomSnapshot } from './room';
import { outcome } from './room-outcome';
import { failActiveRecording } from './room-recording';
import type { CloseTracksInput } from './sfu';

/** Operational preview ceilings, not a paid-plan entitlement or billing rate. */
export const MEET_MAX_ROOM_DURATION_MS = 2 * 60 * 60_000;
export const MEET_MAX_ROOM_PARTICIPANTS = 104;
export interface RoomBudget {
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
      expiresAt: now + MEET_MAX_ROOM_DURATION_MS,
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
  const budget = state.budget;
  if (!budget || !Number.isFinite(now) || now <= budget.accountedAt)
    return state;
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
    pendingPublications: Object.values(accounted.tracks),
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
      reply: [{ type: 'room.ended' }],
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
/** Keep closures durable until the provider confirms; retries must not lose them. */
export async function closeBudgetPublications(
  state: MeetRoomSnapshot,
  close: (input: CloseTracksInput) => Promise<unknown>,
  persistProgress?: (state: MeetRoomSnapshot) => Promise<void>
): Promise<MeetRoomSnapshot> {
  const pending = state.budget?.pendingPublications;
  if (!pending?.length) return state;
  let progress = state;
  for (const sessionId of new Set(pending.map((track) => track.sessionId))) {
    const tracks = pending.filter((track) => track.sessionId === sessionId);
    if (tracks.some((track) => !track.mid))
      throw new Error(
        'Meeting publication cleanup requires a provider track identifier'
      );
    const result = await close({
      sessionId,
      force: true,
      tracks: tracks.map((track) => ({ mid: track.mid })),
    });
    if (
      result &&
      typeof result === 'object' &&
      (('errorCode' in result && result.errorCode) ||
        ('tracks' in result &&
          Array.isArray(result.tracks) &&
          result.tracks.some(
            (track: unknown) =>
              track &&
              typeof track === 'object' &&
              'errorCode' in track &&
              track.errorCode
          )))
    )
      throw new Error('Meeting publication cleanup failed');
    progress = {
      ...progress,
      budget: {
        ...progress.budget!,
        pendingPublications: progress.budget!.pendingPublications!.filter(
          (track) => track.sessionId !== sessionId
        ),
      },
    };
    await persistProgress?.(progress);
  }
  return progress;
}

/** Expose measurements without leaking provider cleanup identifiers. */
export function roomBudgetSummary(state: MeetRoomSnapshot, now = Date.now()) {
  const budget = accountRoomTime(state, now).budget;
  if (!budget) return undefined;
  const { expiresAt, participantMilliseconds, maxPublishers, maxViewers } =
    budget;
  return { expiresAt, participantMilliseconds, maxPublishers, maxViewers };
}

/** Retain unresolved closures, with bounded provider retry traffic. */
export function deferBudgetCleanup(
  state: MeetRoomSnapshot,
  now = Date.now()
): MeetRoomSnapshot {
  if (!state.budget) return state;
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
