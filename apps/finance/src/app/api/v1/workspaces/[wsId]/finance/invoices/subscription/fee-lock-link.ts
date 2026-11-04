import { isFeeLockEnabled } from '@tuturuuu/finance-core/fee-lock/access';
import { isFeeLockMoneyInRange } from '@tuturuuu/internal-api/finance-fee-lock-contracts';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';

/** A locked fee revision a subscription invoice was pre-filled from (design §2.2). */
export type FeeLockInvoiceLink = {
  fee_lock_id: string;
  revision: number;
  suggested_total: number;
  /** The fee lock was reopened or locked again after this revision was suggested. */
  stale: boolean;
};

const feeLockRefSchema = z
  .object({ fee_lock_id: z.guid(), revision: z.int().min(1).max(100_000) })
  .strict();

const reject = (status: number, code: string, message: string) =>
  NextResponse.json({ code, message }, { status });

/**
 * Checks an optional `fee_lock_ref` before the invoice exists: the
 * ENABLE_FEE_LOCK flag must be on (400 otherwise), and the fee lock, its
 * locked revision and the customer and month must all match within the
 * workspace. A revision already used by another invoice is 409.
 */
type Ref = {
  wsId: string;
  ref: unknown;
  customerId: string;
  selectedMonth: string;
};
export async function resolveFeeLockRef(
  sbAdmin: TypedSupabaseClient,
  { wsId, ref, customerId, selectedMonth }: Ref
): Promise<FeeLockInvoiceLink | NextResponse | null> {
  if (ref === undefined || ref === null) return null;
  if (!(await isFeeLockEnabled(wsId))) {
    return reject(400, 'FEE_LOCK_DISABLED', 'fee_lock_ref is not available');
  }
  const parsed = feeLockRefSchema.safeParse(ref);
  if (!parsed.success) {
    return reject(400, 'FEE_LOCK_INVALID_INPUT', 'Invalid fee_lock_ref');
  }

  const { data: lock } = await sbAdmin
    .from('fee_locks')
    .select('id, student_id, period_month, status, revision')
    .eq('id', parsed.data.fee_lock_id)
    .eq('ws_id', wsId)
    .maybeSingle();
  const { data: revision } = lock
    ? await sbAdmin
        .from('fee_lock_revisions')
        .select('revision, total_amount')
        .eq('fee_lock_id', lock.id)
        .eq('ws_id', wsId)
        .eq('revision', parsed.data.revision)
        .maybeSingle()
    : { data: null };
  if (
    !lock ||
    !revision ||
    lock.student_id !== customerId ||
    lock.period_month !== `${selectedMonth}-01`
  ) {
    return reject(
      400,
      'FEE_LOCK_REF_MISMATCH',
      'fee_lock_ref does not match this student and month'
    );
  }
  if (!isFeeLockMoneyInRange(Number(revision.total_amount))) {
    return reject(400, 'FEE_LOCK_AMOUNT_OUT_OF_RANGE', 'Invalid fee lock');
  }

  const { data: used } = await sbAdmin
    .from('fee_lock_invoice_links')
    .select('id')
    .eq('ws_id', wsId)
    .eq('fee_lock_id', lock.id)
    .eq('fee_lock_revision', revision.revision)
    .maybeSingle();
  if (used) {
    return reject(
      409,
      'FEE_LOCK_ALREADY_INVOICED',
      'This locked fee is already invoiced'
    );
  }

  return {
    fee_lock_id: lock.id,
    revision: revision.revision,
    suggested_total: Number(revision.total_amount),
    stale: lock.status !== 'locked' || lock.revision !== revision.revision,
  };
}

/**
 * Writes the link and the `invoice_linked` event for a new invoice. Called
 * inside the route's compensating-cleanup block: on any error the caller
 * discards the invoice, and with it the link, in one transaction.
 */
type LinkArgs = {
  wsId: string;
  invoiceId: string;
  link: FeeLockInvoiceLink;
  chargedTotal: number;
  actorId: string;
};
export async function insertFeeLockLink(
  sbAdmin: TypedSupabaseClient,
  { wsId, invoiceId, link, chargedTotal, actorId }: LinkArgs
): Promise<NextResponse | null> {
  if (!isFeeLockMoneyInRange(chargedTotal) || chargedTotal < 0) {
    return reject(400, 'FEE_LOCK_AMOUNT_OUT_OF_RANGE', 'Invalid invoice total');
  }
  const { error: linkError } = await sbAdmin
    .from('fee_lock_invoice_links')
    .insert({
      ws_id: wsId,
      invoice_id: invoiceId,
      fee_lock_id: link.fee_lock_id,
      fee_lock_revision: link.revision,
      suggested_total: link.suggested_total,
      charged_total: chargedTotal,
      created_by: actorId,
    });
  if (linkError?.code === '23505') {
    return reject(
      409,
      'FEE_LOCK_ALREADY_INVOICED',
      'This locked fee is already invoiced'
    );
  }
  const { error: eventError } = linkError
    ? { error: linkError }
    : await sbAdmin.from('fee_lock_events').insert({
        ws_id: wsId,
        fee_lock_id: link.fee_lock_id,
        event_type: 'invoice_linked',
        actor_id: actorId,
        revision: link.revision,
        before_total: link.suggested_total,
        after_total: chargedTotal,
        metadata: { invoice_id: invoiceId, stale: link.stale },
      });
  if (eventError) {
    console.error('[fee-lock] invoice link failed', eventError.code);
    return reject(500, 'FEE_LOCK_LINK_FAILED', 'Error linking the locked fee');
  }
  return null;
}
