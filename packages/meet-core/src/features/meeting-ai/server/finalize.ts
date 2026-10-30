import 'server-only';
import { isParleySession } from '@tuturuuu/meet-core/parley/repository';
import { MEETING_APP } from '@tuturuuu/meet-core/runtime';
import { verifyMeetFinalizeToken } from '@tuturuuu/realtime/meet/finalization-token';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MeetAiError } from './access';
import { finishMeetAiSession } from './finish-session';
import { BILLING_UNRECONCILED } from './notes-billing';
import { notifyNotesReady } from './notes-notification';

/** Billed attempts that failed after the provider started. Past this, a human decides. */
export const MAX_AUTO_NOTES_FAILURES = 3;
const REJECTED = new Set([400, 402, 403, 413]);

export type FinalizeStatus = 'completed' | 'pending' | 'abandoned';

/**
 * Server-to-server finalize, called by the room Durable Object after a
 * transcription session or room ends. The bearer token is signed by the room
 * and carries the consent list; no cookie session is involved.
 *
 * Idempotent: a finished session answers `completed` without work, a session
 * another finisher holds answers `pending`, and the notes lease inside
 * finishMeetAiSession allows exactly one generation and one bill.
 */
export async function finalizeMeetAi(request: Request): Promise<{
  status: FinalizeStatus;
  generated?: boolean;
}> {
  if (MEETING_APP !== 'meet') throw new MeetAiError(404, 'Not found');
  const secret = process.env.MEET_REALTIME_TOKEN_SECRET?.trim();
  if (!secret) throw new MeetAiError(503, 'Meeting finalization unavailable');
  const bearer = /^Bearer (\S+)$/.exec(
    request.headers.get('authorization') ?? ''
  )?.[1];
  const claims = bearer && verifyMeetFinalizeToken(bearer, secret);
  if (!claims) throw new MeetAiError(401, 'Unauthorized');
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY)
    throw new MeetAiError(503, 'Meeting AI is not configured');

  const db = await createAdminClient({ noCookie: true });
  const { data: meeting, error: meetingError } = await db
    .from('workspace_meetings')
    .select('id, creator_id, time')
    .eq('id', claims.meetingId)
    .eq('ws_id', claims.wsId)
    .maybeSingle();
  if (meetingError) throw new MeetAiError(503, 'Meeting lookup failed');
  if (!meeting?.creator_id) return { status: 'abandoned' };
  if (await isParleySession(meeting.id)) return { status: 'abandoned' };
  const { data: session, error } = await db
    .from('meet_ai_sessions')
    .select('*')
    .eq('id', claims.sessionId)
    .eq('meeting_id', meeting.id)
    .maybeSingle();
  if (error) throw new MeetAiError(503, 'Session lookup failed');
  // Only the host's session is ever billed to the host.
  if (!session || session.user_id !== meeting.creator_id)
    return { status: 'abandoned' };
  if (session.notes_status === 'completed')
    return { status: 'completed', generated: false };
  if (session.notes_unpriced_attempts >= MAX_AUTO_NOTES_FAILURES)
    return { status: 'abandoned' };

  try {
    const outcome = await finishMeetAiSession({
      db,
      session,
      userId: session.user_id,
      meetingId: meeting.id,
      meetingStartedAt: meeting.time,
      consentedAccountIds: new Set(claims.consented),
      automatic: true,
    });
    if (outcome === 'generated')
      await notifyNotesReady(db, {
        wsId: claims.wsId,
        meetingId: meeting.id,
        sessionId: session.id,
        hostId: session.user_id,
        readerIds: claims.readers,
      }).catch(() => console.error('Meeting notes notification failed'));
    return { status: 'completed', generated: outcome === 'generated' };
  } catch (failure) {
    if (failure instanceof MeetAiError) {
      // A provider ran and its charge is unknown or already held by a run: never
      // generate again unattended. The host's Finish click reconciles.
      if (failure.code === BILLING_UNRECONCILED) return { status: 'abandoned' };
      // Audio still in flight or another finisher holds the lease: come back.
      if (failure.status === 409) return { status: 'pending' };
      // Retrying cannot change these: credits, size limits and the like.
      if (REJECTED.has(failure.status)) return { status: 'abandoned' };
    }
    throw failure;
  }
}
