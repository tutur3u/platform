import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

type SepayAdminClient = TypedSupabaseClient;

export async function markEventFailed(input: {
  eventId: string;
  failureReason: string;
  sbAdmin: SepayAdminClient;
}) {
  const { error } = await input.sbAdmin
    .from('sepay_webhook_events')
    .update({
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
  return (
    input.content ??
    input.description ??
    input.referenceCode ??
    input.code ??
    `SePay ${input.transferType} transaction`
  );
}
