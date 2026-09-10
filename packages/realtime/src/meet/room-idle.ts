import type { MeetRoomSnapshot } from './room';
import { outcome } from './room-outcome';

/** The sender has closed its peer; forget only that device's old publication.
 * This is serialized with its publishes, but does not wait for a dead SFU peer.
 * Cloudflare expires the abandoned upstream tracks after RTP stops.
 */
export function retireIdlePublication(
  state: MeetRoomSnapshot,
  userId: string,
  sessionId: string
) {
  const closed = Object.values(state.tracks).filter(
    (track) => track.userId === userId && track.sessionId === sessionId
  );
  if (!closed.length) return outcome(state);
  return outcome(
    {
      ...state,
      tracks: Object.fromEntries(
        Object.entries(state.tracks).filter(
          ([, track]) =>
            track.userId !== userId || track.sessionId !== sessionId
        )
      ),
    },
    {
      broadcast: [{ type: 'track.closed', userId, sessionId, tracks: closed }],
    }
  );
}
