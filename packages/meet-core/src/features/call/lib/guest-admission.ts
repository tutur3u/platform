import 'server-only';
import { getMeetCallSession } from './call-session';
import { MeetCallAccessError } from './call-access';
import type { MeetGuestCallAccess } from './guest-access';

type RemovalStatus = { blocked: boolean; retryAfterSeconds?: number };

async function readGuestRemovalStatus(
  access: MeetGuestCallAccess
): Promise<RemovalStatus> {
  const session = await getMeetCallSession({
    guest: true,
    displayName: access.displayName,
    isHost: false,
    admission: access.admission,
    meetingId: access.meeting.id,
    userId: access.user.id,
    wsId: access.meeting.ws_id,
    workspaceMember: false,
    service: true,
  });
  const url = new URL(session.realtimeUrl);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = '/room-service';
  url.search = '';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'guest.removal.status' }),
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  });
  if (!response.ok)
    throw new MeetCallAccessError(
      response.status,
      'Meeting connection is unavailable'
    );
  return response.json() as Promise<RemovalStatus>;
}

/** Host removal blocks the stable guest id on the room for ten minutes. */
export async function assertMeetGuestAdmissionAllowed(
  access: MeetGuestCallAccess
) {
  const status = await readGuestRemovalStatus(access);
  if (!status.blocked) return;
  throw new MeetCallAccessError(
    403,
    'You were removed from this meeting. Try again later.',
    'MEET_GUEST_REMOVED'
  );
}
