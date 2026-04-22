import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

type SepayAdminClient = TypedSupabaseClient;

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
