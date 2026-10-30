import 'server-only';
import { getMeetCallAccess } from '@tuturuuu/meet-core/features/call/lib/call-access';
import { callRoomService } from '@tuturuuu/meet-core/features/call/server/room-service';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { z } from 'zod';
import {
  MEET_CONSENT_DECISIONS,
  MEET_CONSENT_NOTICE_VERSION,
} from '../consent/notice';
import { MeetAiError, type MeetAiParams, meetAiAccess } from './access';
import {
  appendMeetConsentRecord,
  latestMeetConsents,
  MEET_CONSENT_MAX_DECISIONS,
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

async function meetingSession(
  db: TypedSupabaseClient,
  meetingId: string,
  sessionId: string
) {
  const { data: session, error } = await db
    .from('meet_ai_sessions')
    .select('id, created_at, ended_at')
    .eq('id', sessionId)
    .eq('meeting_id', meetingId)
    .maybeSingle();
  if (error) throw new MeetAiError(500, 'Session lookup failed');
  if (!session) throw new MeetAiError(404, 'Session not found');
  return session;
}

/**
 * The signed-in participant's own effective decision, for the client prompt.
 * An allow recorded under another notice version reads as no decision, so a
 * participant who allowed before a notice change is asked again. The server's
 * notice version is returned so an outdated client can tell it must reload.
 */
async function readOwnMeetConsent(request: Request, params: MeetAiParams) {
  const { wsId, meetingId } = await params.params;
  if (!z.uuid().safeParse(meetingId).success)
    throw new MeetAiError(400, 'Invalid meeting');
  const sessionId = new URL(request.url).searchParams.get('sessionId');
  if (!z.uuid().safeParse(sessionId).success)
    throw new MeetAiError(400, 'Invalid session');
  const access = await getMeetCallAccess(meetingId, 'Participant').catch(
    (error) => failure(error, 'Meeting access is unavailable')
  );
  if (z.uuid().safeParse(wsId).success && wsId !== access.meeting.ws_id)
    throw new MeetAiError(404, 'Meeting not found');
  await callRoomService(access, { action: 'read' }).catch((error) =>
    failure(error, 'Join the meeting first')
  );
  const db = await createAdminClient();
  const session = await meetingSession(db, meetingId, sessionId!);
  const own = await readMeetConsentRecords(db, session.id, access.user.id);
  return {
    available: own !== null,
    noticeVersion: MEET_CONSENT_NOTICE_VERSION,
    decision: own ? (latestMeetConsents(own)[access.user.id] ?? null) : null,
  };
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
  // Evidence must name the notice this server shows, never a client value.
  if (parsed.data.noticeVersion !== MEET_CONSENT_NOTICE_VERSION)
    throw new MeetAiError(
      409,
      'The consent notice has changed; reload to see the current notice',
      'MEET_AI_CONSENT_NOTICE_OUTDATED'
    );
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
  const session = await meetingSession(db, meetingId, parsed.data.sessionId);
  if (
    parsed.data.decision === 'allow' &&
    (session.ended_at ||
      Date.now() - Date.parse(session.created_at) > 3 * 60 * 60 * 1000)
  )
    throw new MeetAiError(409, 'Transcription has ended');
  const own = await readMeetConsentRecords(db, session.id, access.user.id);
  if (own === null)
    throw new MeetAiError(
      503,
      'Consent could not be recorded',
      'MEET_AI_CONSENT_UNAVAILABLE'
    );
  // Repeating the current decision appends nothing; changes are bounded. An
  // allow recorded under an older notice is not current and is written again.
  const last = own.at(-1);
  if (
    last?.decision === parsed.data.decision &&
    (last.decision !== 'allow' ||
      last.notice_version === MEET_CONSENT_NOTICE_VERSION)
  )
    return { recorded: false, decision: parsed.data.decision };
  if (own.length >= MEET_CONSENT_MAX_DECISIONS)
    throw new MeetAiError(429, 'Too many consent changes for this session');
  await appendMeetConsentRecord(db, {
    sessionId: session.id,
    userId: access.user.id,
    decision: parsed.data.decision,
    noticeVersion: MEET_CONSENT_NOTICE_VERSION,
  });
  return { recorded: true, decision: parsed.data.decision };
}

/** Host-only roster of the latest decision per account for one session. */
export async function readMeetConsentRoster(
  request: Request,
  params: MeetAiParams
) {
  if (new URL(request.url).searchParams.get('scope') === 'self')
    return readOwnMeetConsent(request, params);
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
    noticeVersion: MEET_CONSENT_NOTICE_VERSION,
    decisions: records ? latestMeetConsents(records) : {},
  };
}
