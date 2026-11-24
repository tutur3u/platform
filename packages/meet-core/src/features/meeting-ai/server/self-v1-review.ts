import 'server-only';
import { meetNotesSchema } from '@tuturuuu/ai/meetings/gemini';
import { resolveTranscriptActionOwners } from '@tuturuuu/ai/meetings/transcript';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  listSelfCoverage,
  listSelfSegments,
  readSelfNotes,
  readSelfRoster,
} from './self-v1-reads';

type SelfSessionRow = {
  id: string;
  created_at: string;
  cost_settled_usd?: number | null;
  notes_cost_usd?: number | null;
};

/**
 * The post-call view of self_v1 sessions, read only through the self_v1
 * contracts for this reader, so hidden, fenced, discarded and redacted
 * content never appears. Speaker names come from current profiles. Chunks
 * use the room-capture review shape so existing readers render them.
 */
export async function readSelfReview(
  db: TypedSupabaseClient,
  sessions: SelfSessionRow[],
  readerId: string
) {
  const results = await Promise.all(
    sessions.map(async (session) => {
      const [segments, notes, coverage] = await Promise.all([
        listSelfSegments(db, session.id, readerId),
        readSelfNotes(db, session.id, readerId),
        listSelfCoverage(db, session.id, readerId),
      ]);
      const roster = await readSelfRoster(db, [
        ...segments,
        ...coverage.map((row) => ({ account_id: row.account_id })),
      ]);
      const label = (accountId: string) =>
        roster.get(accountId) ?? 'Participant';
      const stored = notes?.notes_edited ?? notes?.notes ?? null;
      const parsed =
        notes?.notes_state === 'completed' && stored
          ? meetNotesSchema.safeParse(stored)
          : null;
      return {
        session: {
          id: session.id,
          createdAt: session.created_at,
          protocol: 'self_v1' as const,
          notesStatus: notes?.notes_state ?? 'unavailable',
          notes: parsed?.success
            ? {
                ...parsed.data,
                actionItems: resolveTranscriptActionOwners(
                  parsed.data.actionItems,
                  roster
                ),
              }
            : null,
          coverage: coverage.map((row) => ({
            accountId: row.account_id,
            label: label(row.account_id),
            contributing: row.coverage === 'contributing',
          })),
        },
        chunks: segments.map((segment) => ({
          id: segment.chunk_id,
          sessionId: session.id,
          sequence: segment.sequence,
          startSeconds: segment.start_ms / 1000,
          transcript: segment.transcript,
          erased: false,
          speaker: {
            accountId: segment.account_id,
            kind: 'microphone' as const,
            label: label(segment.account_id),
          },
          segments: [],
          status: 'completed',
        })),
        transcriptionCostUsd: Number(session.cost_settled_usd ?? 0),
        notesCostUsd: Number(session.notes_cost_usd ?? 0),
      };
    })
  );
  return {
    sessions: results.map((result) => result.session),
    chunks: results.flatMap((result) => result.chunks),
    transcriptionCostUsd: results.reduce(
      (sum, result) => sum + result.transcriptionCostUsd,
      0
    ),
    notesCostUsd: results.reduce((sum, result) => sum + result.notesCostUsd, 0),
  };
}
