import 'server-only';
import { getMeetCallAccess } from '@tuturuuu/meet-core/features/call/lib/call-access';
import { callRoomService } from '@tuturuuu/meet-core/features/call/server/room-service';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { z } from 'zod';
import { MEET_CONSENT_DECISIONS } from '../consent/notice';
import { MeetAiError, type MeetAiParams, meetAiAccess } from './access';
import {
  appendMeetConsentRecord,
  latestMeetConsents,
  readMeetConsentRecords,
} from './consent-records';

const schema = z.object({
  sessionId: z.uuid(),
  decision: z.enum(MEET_CONSENT_DECISIONS),
  noticeVersion: z.string().trim().min(1).max(80),
});

function failure(error: unknown, fallback: string): never {
  if (error instanceof MeetAiError) throw error;
  const status =
    error && typeof error === 'object' && 'status' in error
      ? Number(error.status)
      : 0;
  throw new MeetAiError(status >= 400 && status < 500 ? status : 503, fallback);
}

/**
 * Append the signed-in participant's own decision to the legal consent log.
 * The actor is the verified app session, never a client-supplied id, and must
 * be admitted to the live room that owns the transcription session.
 */
export async function recordMeetConsent(
  request: Request,
  params: MeetAiParams
) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    throw new MeetAiError(403, 'Invalid origin');
  const { wsId, meetingId } = await params.params;
  if (!z.uuid().safeParse(meetingId).success)
    throw new MeetAiError(400, 'Invalid meeting');
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new MeetAiError(400, 'Invalid consent');
  const access = await getMeetCallAccess(meetingId, 'Participant').catch(
    (error) => failure(error, 'Meeting access is unavailable')
  );
  if (z.uuid().safeParse(wsId).success && wsId !== access.meeting.ws_id)
    throw new MeetAiError(404, 'Meeting not found');
  // The room refuses `read` unless this account is admitted (or hosts it).
  await callRoomService(access, { action: 'read' }).catch((error) =>
    failure(error, 'Join the meeting first')
  );
  const db = await createAdminClient();
  const { data: session, error } = await db
    .from('meet_ai_sessions')
    .select('id, created_at, ended_at')
    .eq('id', parsed.data.sessionId)
    .eq('meeting_id', meetingId)
    .maybeSingle();
  if (error) throw new MeetAiError(500, 'Session lookup failed');
  if (!session) throw new MeetAiError(404, 'Session not found');
  if (
    parsed.data.decision === 'allow' &&
    (session.ended_at ||
      Date.now() - Date.parse(session.created_at) > 3 * 60 * 60 * 1000)
  )
    throw new MeetAiError(409, 'Transcription has ended');
  await appendMeetConsentRecord(db, {
    sessionId: session.id,
    userId: access.user.id,
    decision: parsed.data.decision,
    noticeVersion: parsed.data.noticeVersion,
  });
  return { recorded: true, decision: parsed.data.decision };
}

/** Host-only roster of the latest decision per account for one session. */
export async function readMeetConsentRoster(
  request: Request,
  params: MeetAiParams
) {
  const { db, meetingId, user, canManage } = await meetAiAccess(
    request,
    params
  );
  if (!canManage) throw new MeetAiError(403, 'Only the host can see consent');
  const sessionId = new URL(request.url).searchParams.get('sessionId');
  if (!z.uuid().safeParse(sessionId).success)
    throw new MeetAiError(400, 'Invalid session');
  const { data: session, error } = await db
    .from('meet_ai_sessions')
    .select('id')
    .eq('id', sessionId!)
    .eq('meeting_id', meetingId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw new MeetAiError(500, 'Session lookup failed');
  if (!session) throw new MeetAiError(404, 'Session not found');
  const records = await readMeetConsentRecords(db, session.id);
  return {
    available: records !== null,
    decisions: records ? latestMeetConsents(records) : {},
  };
}
