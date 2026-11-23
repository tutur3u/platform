import { type ActorLimitBuckets, takeActorRateLimit } from './actor-rate-limit';
import type { MeetRealtimeServerMessage } from './messages';
import type { MeetRoomCommand } from './room';

export const LIVE_ACTIVITY_ACTIONS_PER_MINUTE = 20;
export const PENBOARD_ACTIONS_PER_MINUTE = 60;
export const LIVE_ACTIVITY_MAX_RATE_ACTORS = 256;

/** Count accepted mutations, even when the worker hibernates between them. */
export function nextLiveActivityLimit(
  previous: ActorLimitBuckets | undefined,
  actor: string,
  now: number,
  actionsPerMinute: number
): ActorLimitBuckets | undefined {
  const limits = Object.fromEntries(
    Object.entries(previous ?? {}).filter(([, bucket]) => now < bucket.resetAt)
  );
  const bucket = limits[actor];
  if (
    bucket
      ? bucket.count >= actionsPerMinute
      : Object.keys(limits).length >= LIVE_ACTIVITY_MAX_RATE_ACTORS
  )
    return undefined;
  return {
    ...limits,
    [actor]: {
      resetAt: bucket?.resetAt ?? now + 60_000,
      count: (bucket?.count ?? 0) + 1,
    },
  };
}

export function serializedMeetBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/** Budget attempts as well as accepted mutations so replay and refusal stay cheap. */
export function liveActivityAttemptRefusal({
  message,
  token,
}: MeetRoomCommand): MeetRealtimeServerMessage | undefined {
  let limit: number;
  let error: string;
  switch (message.type) {
    case 'activity.read':
    case 'penboard.read':
    case 'upskii.present.read':
      limit = 12;
      error = 'activity_read_rate_limited';
      break;
    case 'activity.command':
      limit = LIVE_ACTIVITY_ACTIONS_PER_MINUTE;
      error = 'activity_rate_limited';
      break;
    case 'penboard.draw':
    case 'penboard.undo':
    case 'penboard.clear':
      limit = PENBOARD_ACTIONS_PER_MINUTE;
      error = 'penboard_rate_limited';
      break;
    default:
      return undefined;
  }
  const actor = token.accountId ?? token.userId;
  if (
    takeActorRateLimit(
      `${message.type}:${token.roomId}:${actor}`,
      limit,
      60_000
    )
  )
    return undefined;
  return { type: 'error', error, requestId: message.requestId };
}
