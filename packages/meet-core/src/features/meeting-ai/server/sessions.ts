import {
  formatTranscriptChunk,
  hasErasedTranscript,
  readTranscriptSegments,
  resolveTranscriptActionOwners,
} from '@tuturuuu/ai/meetings/transcript';
import { MEETING_APP } from '../../../runtime';
import { generateBilledMeetArtifact } from './artifact-billing';
import { draftMeetAiNotes } from './draft-notes';
import { readMeetingRoomPolicy } from './room-access';
import { admitMeetCredits } from './credit-admission';
import { requireMeetTranscriptPayer } from './transcript-authority';
import { recordMeetTranscriptSession } from './transcript-fence';
import { readTranscriptRoster } from './transcript-roster';
import 'server-only';
import type { Json } from '@tuturuuu/types';
import { Effect, Schedule } from '@tuturuuu/utils/effect';
import { z } from 'zod';
import { MeetAiError, type MeetAiParams, meetAiAccess } from './access';
import {
  finishSelfSession,
  roomCaptureProtocol,
  startSelfSession,
} from './self-v1-session';
import { enforceMeetAiUsage } from './usage-limit';

export { readMeetAi } from './sessions-read';

const actionSchema = z.object({
  timezone: z
    .string()
    .max(100)
    .refine((zone) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: zone });
        return true;
      } catch {
        return false;
      }
    })
    .optional(),
  action: z.enum(['start', 'finish', 'sharing', 'draft']),
  shareNotes: z.boolean().optional(),
  shareNotesAfterMeeting: z.boolean().optional(),
  sessionId: z.uuid().optional(),
  expectedChunks: z.number().int().min(0).max(1080).optional(),
  captureIncomplete: z.boolean().optional(),
  protocol: z.enum(['legacy', 'self_v1']).optional(),
});
/**
 * [requireAiConsent] is the route's Mira AI data consent check for the
 * signed-in host. Capture and drafts check it first; finish stops capture
 * and checks it only before the transcript goes to Gemini for notes.
 */
