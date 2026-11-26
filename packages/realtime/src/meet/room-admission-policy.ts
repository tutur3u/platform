import { activeMeetEvent } from './event-admission';
import type { MeetRealtimeTokenPayload } from './primitives';
import type { MeetRoomSnapshot } from './room';
import { pruneRemovedGuests } from './room-removed-guests';

export function isEarlyClosedWaiter(
  state: MeetRoomSnapshot,
  proof: number | undefined,
  nowMs: number
) {
  return (
    proof !== undefined &&
    proof === activeMeetEvent(state.earlyClosedEventExpiresAt, nowMs)
  );
}

/**
 * Whether a signed-in person is admitted without waiting: the host turned on
 * automatic admission, admission is open, and nobody removed or denied this
 * account. Guests are decided by `skipsLobbyAsVerifiedGuest`.
 */
export function skipsLobby(state: MeetRoomSnapshot, accountId: string) {
  return (
    !!state.settings?.skipLobby &&
    !state.settings.admissionClosed &&
    !state.deniedAutoAdmission?.includes(accountId) &&
    (state.deniedAutoAdmission?.length ?? 0) < 256
  );
}

/**
 * Whether an anonymous guest skips the lobby under "Admit everyone": the host
 * allows guests and admits automatically, admission is open, the guest passed
 * a human check, and nobody removed or denied this guest. Unverified guests
 * always wait. While any guest removal ban is active the room pauses guest
 * auto-admit, because a removed guest can verify again under a new id.
 */
export function skipsLobbyAsVerifiedGuest(
  state: MeetRoomSnapshot,
  token: Pick<
    MeetRealtimeTokenPayload,
    'guest' | 'guestTurnstileVerified' | 'accountId' | 'userId'
  >,
  nowMs: number
) {
  const id = token.accountId ?? token.userId;
  return (
    !pruneRemovedGuests(state.removedGuests, nowMs) &&
    token.guest === true &&
    token.guestTurnstileVerified === true &&
    !!state.settings?.allowAnonymousGuests &&
    !!state.settings.skipLobby &&
    !state.settings.admissionClosed &&
    !state.deniedAutoAdmission?.includes(id) &&
    (state.deniedAutoAdmission?.length ?? 0) < 256
  );
}

export function blockAutoAdmission(state: MeetRoomSnapshot, id: string) {
  const blocked = state.deniedAutoAdmission ?? [];
  return blocked.length >= 256 || blocked.includes(id)
    ? state
    : {
        ...state,
        deniedAutoAdmission: [...blocked, id],
      };
}
