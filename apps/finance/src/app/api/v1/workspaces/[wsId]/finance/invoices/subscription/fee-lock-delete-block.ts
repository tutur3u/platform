import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';

export const FEE_LOCK_LINKED_INVOICE_CODE = 'FEE_LOCK_LINKED_INVOICE';
/** Product copy (Phase 1 decision): a pre-filled invoice is never deleted silently. */
export const FEE_LOCK_LINKED_INVOICE_MESSAGE =
  'Hóa đơn này gắn với bảng chốt học phí; hãy mở lại bảng chốt trước khi xóa.';

/**
 * When an invoice delete is blocked by a foreign key (23503), answers 409 with
 * the fee-lock message if a fee-lock link is what blocks it; null otherwise.
 */
export async function feeLockLinkedInvoiceResponse(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  invoiceId: string
) {
  const { data: link } = await sbAdmin
    .from('fee_lock_invoice_links')
    .select('id')
    .eq('ws_id', wsId)
    .eq('invoice_id', invoiceId)
    .limit(1)
    .maybeSingle();
  return link
    ? NextResponse.json(
        {
          code: FEE_LOCK_LINKED_INVOICE_CODE,
          message: FEE_LOCK_LINKED_INVOICE_MESSAGE,
        },
        { status: 409 }
      )
    : null;
}
