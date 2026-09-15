import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import type { CallState } from './call-state';
import type { RemoteMedia } from './remote-streams';

/** Only the later device backs off, so two clients never mute each other. */
export function audioDeviceOrder(
  a: MeetRealtimePresence,
  b: MeetRealtimePresence
) {
  return (
    a.joinedAt.localeCompare(b.joinedAt) || a.userId.localeCompare(b.userId)
  );
}

/** Find an active device on the same verified account, preserving one primary mic. */
export function existingAccountAudio(state: CallState, joining = false) {
  const self = state.selfUserId ? state.participants[state.selfUserId] : null;
  if (!self?.accountId) return null;
  return (
    Object.values(state.participants)
      .filter(
        (peer) =>
          peer.userId !== self.userId &&
          peer.accountId === self.accountId &&
          peer.media.audioEnabled &&
          (joining || audioDeviceOrder(peer, self) < 0)
      )
      .sort(audioDeviceOrder)[0] ?? null
  );
}

/** Bound analysis to eight active microphones, never shared media. */
export function overlapPeers(state: CallState, remote: RemoteMedia) {
  const self = state.selfUserId ? state.participants[state.selfUserId] : null;
  if (!self) return [];
  const speaking = new Set(state.stage.activeSpeakerIds);
  return Object.values(state.participants)
    .filter(
      (peer) =>
        peer.userId !== self.userId &&
        peer.media.audioEnabled &&
        audioDeviceOrder(peer, self) < 0 &&
        remote[peer.userId]?.audio?.readyState === 'live'
    )
    .sort(
      (a, b) =>
        Number(speaking.has(b.userId)) - Number(speaking.has(a.userId)) ||
        audioDeviceOrder(b, a)
    )
    .slice(0, 8)
    .map((peer) => ({
      userId: peer.userId,
      track: remote[peer.userId]!.audio!,
    }));
}

/** Scope a manual override to the currently observed microphone pair. */
export function overlapPairKey(
  local: MediaStreamTrack | undefined,
  remote: MediaStreamTrack | undefined
) {
  return `${local?.id ?? ''}:${remote?.id ?? ''}`;
}
