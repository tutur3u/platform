import { withinDeadline } from './deadline';
import { postPrivateRpc } from './maintenance-rpc';
import type { ProcessorContext, ProcessorResult } from './types';

const batchSize = 20;

export async function dispatchBillSplitReminders(
  context: ProcessorContext
): Promise<ProcessorResult> {
  if (!(await withinDeadline(context, context.fence))) {
    return { detail: {}, outcome: 'stopped' };
  }

  const result = await postPrivateRpc(
    context,
    'dispatch_finance_bill_split_reminders',
    { p_limit: batchSize }
  );
  if (result.kind === 'http') return { detail: {}, outcome: 'failed' };
  if (
    result.kind === 'invalid' ||
    typeof result.value !== 'object' ||
    result.value === null
  ) {
    return { detail: {}, outcome: 'unknown' };
  }
  const { delivered, canceled } = result.value as Record<string, unknown>;
  if (
    typeof delivered !== 'number' ||
    typeof canceled !== 'number' ||
    !Number.isSafeInteger(delivered) ||
    !Number.isSafeInteger(canceled) ||
    delivered < 0 ||
    canceled < 0 ||
    delivered + canceled > batchSize
  ) {
    return { detail: {}, outcome: 'unknown' };
  }
  return { detail: { delivered, canceled }, outcome: 'ok' };
}
