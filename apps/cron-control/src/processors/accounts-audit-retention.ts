import { withinDeadline } from './deadline';
import { postPrivateRpc } from './maintenance-rpc';
import type { ProcessorContext, ProcessorResult } from './types';

const batchSize = 500;
const maxPurgeCalls = 3;

function parsePurge(value: unknown) {
  if (typeof value !== 'object' || value === null) return null;
  const { deleted, fenced, lagging } = value as Record<string, unknown>;
  if (
    typeof deleted !== 'number' ||
    !Number.isInteger(deleted) ||
    deleted < 0 ||
    deleted > batchSize ||
    typeof fenced !== 'boolean' ||
    typeof lagging !== 'boolean'
  )
    return null;
  return { deleted, fenced, lagging };
}

export async function purgeAccountsAudit(
  context: ProcessorContext
): Promise<ProcessorResult> {
  const detail = { deleted: 0, reconciled: 0, lagging: 0 };
  const fenceOpen = () => withinDeadline(context, context.fence);
  try {
    if (!(await fenceOpen())) return { detail, outcome: 'stopped' };
    const reconciliation = await postPrivateRpc(context, 'accounts_reconcile', {
      p_limit: batchSize,
    });
    if (reconciliation.kind !== 'ok')
      return {
        detail,
        outcome:
          reconciliation.kind === 'http' && reconciliation.status < 500
            ? 'failed'
            : 'unknown',
      };
    const reconciled = reconciliation.value;
    if (
      typeof reconciled !== 'number' ||
      !Number.isInteger(reconciled) ||
      reconciled < 0 ||
      reconciled > batchSize
    )
      return { detail, outcome: 'unknown' };
    detail.reconciled = reconciled;
    for (let call = 0; call < maxPurgeCalls; call += 1) {
      if (!(await fenceOpen())) return { detail, outcome: 'stopped' };
      const result = await postPrivateRpc(context, 'accounts_purge', {
        p_limit: batchSize,
      });
      if (result.kind !== 'ok')
        return {
          detail,
          outcome:
            result.kind === 'http' && result.status < 500
              ? 'failed'
              : 'unknown',
        };
      const batch = parsePurge(result.value);
      if (!batch) return { detail, outcome: 'unknown' };
      if (batch.fenced) return { detail, outcome: 'stopped' };
      detail.deleted += batch.deleted;
      detail.lagging = Number(batch.lagging);
      if (batch.deleted < batchSize) break;
    }
  } catch {
    return { detail, outcome: 'unknown' };
  }
  if (detail.lagging)
    console.warn('Accounts audit retention is overdue by more than 24 hours');
  return { detail, outcome: 'ok' };
}
