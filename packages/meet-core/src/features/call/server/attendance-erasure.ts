import 'server-only';
import {
  MEET_SERVICE_TTL_SECONDS,
  signMeetServiceCredential,
  type MeetServiceClaims,
} from '@tuturuuu/realtime/meet/service-credential';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getMeetRealtimeTokenSecret,
  getMeetRealtimeUrl,
} from '../lib/call-session';

type Subject =
  | { userId: string; guestId?: never }
  | { guestId: string; userId?: never };

async function postRoomErasure(claims: MeetServiceClaims) {
  const endpoint = new URL(getMeetRealtimeUrl());
  endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : 'http:';
  endpoint.pathname = '/class-service';
  endpoint.search = '';
  const response = await fetch(endpoint, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${signMeetServiceCredential(
        claims,
        getMeetRealtimeTokenSecret()
      )}`,
    },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok && response.status !== 404)
    throw new Error('Meet attendance room copy was not erased');
}

function claims(
  roomId: string,
  extra: Omit<MeetServiceClaims, 'aud' | 'purpose' | 'roomId' | 'exp'>
): MeetServiceClaims {
  return {
    aud: 'meet-service',
    purpose: 'attendance-erase',
    roomId,
    exp: Math.floor(Date.now() / 1000) + MEET_SERVICE_TTL_SECONDS,
    ...extra,
  };
}

async function sessions() {
  const db = await createAdminClient({ noCookie: true });
  return db.schema('private').from('meet_attendance_sessions') as unknown as {
    select(columns: string): {
      eq(
        column: string,
        value: string
      ): Promise<{
        data: { meeting_id: string; ws_id: string }[] | null;
        error: { message?: string } | null;
      }> & {
        eq(
          column: string,
          value: string
        ): Promise<{
          data: { meeting_id: string; ws_id: string }[] | null;
          error: { message?: string } | null;
        }>;
      };
    };
    delete(): {
      eq(
        column: string,
        value: string
      ): Promise<{ error: { message?: string } | null }> & {
        eq(
          column: string,
          value: string
        ): Promise<{ error: { message?: string } | null }>;
      };
    };
  };
}

export async function eraseMeetAttendanceForMeeting(
  wsId: string,
  meetingId: string
) {
  await postRoomErasure(claims(`${wsId}:${meetingId}`, { erase: 'meeting' }));
  const { error } = await (
    await sessions()
  )
    .delete()
    .eq('meeting_id', meetingId)
    .eq('ws_id', wsId);
  if (error) throw error;
}

export async function eraseMeetAttendanceForWorkspace(wsId: string) {
  const db = await createAdminClient({ noCookie: true });
  const meetings = await db
    .from('workspace_meetings')
    .select('id')
    .eq('ws_id', wsId);
  if (meetings.error) throw meetings.error;
  for (const meeting of meetings.data ?? [])
    await postRoomErasure(
      claims(`${wsId}:${meeting.id}`, { erase: 'meeting' })
    );
  const { error } = await (await sessions()).delete().eq('ws_id', wsId);
  if (error) throw error;
}

export async function eraseMeetAttendanceSubject(subject: Subject) {
  const column = 'userId' in subject && subject.userId ? 'user_id' : 'guest_id';
  const id = column === 'user_id' ? subject.userId : subject.guestId;
  if (!id) throw new Error('Meet attendance subject is required');
  const listed = await (
    await sessions()
  )
    .select('meeting_id, ws_id')
    .eq(column, id);
  if (listed.error) throw listed.error;
  const rooms = new Map<string, { meetingId: string; wsId: string }>();
  for (const row of listed.data ?? [])
    rooms.set(`${row.ws_id}:${row.meeting_id}`, {
      meetingId: row.meeting_id,
      wsId: row.ws_id,
    });
  for (const room of rooms.values()) {
    await postRoomErasure(
      claims(`${room.wsId}:${room.meetingId}`, {
        erase: 'subject',
        ...(column === 'user_id' ? { userId: id } : { guestId: id }),
      })
    );
  }
  const { error } = await (await sessions()).delete().eq(column, id);
  if (error) throw error;
}
