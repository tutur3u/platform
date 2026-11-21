import { withinDeadline } from './deadline';
import { postPrivateRpc, type PrivateRpcResult } from './maintenance-rpc';
import type { ProcessorContext, ProcessorResult } from './types';

export const TASKS_RECURRENCE_JOB = 'tasks-recurrence-generation';
const MAX_BATCHES = 5;
const BATCH_SIZE = 32;
const MAX_CLAIM_BYTES = 64 * 1024;
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const terminalCounters = [
  'created',
  'held',
  'skipped',
  'failed',
  'stale',
  'expired',
] as const;

export function tasksRecurrenceMode(value: string | undefined) {
  return value === 'dry-run' || value === 'generate' ? value : 'off';
}

function asObject(result: PrivateRpcResult) {
  return result.kind === 'ok' &&
    typeof result.value === 'object' &&
    result.value !== null &&
    !Array.isArray(result.value)
    ? (result.value as Record<string, unknown>)
    : null;
}

function checkedInteger(value: unknown, max: number) {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= max
    ? value
    : null;
}

export async function generateRecurringTasks(
  context: ProcessorContext
): Promise<ProcessorResult> {
  const mode = tasksRecurrenceMode(context.env.TASKS_RECURRENCE_MODE);
  const detail = {
    calls: 0,
    claimed: 0,
    examined: 0,
    created: 0,
    held: 0,
    skipped: 0,
    failed: 0,
    stale: 0,
    expired: 0,
    downtime_skipped: 0,
  };
  const report = (outcome: ProcessorResult['outcome']): ProcessorResult => ({
    detail,
    outcome,
  });
  if (mode === 'off') return report('stopped');
  const slot =
    context.slot === undefined ? Number.NaN : Date.parse(context.slot) / 1000;
  if (!Number.isSafeInteger(slot) || slot <= 0 || slot % 900 !== 0)
    return report('failed');

  async function call(
    rpc: string,
    body: Record<string, unknown>,
    responseBytes?: number
  ) {
    if (!(await withinDeadline(context, context.fence))) return null;
    detail.calls += 1;
    try {
      return await postPrivateRpc(context, rpc, body, responseBytes);
    } catch {
      return { kind: 'invalid' } as const;
    }
  }

  if (mode === 'dry-run') {
    const result = await call('task_recurrence_probe', { p_slot: slot });
    if (!result) return report('stopped');
    const probe = asObject(result);
    if (!probe) return report(result.kind === 'http' ? 'failed' : 'unknown');
    const sampled = checkedInteger(probe.workspaces_sampled, 128);
    const due =
      sampled === null
        ? null
        : checkedInteger(probe.workspaces_with_due_series, sampled);
    if (due === null || sampled === null) return report('unknown');
    detail.examined = sampled;
    return {
      outcome: 'ok',
      detail: { ...detail, workspacesWithDueSeries: due },
    };
  }

  for (let batch = 1; batch <= MAX_BATCHES; batch++) {
    const result = await call(
      'task_recurrence_claim',
      { p_slot: slot, p_batch: batch },
      MAX_CLAIM_BYTES
    );
    if (!result) return report('stopped');
    if (result.kind === 'http') return report('failed');
    const claim = asObject(result);
    if (claim?.status === 'stopped' || claim?.status === 'stale')
      return report('stopped');
    if (claim?.status === 'finalized') break;
    if (
      claim?.status !== 'claimed' ||
      typeof claim.exhausted !== 'boolean' ||
      !Array.isArray(claim.tokens) ||
      claim.tokens.length > BATCH_SIZE ||
      !claim.tokens.every(
        (token) => typeof token === 'string' && TOKEN.test(token)
      ) ||
      new Set(claim.tokens).size !== claim.tokens.length
    )
      return report('unknown');
    const examined = checkedInteger(claim.examined, 128);
    if (examined === null || examined < claim.tokens.length)
      return report('unknown');

    detail.examined += examined;
    detail.claimed += claim.tokens.length;
    if (claim.tokens.length > 0) {
      const commit = await call('task_recurrence_commit', {
        p_slot: slot,
        p_batch: batch,
        p_items: claim.tokens.map((token: string) => ({ token })),
      });
      if (!commit) return report('stopped');
      if (commit.kind === 'http') return report('failed');
      const settled = asObject(commit);
      if (settled?.status === 'stopped' || settled?.status === 'stale')
        return report('stopped');
      if (settled?.status !== 'committed') return report('unknown');
      const counts = terminalCounters.map((key) =>
        checkedInteger(settled[key], BATCH_SIZE)
      );
      const downtime = checkedInteger(
        settled.downtime_skipped,
        BATCH_SIZE * 5000
      );
      if (
        downtime === null ||
        counts.some((count) => count === null) ||
        counts.reduce<number>((total, count) => total + (count ?? 0), 0) !==
          claim.tokens.length
      )
        return report('unknown');
      terminalCounters.forEach((key, index) => {
        detail[key] += counts[index] ?? 0;
      });
      detail.downtime_skipped += downtime;
    }
    if (claim.exhausted) break;
  }
  return report(detail.failed || detail.expired ? 'failed' : 'ok');
}
