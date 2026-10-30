import 'server-only';
import { getMeetCallSession } from '@tuturuuu/meet-core/features/call/lib/call-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { isMeetingNotesAdmin } from './notes-admin';

/** Read-only, signed room policy lookup. No room is joined and no media is opened. */
export async function readMeetingRoomPolicy(
  input: {
    meetingId: string;
    wsId: string;
    userId: string;
    isHost?: boolean;
  },
  settings?: {
    shareNotes?: boolean;
    shareNotesAfterMeeting?: boolean;
    publicLinkPreview?: boolean;
  }
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
  const policy = (await response.json()) as {
    canReadNotes: boolean;
    ended: boolean;
    lifecycleVersion?: number;
    settings?: {
      shareNotes?: boolean;
      shareNotesAfterMeeting?: boolean;
      publicLinkPreview?: boolean;
    };
  };
  // Sharing only narrows participant access; it never gates workspace admins.
  if (settings || policy.canReadNotes || input.isHost) return policy;
  try {
    const canRead = await isMeetingNotesAdmin({
      supabase: await createAdminClient({ noCookie: true }),
      wsId: input.wsId,
      userId: input.userId,
    });
    return canRead ? { ...policy, canReadNotes: true } : policy;
  } catch {
    return policy;
  }
}

export async function canReadSharedMeetingNotes(input: {
  meetingId: string;
  wsId: string;
  userId: string;
}) {
  return (await readMeetingRoomPolicy(input)).canReadNotes === true;
}
