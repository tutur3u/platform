import 'server-only';
import { getMeetCallSession } from '@/features/call/lib/call-session';

/** Read-only, signed room policy lookup. No room is joined and no media is opened. */
export async function readMeetingRoomPolicy(
  input: {
    meetingId: string;
    wsId: string;
    userId: string;
    isHost?: boolean;
  },
  settings?: { shareNotes?: boolean; shareNotesAfterMeeting?: boolean }
) {
  const session = await getMeetCallSession({
    ...input,
    displayName: 'Participant',
    isHost: input.isHost ?? false,
    admission: 'lobby',
  });
  const endpoint = new URL(session.realtimeUrl);
  endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : 'http:';
  endpoint.pathname = '/room-state';
  endpoint.search = '';
  const response = await fetch(endpoint, {
    cache: 'no-store',
    method: settings ? 'PATCH' : 'GET',
    body: settings ? JSON.stringify(settings) : undefined,
    headers: {
      Authorization: `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('meet_room_policy_unavailable');
  return (await response.json()) as {
    canReadNotes: boolean;
    ended: boolean;
    settings?: { shareNotes?: boolean; shareNotesAfterMeeting?: boolean };
  };
}

export async function canReadSharedMeetingNotes(input: {
  meetingId: string;
  wsId: string;
  userId: string;
}) {
  return (await readMeetingRoomPolicy(input)).canReadNotes === true;
}
