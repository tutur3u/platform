import { withinDeadline } from './deadline';
import { readRpcResponse } from './maintenance-rpc';
import type { ProcessorContext, ProcessorResult } from './types';

const MAX_CLAIMS = 20;
const MAX_RESPONSE_BYTES = 4096;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuid.test(value);
}

function isClaim(value: unknown): value is {
  id: string;
  leaseId: string;
  idempotencyKey: string;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    isUuid(value.id) &&
    'leaseId' in value &&
    isUuid(value.leaseId) &&
    'idempotencyKey' in value &&
    isUuid(value.idempotencyKey)
  );
}

function boundedCount(value: unknown, max: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= max
  );
}

export async function consumeFleetIntents(
  context: ProcessorContext
): Promise<ProcessorResult> {
  const detail = { claims: 0, receipts: 0, voided: 0, purged: 0 };
  const result = (outcome: ProcessorResult['outcome']) => ({ outcome, detail });

  async function call(path: string, body: Record<string, unknown>) {
    if (!(await withinDeadline(context, context.fence)))
      return { state: 'stopped' };

    const response = await withinDeadline(context, () =>
      context.fetch(new URL(path, context.target.url), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${context.target.secret}`,
          'Content-Type': 'application/json',
          'User-Agent': context.userAgent,
        },
        body: JSON.stringify(body),
        redirect: 'manual',
        signal: context.signal,
      })
    );
    const parsed = await readRpcResponse(context, response, MAX_RESPONSE_BYTES);
    return parsed.kind === 'ok' &&
      parsed.value &&
      typeof parsed.value === 'object' &&
      'state' in parsed.value
      ? parsed.value
      : null;
  }

  try {
    const status = await call('status', {});
    if (status?.state === 'stopped') return result('stopped');
    if (
      status?.state !== 'active' ||
      !('generation' in status) ||
      typeof status.generation !== 'string' ||
      !/^[1-9][0-9]{0,18}$/.test(status.generation) ||
      !context.slot
    )
      return result('unknown');

    const slot = { slot: context.slot, generation: status.generation };
    const batch = await call('claim', slot);
    if (batch?.state === 'stopped') return result('stopped');
    if (batch?.state === 'slot_closed') return result('ok');
    if (
      batch?.state !== 'claimed' ||
      !('claims' in batch) ||
      !Array.isArray(batch.claims) ||
      batch.claims.length > MAX_CLAIMS ||
      !batch.claims.every(isClaim) ||
      new Set(batch.claims.map(({ id }) => id)).size !== batch.claims.length
    )
      return result('unknown');

    detail.claims = batch.claims.length;
    for (const { id, leaseId, idempotencyKey } of batch.claims) {
      const receipt = await call('receipt', {
        ...slot,
        id,
        leaseId,
        idempotencyKey,
        state: 'dry_run',
      });
      if (receipt?.state === 'stopped') return result('stopped');
      if (receipt?.state === 'slot_closed') return result('ok');
      if (receipt?.state === 'dry_run') detail.receipts++;
      else if (receipt?.state === 'voided') detail.voided++;
      else return result('unknown');
    }

    const purge = await call('purge', slot);
    if (purge?.state === 'stopped') return result('stopped');
    if (purge?.state === 'slot_closed') return result('ok');
    if (
      purge?.state !== 'purged' ||
      !('counts' in purge) ||
      !purge.counts ||
      typeof purge.counts !== 'object'
    )
      return result('unknown');
    const { counts } = purge;
    if (
      !('quotes' in counts) ||
      !boundedCount(counts.quotes, 334) ||
      !('events' in counts) ||
      !boundedCount(counts.events, 333) ||
      !('linkCodes' in counts) ||
      !boundedCount(counts.linkCodes, 333)
    )
      return result('unknown');
    detail.purged = counts.quotes + counts.events + counts.linkCodes;
    return result('ok');
  } catch {
    // The next slot reads committed SQL state before attempting more work.
    return result('unknown');
  }
}
