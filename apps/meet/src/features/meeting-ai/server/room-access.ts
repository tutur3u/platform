import 'server-only';
import { getMeetCallSession } from '@/features/call/lib/call-session';

/** Read-only, signed room policy lookup. No room is joined and no media is opened. */
export async function canReadSharedMeetingNotes(input: {
  meetingId: string;
  wsId: string;
  userId: string;
}) {
  const session = await getMeetCallSession({
    ...input,
    displayName: 'Participant',
    isHost: false,
    admission: 'lobby',
  });
  const endpoint = new URL(session.realtimeUrl);
  endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : 'http:';
  endpoint.pathname = '/room-state';
  endpoint.search = '';
  const response = await fetch(endpoint, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${session.token}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('meet_room_policy_unavailable');
  const policy = (await response.json()) as { canReadNotes?: boolean };
  return policy.canReadNotes === true;
}