export async function changeMeetAi(
  request: Request,
  params: MeetAiParams,
  requireAiConsent?: (userId: string) => Promise<void>
) {
  const { db, meetingId, wsId, user, meetingStartedAt } = await meetAiAccess(
    request,
    params,
    true
  );
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new MeetAiError(400, 'Invalid request');
  if (parsed.data.action === 'sharing') {
    await readMeetingRoomPolicy(
      { meetingId, wsId, userId: user.id, isHost: true },
      {
        shareNotes: parsed.data.shareNotes,
        shareNotesAfterMeeting: parsed.data.shareNotesAfterMeeting,
      }
    );
    return { updated: true };
  }
  if (MEETING_APP !== 'parley' && !process.env.GOOGLE_GENERATIVE_AI_API_KEY)
    throw new MeetAiError(503, 'Meeting AI is not configured');
  const { action, sessionId } = parsed.data;
  if (action !== 'finish') await requireAiConsent?.(user.id);
  if (action === 'draft') {
    if (!sessionId) throw new MeetAiError(400, 'Missing session');
    return draftMeetAiNotes({
      db,
      meetingId,
      wsId,
      userId: user.id,
      sessionId,
      meetingStartedAt,
      timezone: parsed.data.timezone,
    });
  }
  // The room's capture mode picks the protocol unless the host names one.
  if (
    action === 'start' &&
    (parsed.data.protocol ??
      (await roomCaptureProtocol(meetingId, user.id))) === 'self_v1'
  )
    return startSelfSession({ db, meetingId, wsId, hostId: user.id });
  if (action === 'start') {
    // Free accounts cannot start; checked before any session row exists.
    await requireMeetTranscriptPayer({ userId: user.id, wsId, meetingId });
    const { data, error } = await db
      .from('meet_ai_sessions')
      .insert({ meeting_id: meetingId, user_id: user.id })
      .select('id')
      .single();
    if (error)
      throw new MeetAiError(
        error.code === '23505' ? 409 : 500,
        'Could not start transcription'
      );
    try {
      await recordMeetTranscriptSession({
        meetingId,
        actorId: user.id,
        sessionId: data.id,
        active: true,
      });
    } catch (indicatorError) {
      // Without a visible indicator the session never captures; end it.
      await db
        .from('meet_ai_sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', data.id);
      throw indicatorError;
    }
    return { sessionId: data.id, protocol: 'legacy' as const };
  }
  if (!sessionId) throw new MeetAiError(400, 'Missing session');
  const { data: session, error } = await db
    .from('meet_ai_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('meeting_id', meetingId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw new MeetAiError(500, 'Session lookup failed');
  if (!session) throw new MeetAiError(404, 'Session not found');
  if (session.protocol === 'self_v1')
    return finishSelfSession({
      db,
      meetingId,
      wsId,
      hostId: user.id,
      session,
      meetingStartedAt,
      timezone: parsed.data.timezone,
      requireAiConsent: async () => requireAiConsent?.(user.id),
    });
  if (session.notes_status === 'completed') return { sessionId };
  if (
    session.notes_status === 'processing' &&
    session.notes_started_at &&
    Date.now() - Date.parse(session.notes_started_at) > 120_000
  ) {
    const recovered = await db
      .from('meet_ai_sessions')
      .update({
        notes_status: 'failed',
        notes_unpriced_attempts: session.notes_unpriced_attempts + 1,
      })
      .eq('id', sessionId)
      .eq('notes_status', 'processing')
      .eq('notes_started_at', session.notes_started_at)
      .select('id')
      .maybeSingle();
    if (recovered.error || !recovered.data)
      throw new MeetAiError(409, 'Notes are still processing');
    session.notes_unpriced_attempts++;
  }
  const ended = await db
    .from('meet_ai_sessions')
    .update({ ended_at: session.ended_at ?? new Date().toISOString() })
    .eq('id', sessionId);
  if (ended.error) throw new MeetAiError(500, 'Could not stop transcription');
  if (!session.ended_at)
    await recordMeetTranscriptSession({
      meetingId,
      actorId: user.id,
      sessionId,
      active: false,
    });
  await requireAiConsent?.(user.id);
  const { data: chunks, error: chunkError } = await db
    .from('meet_ai_chunks')
    .select('*')
    .eq('session_id', sessionId)
    .order('sequence')
    .range(0, 1080);
  if (chunks?.length === 1000) {
    const rest = await db
      .from('meet_ai_chunks')
      .select('*')
      .eq('session_id', sessionId)
      .order('sequence')
      .range(1000, 1080);
    if (rest.error) throw new MeetAiError(500, 'Transcript lookup failed');
    chunks.push(...rest.data);
  }
  if (chunkError) throw new MeetAiError(500, 'Transcript lookup failed');
  if (
    chunks.some(
      (chunk) =>
        chunk.status === 'processing' &&
        Date.now() - Date.parse(chunk.attempt_started_at ?? chunk.created_at) <
          90_000
    )
  ) {
    throw new MeetAiError(409, 'Audio is still processing');
  }
  // Notes-run limits per user, meeting and workspace, before the claim and
  // any provider call. Fails closed (503) when the limiter cannot decide.
  await enforceMeetAiUsage({
    kind: 'notes',
    userId: user.id,
    meetingId,
    workspaceId: wsId,
  });
  // Compare-and-set prevents concurrent finalizers from generating duplicate bills.
  const attemptStartedAt = new Date().toISOString();
  const claimed = await db
    .from('meet_ai_sessions')
    .update({
      notes_status: 'processing',
      notes_started_at: attemptStartedAt,
    })
    .eq('id', sessionId)
    .in('notes_status', ['pending', 'failed'])
    .select('id')
    .maybeSingle();
  if (claimed.error || !claimed.data)
    throw new MeetAiError(409, 'Notes are already processing');
  let providerStarted = false;
  try {
    const incomplete =
      parsed.data.captureIncomplete ||
      parsed.data.expectedChunks === undefined ||
      parsed.data.expectedChunks !== chunks.length ||
      chunks.some((chunk) => chunk.status !== 'completed');
    // Metadata and missing-audio warnings are not saved speech to bill for.
    const hasSavedSpeech = chunks.some((chunk) => {
      const segments = readTranscriptSegments(chunk.usage);
      return segments.length
        ? segments.some(
            (segment) =>
              !('erased' in segment) && Boolean(segment.transcript.trim())
          )
        : !hasErasedTranscript(chunk.usage) &&
            Boolean(chunk.transcript?.trim());
    });
    const transcript =
      (incomplete
        ? '[This transcript is incomplete. Audio was lost or capture was interrupted.]\n'
        : '') +
      [...chunks]
        .sort(
          (a, b) => a.start_seconds - b.start_seconds || a.sequence - b.sequence
        )
        .map((chunk) => formatTranscriptChunk(chunk))
        .join('\n');
    if (transcript.length > 500_000)
      throw new MeetAiError(413, 'Transcript exceeds notes limit');
    // Entitlement and credits are settled before the provider can start.
    const payer = hasSavedSpeech
      ? await requireMeetTranscriptPayer({ userId: user.id, wsId, meetingId })
      : null;
    const admission = payer
      ? await admitMeetCredits(user.id, meetingId, payer.billingWorkspaceId)
      : undefined;
    providerStarted = hasSavedSpeech;
    const result = payer
      ? await generateBilledMeetArtifact(
          {
            transcript,
            meetingStartedAt,
            timezone: parsed.data.timezone,
          },
          {
            userId: user.id,
            meetingId,
            attemptId: `${sessionId}:${attemptStartedAt}`,
          },
          admission
        )
      : null;
    if (result?.notes) {
      const roster = await readTranscriptRoster(db, chunks);
      result.notes.actionItems = resolveTranscriptActionOwners(
        result.notes.actionItems,
        roster
      );
    }
    // Reuse the settled output; only the idempotent CAS write is retried.
    const payload = {
      notes_status: 'completed',
      notes: {
        ...(result?.notes ?? {
          incomplete: false,
          summary: '',
          decisions: [],
          actionItems: [],
          openQuestions: [],
        }),
        incomplete: !!incomplete,
      } as Json,
      notes_usage: (result?.usage as Json) ?? null,
      notes_cost_usd: result ? result.costUsd : 0,
    };
    const persisted = await Effect.runPromise(
      Effect.tryPromise({
        try: async () => {
          const saved = await db
            .from('meet_ai_sessions')
            .update(payload)
            .eq('id', sessionId)
            .eq('notes_started_at', attemptStartedAt)
            .select('id')
            .maybeSingle();
          if (saved.error) throw new MeetAiError(500, 'Could not save notes');
          if (!saved.data)
            throw new MeetAiError(409, 'Notes finalization changed');
        },
        catch: (error) =>
          error instanceof MeetAiError
            ? error
            : new MeetAiError(500, 'Could not save notes'),
      }).pipe(
        Effect.retry({
          times: 2,
          schedule: Schedule.exponential('100 millis'),
          while: (error) => error.status === 500,
        }),
        Effect.either
      )
    );
    if (persisted._tag === 'Left') throw persisted.left;
  } catch (error) {
    await db
      .from('meet_ai_sessions')
      .update({
        notes_status: 'failed',
        notes_unpriced_attempts:
          session.notes_unpriced_attempts + (providerStarted ? 1 : 0),
      })
      .eq('id', sessionId)
      .eq('notes_started_at', attemptStartedAt)
      // An uncertain response must not demote an already committed result.
      .eq('notes_status', 'processing');
    throw error;
  }
  return { sessionId };
}
