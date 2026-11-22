// Type-only: a value import of './messages' here closes an import cycle
// through room-commands and leaves its schemas uninitialized.
import type {
  MeetRealtimeClientMessage,
  MeetRealtimeServerMessage,
} from './messages';
import { canMeetRealtimeManageParticipants } from './permissions';
import type { MeetRealtimeTokenPayload } from './primitives';
import type { MeetRoomOutcome, MeetRoomSnapshot } from './room';
import { denied, outcome } from './room-outcome';

/**
 * Every accepted request writes the pacing state and fans out to its targets,
 * so one sender costs the room at most one write and one fan-out a second,
 * the same bound reactions have. Clients send the leader's last surface after
 * the interval, so a dropped update is never the final one.
 */
export const MEET_NAVIGATION_UPDATE_INTERVAL_MS = 1000;
export const MEET_NAVIGATION_REQUEST_INTERVAL_MS = 1000;
/** Invitations from people who cannot manage participants reach others as prompts. */
export const MEET_NAVIGATION_INVITE_INTERVAL_MS = 5000;

/**
 * Follow and Summon relay one person's current view to chosen people in the
 * room. Hosts and co-hosts move people directly (`forced`); everyone else's
 * request reaches the targets as an invitation they may decline.
 */
export function applyRoomNavigation(
  state: MeetRoomSnapshot,
  message: MeetRealtimeClientMessage,
  token: MeetRealtimeTokenPayload,
  now: string
): MeetRoomOutcome | null {
  if (message.type !== 'navigation.request') return null;
  const sender = token.userId;
  if (!state.presence[sender])
    return denied(state, 'awaiting_admission', message.requestId);

  const forced = canMeetRealtimeManageParticipants(token);
  if (!forced && state.settings?.participantNavigation === false)
    return denied(state, 'permission_denied', message.requestId);

  const time = Date.parse(now);
  const stop = message.mode === 'follow.stop';
  // A stop is paced on its own clock, so it always lands right after a start
  // or an update. A repeat inside the interval adds nothing and is dropped.
  if (stop) {
    const lastStop = state.lastNavigationStopAt?.[sender];
    if (
      lastStop !== undefined &&
      time - lastStop < MEET_NAVIGATION_REQUEST_INTERVAL_MS
    )
      return outcome(state);
  } else {
    const update = message.mode === 'follow.update';
    const interval = update
      ? MEET_NAVIGATION_UPDATE_INTERVAL_MS
      : forced
        ? MEET_NAVIGATION_REQUEST_INTERVAL_MS
        : MEET_NAVIGATION_INVITE_INTERVAL_MS;
    const last = state.lastNavigationAt?.[sender];
    if (last !== undefined && time - last < interval)
      return update
        ? outcome(state)
        : denied(state, 'navigation_rate_limited', message.requestId);
  }

  // 'everyone' fans out like a broadcast; explicit lists are capped by the
  // message schema (MEET_NAVIGATION_MAX_TARGETS).
  const targets =
    message.targets === 'everyone'
      ? Object.keys(state.presence).filter((id) => id !== sender)
      : [...new Set(message.targets)].filter(
          (id) => id !== sender && !!state.presence[id]
        );
  if (!targets.length)
    return denied(state, 'navigation_no_targets', message.requestId);

  const event: MeetRealtimeServerMessage = {
    type: 'navigation',
    mode: message.mode,
    from: sender,
    ...(message.view ? { view: message.view } : {}),
    forced,
    createdAt: now,
  };
  // Both pacing maps keep only people still in the room.
  const paced = (
    current: Record<string, number> | undefined,
    stamp: boolean
  ) => {
    const next: Record<string, number> = stamp ? { [sender]: time } : {};
    for (const [userId, at] of Object.entries(current ?? {}))
      if (!(stamp && userId === sender) && state.presence[userId])
        next[userId] = at;
    return next;
  };
  return outcome(
    {
      ...state,
      lastNavigationAt: paced(state.lastNavigationAt, !stop),
      lastNavigationStopAt: paced(state.lastNavigationStopAt, stop),
    },
    { direct: targets.map((userId) => ({ userId, message: event })) }
  );
}
