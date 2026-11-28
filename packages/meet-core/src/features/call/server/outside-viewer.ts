import type { SignedInMeetCallAccess } from './room-service';

/**
 * A signed-in person outside the meeting's workspace (lobby admission). They
 * never receive other people's platform account ids; the host and workspace
 * members (open admission) do.
 */
export function isOutsideMeetViewer(
  access: Pick<SignedInMeetCallAccess, 'isHost' | 'admission'>
) {
  return !access.isHost && access.admission === 'lobby';
}
