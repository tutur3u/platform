import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Json } from '@tuturuuu/types';
import type { NormalizedSepayPayload } from './schemas';

type SepayAdminClient = TypedSupabaseClient;

export const SEPAY_STALE_RECEIVED_EVENT_TTL_MS = 5 * 60_000;

export async function claimRetriableWebhookEvent(input: {
  endpointId: string;
  existingEventId: string;
  existingStatus: 'failed' | 'received';
  payload: NormalizedSepayPayload;
  sbAdmin: SepayAdminClient;
  walletId: string;
  wsId: string;
}) {
  let query = input.sbAdmin
    .from('sepay_webhook_events')
    .update({
      created_transaction_id: null,
      endpoint_id: input.endpointId,
      failure_reason: null,
      payload: input.payload.raw as Json,
      processed_at: null,
      received_at: new Date().toISOString(),
      reference_code: input.payload.referenceCode,
      sepay_event_id: input.payload.eventId,
      status: 'received',
      transaction_date: input.payload.transactionDate,
      transfer_amount: input.payload.transferAmount,
      transfer_type: input.payload.transferType,
      wallet_id: input.walletId,
    })
    .eq('id', input.existingEventId)
    .eq('ws_id', input.wsId)
    .is('created_transaction_id', null);

  if (input.existingStatus === 'failed') {
    query = query.eq('status', 'failed');
  } else {
    query = query
      .eq('status', 'received')
      .lte(
        'received_at',
        new Date(Date.now() - SEPAY_STALE_RECEIVED_EVENT_TTL_MS).toISOString()
      );
  }

  const { data, error } = await query.select('id').maybeSingle();

  if (error) {
    throw new Error('Failed to claim SePay webhook event retry');
  }

  return data?.id ?? null;
}

export async function markEventFailed(input: {
  createdTransactionId?: string | null;
  eventId: string;
  failureReason: string;
  sbAdmin: SepayAdminClient;
}) {
  const { error } = await input.sbAdmin
    .from('sepay_webhook_events')
    .update({
      created_transaction_id: input.createdTransactionId ?? null,
      failure_reason: input.failureReason.slice(0, 1000),
      processed_at: new Date().toISOString(),
      status: 'failed',
    })
    .eq('id', input.eventId);

  if (error) {
    throw new Error('Failed to mark webhook event as failed');
  }
}

export function buildTransactionDescription(input: {
  code: string | null;
  content: string | null;
  description: string | null;
  referenceCode: string | null;
  transferType: 'in' | 'out';
}) {
  const description = [
    input.content,
    input.description,
    input.referenceCode,
    input.code,
  ]
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value));

  return description ?? `SePay ${input.transferType} transaction`;
}
