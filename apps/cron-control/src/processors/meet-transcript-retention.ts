import type { RunOutcome } from '../ledger';
import { withinDeadline } from './deadline';
import { type PrivateRpcResult, postPrivateRpc } from './maintenance-rpc';
import type { ProcessorContext, ProcessorResult } from './types';

// Meet transcript retention (365 days). The database owns the stop fence, the
// dry-run/delete mode, eligibility and the per-run (20 batches) and per-day
// (two runs) budgets; see private.purge_meet_transcripts_batch. This loop adds
// the Cron Control fence, a time budget and bounded retries. The service takes
// injected dependencies and has no Worker or framework imports.

export const MEET_RETENTION_BATCH_LIMIT = 500;
export const MEET_RETENTION_MAX_BATCHES = 20;
export const MEET_RETENTION_MAX_RETRIES = 3;
// A batch statement may run for 20 seconds; never start one with less left.
export const MEET_RETENTION_BATCH_RESERVE_MS = 25_000;
const RETRY_BACKOFF_MS = 1_000;
// Dry runs report whole-table totals; anything larger is not a valid summary.
const MAX_DRY_RUN_COUNT = 1_000_000_000;

const START_RPC = 'start_meet_transcript_purge_run';
export const BATCH_RPC = 'purge_meet_transcripts_batch';
const FINISH_RPC = 'finish_meet_transcript_purge_run';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface MeetRetentionDeps {
  /** Throws on network errors and on the run deadline. */
  call: (
    rpc: string,
    body: Record<string, unknown>
  ) => Promise<PrivateRpcResult>;
  /** False once Cron Control stopped the job. */
  fence: () => Promise<boolean>;
  sleep: (milliseconds: number) => Promise<void>;
  timeLeft: () => number;
}

type Call =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; outcome: 'failed' | 'stopped' | 'unknown' };

function isDeadline(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  return name === 'TimeoutError' || name === 'AbortError';
}

function count(value: unknown, max: number) {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= max
    ? value
    : null;
}

export async function runMeetTranscriptRetention(
  deps: MeetRetentionDeps
): Promise<ProcessorResult> {
  const detail: Record<string, number> = {
    batches: 0,
    chunks: 0,
    notes: 0,
    recordingTranscripts: 0,
    retries: 0,
  };

  // Every failed request is retried at most MEET_RETENTION_MAX_RETRIES times
  // per run. Each batch is one transaction keyed on the remaining data, so a
  // retry after a lost response continues instead of repeating work.
  async function call(
    rpc: string,
    body: Record<string, unknown>
  ): Promise<Call> {
    while (true) {
      let result: PrivateRpcResult | { kind: 'network' };
      try {
        result = await deps.call(rpc, body);
      } catch (error) {
        if (isDeadline(error)) return { ok: false, outcome: 'unknown' };
        result = { kind: 'network' };
      }
      if (result.kind === 'ok')
        return typeof result.value === 'object' &&
          result.value !== null &&
          !Array.isArray(result.value)
          ? { ok: true, value: result.value as Record<string, unknown> }
          : { ok: false, outcome: 'unknown' };
      if (result.kind === 'invalid') return { ok: false, outcome: 'unknown' };
      const retryable = result.kind === 'network' || result.status >= 500;
      if (!retryable || detail.retries >= MEET_RETENTION_MAX_RETRIES)
        return { ok: false, outcome: 'failed' };
      detail.retries++;
      await deps.sleep(RETRY_BACKOFF_MS * 2 ** (detail.retries - 1));
      if (deps.timeLeft() < MEET_RETENTION_BATCH_RESERVE_MS)
        return { ok: false, outcome: 'unknown' };
      if (!(await deps.fence())) return { ok: false, outcome: 'stopped' };
    }
  }

  // Best effort: the database abandons a run left running for 15 minutes.
  async function finish(runId: string, status: string, outcome: RunOutcome) {
    try {
      await deps.call(FINISH_RPC, { p_run_id: runId, p_status: status });
    } catch {
      // The deadline or network failed; abandonment terminates the run.
    }
    return { detail, outcome };
  }

  if (!(await deps.fence())) return { detail, outcome: 'stopped' };
  const start = await call(START_RPC, {});
  if (!start.ok) return { detail, outcome: start.outcome };
  const mode = start.value.mode;
  if (mode === 'fenced')
    return { detail: { ...detail, fenced: 1 }, outcome: 'ok' };
  if (mode === 'busy' || mode === 'daily_cap')
    return { detail: { ...detail, skipped: 1 }, outcome: 'ok' };
  const runId = start.value.run_id;
  if (
    (mode !== 'dry_run' && mode !== 'delete') ||
    typeof runId !== 'string' ||
    !UUID.test(runId)
  )
    return { detail, outcome: 'unknown' };
  if (mode === 'dry_run') detail.dryRun = 1;

  const max =
    mode === 'dry_run' ? MAX_DRY_RUN_COUNT : MEET_RETENTION_BATCH_LIMIT;
  for (let batch = 0; batch < MEET_RETENTION_MAX_BATCHES; batch++) {
    if (!(await deps.fence())) return finish(runId, 'stopped', 'stopped');
    if (deps.timeLeft() < MEET_RETENTION_BATCH_RESERVE_MS)
      return finish(runId, 'budget_exhausted', 'ok');
    const response = await call(BATCH_RPC, {
      p_run_id: runId,
      p_limit: MEET_RETENTION_BATCH_LIMIT,
    });
    if (!response.ok) return finish(runId, response.outcome, response.outcome);
    const { state } = response.value;
    if (state === 'fenced') return { detail, outcome: 'stopped' };
    if (state === 'terminal') return { detail, outcome: 'unknown' };
    const chunks = count(response.value.chunks, max);
    const notes = count(response.value.notes, max);
    const transcripts = count(response.value.recording_transcripts, max);
    if (
      chunks === null ||
      notes === null ||
      transcripts === null ||
      (mode === 'delete' &&
        chunks + notes + transcripts > MEET_RETENTION_BATCH_LIMIT) ||
      (state !== 'more' && state !== 'done' && state !== 'budget_exhausted')
    )
      return finish(runId, 'unknown', 'unknown');
    detail.batches++;
    detail.chunks += chunks;
    detail.notes += notes;
    detail.recordingTranscripts += transcripts;
    if (mode === 'dry_run') {
      const sessions = count(response.value.sessions, max);
      const workspaces = count(response.value.workspaces, max);
      if (sessions === null || workspaces === null)
        return { detail, outcome: 'unknown' };
      detail.sessions = sessions;
      detail.workspaces = workspaces;
    }
    if (state === 'budget_exhausted') detail.budgetExhausted = 1;
    if (state !== 'more') return { detail, outcome: 'ok' };
  }
  // The database ends a run at its 20th batch; this is a defensive stop.
  return finish(runId, 'budget_exhausted', 'ok');
}

/** Cron Control adapter: private RPCs with the service key, one run per slot. */
export function purgeMeetTranscripts(
  context: ProcessorContext
): Promise<ProcessorResult> {
  return runMeetTranscriptRetention({
    call: (rpc, body) => postPrivateRpc(context, rpc, body),
    fence: () => withinDeadline(context, context.fence),
    sleep:
      context.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds))),
    timeLeft: () => context.deadline - context.now(),
  });
}
