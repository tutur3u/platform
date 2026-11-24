import 'server-only';
import { resolveTranscriptActionOwners } from '@tuturuuu/ai/meetings/transcript';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Json } from '@tuturuuu/types';
import { Effect, Schedule } from '@tuturuuu/utils/effect';
import { MeetAiError } from './access';
import { generateBilledMeetArtifact } from './artifact-billing';
import { admitMeetCredits } from './credit-admission';
import {
  formatSelfSegment,
  listSelfCoverage,
  listSelfSegments,
  readSelfRoster,
} from './self-v1-reads';
import { type MeetAiSessionRow, selfRpc } from './self-v1-rpc';
import { requireMeetTranscriptPayer } from './transcript-authority';
import { enforceMeetAiUsage } from './usage-limit';

const EMPTY_NOTES = {
  summary: '',
  decisions: [],
  actionItems: [],
  openQuestions: [],
};

/**
 * Final notes for a closed self_v1 session, generated only from the merged
 * segments the host may read. The host payer is billed, every provider
 * attempt is counted (at most 3 per session) before dispatch, and a session
 * without host or payer generates nothing. Notes never list anyone who did
 * not contribute, and say when coverage is partial.
 */
export async function generateSelfNotes(input: {
  db: TypedSupabaseClient;
  session: MeetAiSessionRow;
  meetingId: string;
  meetingStartedAt: string;
  timezone?: string;
}) {
  const { db, session, meetingId } = input;
  const hostId = session.billing_host_id;
  const payerWsId = session.billing_ws_id;
  if (!session.user_id || !hostId || !payerWsId)
    throw new MeetAiError(409, 'This session cannot generate notes');
  if (session.notes_status === 'completed') return { sessionId: session.id };
  await enforceMeetAiUsage({
    kind: 'notes',
    userId: hostId,
    meetingId,
    workspaceId: payerWsId,
  });
  if (
    session.notes_status === 'processing' &&
    session.notes_started_at &&
    Date.now() - Date.parse(session.notes_started_at) > 120_000
  )
    // A stalled attempt stays counted; only its claim is released.
    await db
      .from('meet_ai_sessions')
      .update({ notes_status: 'failed' })
      .eq('id', session.id)
      .eq('notes_status', 'processing')
      .eq('notes_started_at', session.notes_started_at);
  const attemptStartedAt = new Date().toISOString();
  const claimed = await db
    .from('meet_ai_sessions')
    .update({ notes_status: 'processing', notes_started_at: attemptStartedAt })
    .eq('id', session.id)
    .in('notes_status', ['pending', 'failed'])
    .select('id')
    .maybeSingle();
  if (claimed.error || !claimed.data)
    throw new MeetAiError(409, 'Notes are already processing');
  try {
    const [segments, coverage] = await Promise.all([
      listSelfSegments(db, session.id, hostId),
      listSelfCoverage(db, session.id, hostId),
    ]);
    const incomplete = coverage.some((row) => row.coverage !== 'contributing');
    const spoken = segments.filter((segment) => segment.transcript.trim());
    const transcript =
      (incomplete
        ? '[Coverage is partial: some participants did not contribute.]\n'
        : '') + spoken.map(formatSelfSegment).join('\n');
    if (transcript.length > 500_000)
      throw new MeetAiError(413, 'Transcript exceeds notes limit');
    let result: Awaited<ReturnType<typeof generateBilledMeetArtifact>> | null =
      null;
    if (spoken.length) {
      const { billingWorkspaceId } = await requireMeetTranscriptPayer({
        userId: hostId,
        wsId: payerWsId,
        meetingId,
      });
      const admission = await admitMeetCredits(
        hostId,
        meetingId,
        billingWorkspaceId
      );
      const attempt = await selfRpc.noteAttempt(db, session.id);
      result = await generateBilledMeetArtifact(
        {
          transcript,
          meetingStartedAt: input.meetingStartedAt,
          timezone: input.timezone,
        },
        {
          userId: hostId,
          meetingId,
          attemptId: `${session.id}:notes:${attempt}`,
        },
        admission
      );
    }
    if (result?.notes) {
      const roster = await readSelfRoster(db, spoken);
      result.notes.actionItems = resolveTranscriptActionOwners(
        result.notes.actionItems,
        roster
      );
    }
    const payload = {
      notes_status: 'completed',
      notes: { ...(result?.notes ?? EMPTY_NOTES), incomplete } as Json,
      notes_usage: (result?.usage as Json) ?? null,
      notes_cost_usd: result ? result.costUsd : 0,
    };
    const persisted = await Effect.runPromise(
      Effect.tryPromise({
        try: async () => {
          const saved = await db
            .from('meet_ai_sessions')
            .update(payload)
            .eq('id', session.id)
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
      .update({ notes_status: 'failed' })
      .eq('id', session.id)
      .eq('notes_started_at', attemptStartedAt)
      .eq('notes_status', 'processing');
    throw error;
  }
  return { sessionId: session.id };
}
