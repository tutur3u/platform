import type { MeetRoomSnapshot } from './room';
import { denied, outcome } from './room-outcome';

/** The sender has closed its peer; forget only that device's old publication.
 * This is serialized with its publishes, but does not wait for a dead SFU peer.
 * Cloudflare expires the abandoned upstream tracks after RTP stops.
 */
export function retireIdlePublication(
  state: MeetRoomSnapshot,
  userId: string,
  sessionId: string
) {
  const key = `${encodeURIComponent(userId)}:${encodeURIComponent(sessionId)}`;
  const retiredSessions = { ...state.retiredSessions };
  if (
    !retiredSessions[key] &&
    Object.keys(retiredSessions).filter((id) =>
      id.startsWith(`${encodeURIComponent(userId)}:`)
    ).length >= 512
  )
    return denied(state, 'media_reset_required');
  retiredSessions[key] = true;
  const closed = Object.values(state.tracks).filter(
    (track) => track.userId === userId && track.sessionId === sessionId
  );
  if (!closed.length) return outcome({ ...state, retiredSessions });
  return outcome(
    {
      ...state,
      retiredSessions,
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
