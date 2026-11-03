import type { RunOutcome } from '../ledger';
import { withinDeadline } from './deadline';
import { type PrivateRpcResult, postPrivateRpc } from './maintenance-rpc';
import type { ProcessorContext, ProcessorResult } from './types';

// AI Studio retention (365 days by default; see
// apps/docs/build/devops/ai-studio-retention.mdx). The database owns
// eligibility, exclusions and the per-call row bound; this loop adds the mode
// switch, the Cron Control stop fence, a time budget and a counts-only run
// log. The service takes injected dependencies and has no Worker imports.
//
// AI_STUDIO_RETENTION_MODE:
//   'off'     kill switch: no database call at all.
//   'delete'  bounded deletion batches.
//   'dry-run' counts only; no data writes; one counts-only log row.
//   anything else (including unset) is off and logged.

export type AiRetentionMode = 'delete' | 'dry-run' | 'off';

export const AI_RETENTION_BATCH_LIMIT = 500;
export const AI_RETENTION_MAX_BATCHES = 40;
// A batch statement may run for 20 seconds; never start one with less left.
export const AI_RETENTION_BATCH_RESERVE_MS = 25_000;
const MAX_COUNT = 1_000_000_000;

export const COUNT_RPC = 'count_ai_studio_retention';
export const BATCH_RPC = 'cleanup_ai_studio_retention_batch';
export const RECORD_RPC = 'record_ai_studio_retention_run';

const COUNTERS = {
  content_rows: 'contentRows',
  run_rows: 'runRows',
  cascade_content_rows: 'cascadeContentRows',
  step_rows: 'stepRows',
  usage_rows: 'usageRows',
  evaluation_links: 'evaluationLinks',
} as const;
const HELD = {
  held_in_flight_runs: 'heldInFlightRuns',
  held_current_month_runs: 'heldCurrentMonthRuns',
} as const;

type Status = 'budget_exhausted' | 'done' | 'failed' | 'stopped' | 'unknown';

export function aiRetentionMode(value: string | undefined): AiRetentionMode {
  if (value === 'delete' || value === 'dry-run' || value === 'off')
    return value;
  console.warn('AI Studio retention invalid mode; disabled');
  return 'off';
}

export interface AiRetentionDeps {
  /** Throws on network errors and on the run deadline. */
  call: (
    rpc: string,
    body: Record<string, unknown>
  ) => Promise<PrivateRpcResult>;
  /** False once Cron Control stopped the job. */
  fence: () => Promise<boolean>;
  mode: AiRetentionMode;
  timeLeft: () => number;
}

function count(value: unknown, max: number) {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= max
    ? value
    : null;
}

function isDeadline(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  return name === 'TimeoutError' || name === 'AbortError';
}

const OUTCOME: Record<Status, RunOutcome> = {
  budget_exhausted: 'ok',
  done: 'ok',
  failed: 'failed',
  stopped: 'stopped',
  unknown: 'unknown',
};

export async function runAiStudioRetention(
  deps: AiRetentionDeps
): Promise<ProcessorResult> {
  const detail: Record<string, number> = {
    batches: 0,
    contentRows: 0,
    runRows: 0,
    cascadeContentRows: 0,
    stepRows: 0,
    usageRows: 0,
    evaluationLinks: 0,
  };
  if (deps.mode === 'off')
    return { detail: { ...detail, off: 1 }, outcome: 'ok' };
  const dryRun = deps.mode === 'dry-run';
  if (dryRun) detail.dryRun = 1;

  // No in-run retry: each batch is one transaction keyed on the remaining
  // data, so the next daily run continues after any failure.
  async function call(
    rpc: string,
    body: Record<string, unknown>
  ): Promise<{ status: Status } | { value: Record<string, unknown> }> {
    let result: PrivateRpcResult;
    try {
      result = await deps.call(rpc, body);
    } catch (error) {
      return { status: isDeadline(error) ? 'unknown' : 'failed' };
    }
    if (result.kind === 'http') return { status: 'failed' };
    if (
      result.kind === 'invalid' ||
      typeof result.value !== 'object' ||
      result.value === null ||
      Array.isArray(result.value)
    )
      return { status: 'unknown' };
    return { value: result.value as Record<string, unknown> };
  }

  // Counts only: typed integer parameters, so the log cannot carry content.
  async function finish(status: Status): Promise<ProcessorResult> {
    const body: Record<string, unknown> = {
      p_mode: dryRun ? 'dry_run' : 'delete',
      p_status: status,
      p_batches: detail.batches,
    };
    for (const [key, name] of Object.entries(COUNTERS))
      body[`p_${key}`] = detail[name];
    for (const [key, name] of Object.entries(HELD))
      body[`p_${key}`] = dryRun ? (detail[name] ?? null) : null;
    const recorded = await call(RECORD_RPC, body);
    if ('status' in recorded) {
      console.error('AI Studio retention run log not written', {
        mode: deps.mode,
        status,
      });
      return { detail: { ...detail, recordFailed: 1 }, outcome: 'failed' };
    }
    const outcome = OUTCOME[status];
    if (outcome !== 'ok')
      console.error('AI Studio retention run did not complete', {
        mode: deps.mode,
        status,
        ...detail,
      });
    return { detail, outcome };
  }

  if (!(await deps.fence())) return { detail, outcome: 'stopped' };

  if (dryRun) {
    const response = await call(COUNT_RPC, {});
    if ('status' in response) return finish(response.status);
    for (const [key, name] of Object.entries({ ...COUNTERS, ...HELD })) {
      const value = count(response.value[key], MAX_COUNT);
      if (value === null) {
        for (const reset of Object.values(COUNTERS)) detail[reset] = 0;
        return finish('unknown');
      }
      detail[name] = value;
    }
    return finish('done');
  }

  for (let batch = 0; batch < AI_RETENTION_MAX_BATCHES; batch++) {
    if (!(await deps.fence())) return finish('stopped');
    if (deps.timeLeft() < AI_RETENTION_BATCH_RESERVE_MS) {
      detail.budgetExhausted = 1;
      return finish('budget_exhausted');
    }
    const response = await call(BATCH_RPC, {
      p_limit: AI_RETENTION_BATCH_LIMIT,
    });
    if ('status' in response) return finish(response.status);
    const { state } = response.value;
    const values: Partial<Record<keyof typeof COUNTERS, number>> = {};
    for (const key of Object.keys(COUNTERS) as (keyof typeof COUNTERS)[]) {
      const bounded = key === 'run_rows';
      const value = count(
        response.value[key],
        bounded ? AI_RETENTION_BATCH_LIMIT : MAX_COUNT
      );
      if (value === null) return finish('unknown');
      values[key] = value;
    }
    if (state !== 'more' && state !== 'done' && state !== 'locked')
      return finish('unknown');
    detail.batches++;
    for (const [key, name] of Object.entries(COUNTERS))
      detail[name] += values[key as keyof typeof COUNTERS] ?? 0;
    if (state === 'locked') {
      detail.locked = 1;
      return finish('failed');
    }
    if (state === 'done') return finish('done');
  }
  detail.budgetExhausted = 1;
  return finish('budget_exhausted');
}

/** Cron Control adapter: private RPCs with the service key, one run per slot. */
export function purgeAiStudioRetention(
  context: ProcessorContext
): Promise<ProcessorResult> {
  return runAiStudioRetention({
    call: (rpc, body) => postPrivateRpc(context, rpc, body),
    fence: () => withinDeadline(context, context.fence),
    mode: aiRetentionMode(context.env.AI_STUDIO_RETENTION_MODE),
    timeLeft: () => context.deadline - context.now(),
  });
}
