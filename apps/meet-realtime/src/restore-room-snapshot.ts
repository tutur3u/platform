import {
  createMeetRoomSnapshot,
  type MeetRealtimeTokenPayload,
  type MeetRealtimeServerMessage,
} from '../../../packages/realtime/src/meet';
import { upgradeLegacyGuestMarkers } from '../../../packages/realtime/src/meet/room-display-name';
import { recoverMeetMediaRoles } from '../../../packages/realtime/src/meet/room-media-role';
import { normalizeTranscriptionConsent } from '../../../packages/realtime/src/meet/transcription';
import { meetTrackKey } from '../../../packages/realtime/src/meet/room-tracks';
import { expireMiraOn } from '../../../packages/realtime/src/meet/room-mira-pending';
import type { RoomServiceState } from './room-service';

export function restoreRoomSnapshot(
  stored: RoomServiceState,
  sockets: WebSocket[],
  tokenOf: (socket: WebSocket) => MeetRealtimeTokenPayload | null
): {
  snapshot: RoomServiceState;
  migrated: boolean;
  closedPublications: MeetRealtimeServerMessage[];
} {
  const loaded = { ...createMeetRoomSnapshot(), ...stored };
  // A Mira on still awaiting its confirm is dropped when the room loads from
  // storage: the person keeps the previous state and asks again.
  const unstaged = expireMiraOn(loaded, 0, true);
  const consented = normalizeTranscriptionConsent(unstaged);
  const normalized = upgradeLegacyGuestMarkers(consented);
  const snapshot = recoverMeetMediaRoles(
    normalized,
    sockets.flatMap((socket) => {
      const token = tokenOf(socket);
      return socket.readyState === WebSocket.OPEN && token ? [token] : [];
    })
  );
  let migrated =
    unstaged !== loaded ||
    consented !== normalized ||
    normalized !== snapshot ||
    stored.transcriptionConsents !== snapshot.transcriptionConsents;
  for (const request of Object.values(snapshot.aiRequests ?? {})) {
    if (request.status === 'pending' && request.startedAt === undefined) {
      request.startedAt = Date.now();
      migrated = true;
    }
  }
  return {
    snapshot,
    migrated,
    closedPublications: recoveredPublicationClosures(snapshot),
  };
}

function recoveredPublicationClosures(
  snapshot: RoomServiceState
): MeetRealtimeServerMessage[] {
  const pending = snapshot.budget?.pendingPublications;
  if (!pending?.length) return [];
  const active = new Set(Object.values(snapshot.tracks).map(meetTrackKey));
  return pending
    .filter((track) => !active.has(meetTrackKey(track)))
    .map((track) => ({
      type: 'track.closed',
      userId: track.userId,
      sessionId: track.sessionId,
      tracks: [track],
    }));
}
