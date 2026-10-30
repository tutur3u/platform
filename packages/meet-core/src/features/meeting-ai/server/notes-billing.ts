import type { Json } from '@tuturuuu/types';
import { z } from 'zod';

/** A provider ran but its billed outcome is unknown: never rerun it automatically. */
export const BILLING_UNRECONCILED = 'billing_unreconciled';

/**
 * Durable record of a generation whose charge may have been taken. It lives in
 * the existing `notes_usage` jsonb until the notes are committed, and is never
 * returned to readers (only token counts are read from that column).
 */
const settlementSchema = z.object({
  runId: z.string().min(1),
  actualCredits: z.number(),
  providerCostUsd: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  latencyMs: z.number(),
  metadata: z.object({
    app: z.string(),
    source: z.string(),
    meetingId: z.string(),
    operation: z.string(),
  }),
});
const checkpointSchema = z.object({
  checkpoint: z.object({
    notes: z.record(z.string(), z.unknown()),
    usage: z.unknown(),
    costUsd: z.number().nullable(),
    settlement: settlementSchema,
  }),
});
export type NotesCheckpoint = z.infer<typeof checkpointSchema>['checkpoint'];

export function readNotesCheckpoint(notesUsage: unknown): NotesCheckpoint | null {
  const parsed = checkpointSchema.safeParse(notesUsage);
  return parsed.success ? parsed.data.checkpoint : null;
}

export function notesCheckpointUsage(checkpoint: NotesCheckpoint): Json {
  return { checkpoint } as unknown as Json;
}
