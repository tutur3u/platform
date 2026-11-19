import { closeOpenAttendanceIntervals } from './attendance-ledger';
import { type MeetClassFeatures, meetClassFeatures } from './class-features';
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
  /** Room presence is a shadow estimate until SFU connection and bitrate evidence is available. */
  largeRoomPresenceMilliseconds?: number;
  maxParticipants?: number;
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
  if (!Number.isFinite(now)) return state;
  if (state.budget) {
    if (token.limits.maxParticipants === undefined) {
      if (state.budget.maxParticipants !== undefined) return state;
      const maxPublishers = Math.max(
        state.budget.maxPublishers,
        Math.min(MEET_MAX_ROOM_PARTICIPANTS, token.limits.maxPublishers)
      );
      const maxViewers = Math.max(
        state.budget.maxViewers,
        Math.min(
          token.mode === 'webinar' ? 250 : MEET_MAX_ROOM_PARTICIPANTS,
          token.limits.maxViewers
        )
      );
      if (
        maxPublishers === state.budget.maxPublishers &&
        maxViewers === state.budget.maxViewers
      )
        return state;
      return {
        ...state,
        budget: { ...state.budget, maxPublishers, maxViewers },
      };
    }
    return {
      ...state,
      budget: {
        ...state.budget,
        maxParticipants: Math.min(
          state.budget.maxParticipants ?? 100,
          token.limits.maxParticipants
        ),
        ...(state.budget.maxParticipants === undefined
          ? {
              maxPublishers: Math.min(
                token.limits.maxParticipants,
                token.limits.maxPublishers
              ),
              maxViewers: Math.min(
                token.mode === 'webinar' ? 250 : token.limits.maxParticipants,
                token.limits.maxViewers
              ),
            }
          : {}),
      },
    };
  }
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
      largeRoomPresenceMilliseconds: 0,
      maxParticipants: token.limits.maxParticipants,
      maxPublishers: Math.min(
        token.limits.maxParticipants ?? MEET_MAX_ROOM_PARTICIPANTS,
        token.limits.maxPublishers
      ),
      maxViewers: Math.min(
        token.mode === 'webinar'
          ? 250
          : (token.limits.maxParticipants ?? MEET_MAX_ROOM_PARTICIPANTS),
        token.limits.maxViewers
      ),
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
  const participants = Object.keys(state.presence).length;
  const participantTime = elapsed * participants;
  return {
    ...state,
    budget: {
      ...budget,
      ...(budget.largeRoomPresenceMilliseconds === undefined
        ? {}
        : {
            largeRoomPresenceMilliseconds:
              budget.largeRoomPresenceMilliseconds +
              (participants >= 50 ? participantTime : 0),
          }),
      accountedAt: Math.max(budget.accountedAt, until),
      participantMilliseconds: budget.participantMilliseconds + participantTime,
    },
  };
}
export function roomCapacityError(
  state: MeetRoomSnapshot,
  token: MeetRealtimeTokenPayload,
  userId = token.userId,
  role: MeetRealtimeRole = token.role
): string | null {
  if (state.presence[userId]?.role === role) return null;
  const others = Object.values(state.presence).filter(
    (person) => person.userId !== userId
  );
  const limits = state.budget ?? token.limits;
  const classroom =
    state.budget?.maxParticipants !== undefined ||
    token.limits.maxParticipants !== undefined;
  const cap = classroom
    ? Math.min(
        state.budget?.maxParticipants ?? 100,
        token.limits.maxParticipants ?? 100,
        state.settings?.maxParticipants ?? 100
      )
    : (state.settings?.maxParticipants ?? MEET_MAX_ROOM_PARTICIPANTS);
  if (
    role !== 'host' &&
    !state.presence[userId] &&
    state.settings?.admissionClosed &&
    (state.budget?.maxParticipants !== undefined ||
      token.limits.maxParticipants !== undefined)
  )
    return 'admission_closed';
  if (others.length >= cap) return 'participant_limit_reached';
  if (role === 'viewer')
    return others.filter((person) => person.role === 'viewer').length >=
      Math.min(
        token.mode === 'webinar'
          ? 250
          : (limits.maxParticipants ?? MEET_MAX_ROOM_PARTICIPANTS),
        limits.maxViewers
      )
      ? 'participant_limit_reached'
      : null;
  return others.filter((person) => person.role !== 'viewer').length >=
    Math.min(
      limits.maxParticipants ?? MEET_MAX_ROOM_PARTICIPANTS,
      limits.maxPublishers
    )
    ? 'publisher_limit_reached'
    : null;
}
export function expireRoomBudget(
  state: MeetRoomSnapshot,
  now = Date.now(),
  features: MeetClassFeatures = meetClassFeatures()
) {
  const accounted = accountRoomTime(state, now);
  if (accounted.ended || !accounted.budget || now < accounted.budget.expiresAt)
    return null;
  const leftAt = new Date(now).toISOString();
  const attendance = features.attendance
    ? closeOpenAttendanceIntervals(accounted.attendance, leftAt)
    : undefined;
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
      ...failActiveRecording(accounted, leftAt),
      ...(attendance === undefined ? {} : { attendance }),
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
    ...(budget.largeRoomPresenceMilliseconds === undefined
      ? {}
      : {
          largeRoomPresenceMilliseconds: budget.largeRoomPresenceMilliseconds,
        }),
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
