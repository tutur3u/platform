import { MeetAiGenerationError } from '@tuturuuu/ai/meetings/failure';
import type { Json } from '@tuturuuu/types';
import { z } from 'zod';

/** A provider ran but its billed outcome is unknown: never rerun it automatically. */
export const BILLING_UNRECONCILED = 'billing_unreconciled';

// Rotation of an unattended billing identity needs two facts at once: the
// provider positively refused the request before doing any work, and the ledger
// durably settled the run as failed. Recording a zero-credit failure says nothing
// about what the provider did, so ambiguity is decided here, before settling.
const settledUncharged = new WeakSet<object>();
const outcomeUnknown = new WeakSet<object>();
const objectOf = (error: unknown) =>
  typeof error === 'object' && error !== null
    ? error
    : new Error(String(error));
export function markSettledUncharged(error: unknown): unknown {
  const tagged = objectOf(error);
  settledUncharged.add(tagged);
  return tagged;
}
export function markBillingUnknown(error: unknown): unknown {
  const tagged = objectOf(error);
  outcomeUnknown.add(tagged);
  return tagged;
}
export function isSettledUncharged(error: unknown) {
  return (
    typeof error === 'object' && error !== null && settledUncharged.has(error)
  );
}
export function isBillingUnknown(error: unknown) {
  return (
    typeof error === 'object' && error !== null && outcomeUnknown.has(error)
  );
}

/**
 * True only for a definitive refusal that produced no output: the provider
 * answered with an explicit HTTP error status, or no request was ever made
 * (missing configuration). Timeouts, aborts, network errors after the request
 * was sent and output validation errors are NOT definitive: the provider may
 * have done and billed the work.
 */
export function isDefinitiveProviderRejection(error: unknown) {
  if (!(error instanceof MeetAiGenerationError)) return false;
  if (error.reason === 'missing_configuration') return true;
  return (
    error.providerStatus !== null &&
    error.providerStatus >= 400 &&
    error.providerStatus <= 599 &&
    error.reason !== 'timeout' &&
    error.reason !== 'network_error' &&
    error.reason !== 'runtime_error'
  );
}

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

export function readNotesCheckpoint(
  notesUsage: unknown
): NotesCheckpoint | null {
  const parsed = checkpointSchema.safeParse(notesUsage);
  return parsed.success ? parsed.data.checkpoint : null;
}

export function notesCheckpointUsage(checkpoint: NotesCheckpoint): Json {
  return { checkpoint } as unknown as Json;
}
