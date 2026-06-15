import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getWorkspaceConfig } from '@tuturuuu/utils/workspace-helper';

type SaleBookingSession = {
  finance_transaction_id: string | null;
  status: string;
  total_amount: number;
};

export type SaleBookingDecision =
  | { book: false; reason: string }
  | { book: true };

/**
 * Pure guard: a completed sale books exactly one finance transaction, only when
 * it has a positive total and has not already been booked. Keeping this pure
 * makes the (financially sensitive) idempotency rules unit-testable.
 */
export function decideSaleBooking(
  session: SaleBookingSession
): SaleBookingDecision {
  if (session.status !== 'completed') {
    return { book: false, reason: 'not-completed' };
  }
  if (session.finance_transaction_id) {
    return { book: false, reason: 'already-booked' };
  }
  if (!session.total_amount || session.total_amount <= 0) {
    return { book: false, reason: 'zero-amount' };
  }
  return { book: true };
}

/**
 * A sale can span several products. We only attribute the transaction to a
 * finance category when every line resolves to the SAME category — otherwise we
 * leave it uncategorized rather than guess.
 */
export function resolveSharedFinanceCategoryId(
  categoryIds: Array<string | null | undefined>
): string | null {
  const present = categoryIds.filter((id): id is string => Boolean(id));
  if (present.length === 0) return null;
  const [first] = present;
  return present.every((id) => id === first) ? (first ?? null) : null;
}

export type RecordSaleResult = {
  booked: boolean;
  reason?: string;
  transactionId?: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Books revenue from a completed (real, Polar-paid) storefront sale into the
 * workspace finance ledger. Idempotent: the sale's `finance_transaction_id`
 * link guards against double-booking. Never throws — finance booking must not
 * break the payment webhook; it returns a result and logs softly instead.
 */
export async function recordInventorySaleFinanceTransaction({
  checkoutId,
}: {
  checkoutId: string;
}): Promise<RecordSaleResult> {
  try {
    const sbAdmin = await createAdminClient();
    const privateDb = sbAdmin.schema('private');

    // `finance_transaction_id` is cast through `never` so this file compiles
    // against any generated-types snapshot (the column ships in this feature's
    // migration; the typegen catches up out of band).
    const { data: session } = (await privateDb
      .from('inventory_checkout_sessions')
      .select(
        'id, ws_id, total_amount, currency, status, completed_at, polar_order_id, finance_transaction_id' as never
      )
      .eq('id', checkoutId)
      .maybeSingle()) as {
      data: {
        completed_at: string | null;
        finance_transaction_id: string | null;
        id: string;
        polar_order_id: string | null;
        status: string;
        total_amount: number;
        ws_id: string;
      } | null;
    };

    if (!session) return { booked: false, reason: 'session-not-found' };

    const decision = decideSaleBooking(session);
    if (!decision.book) return { booked: false, reason: decision.reason };

    const walletId = await getWorkspaceConfig(
      session.ws_id,
      'default_wallet_id'
    );
    if (!walletId) return { booked: false, reason: 'no-default-wallet' };
    if (!UUID_PATTERN.test(walletId)) {
      return { booked: false, reason: 'invalid-default-wallet' };
    }

    const { data: wallet, error: walletError } = (await privateDb
      .from('workspace_wallets')
      .select('id')
      .eq('id', walletId)
      .eq('ws_id', session.ws_id)
      .maybeSingle()) as {
      data: { id: string } | null;
      error: { message?: string } | null;
    };

    if (walletError) {
      return {
        booked: false,
        reason: walletError.message ?? 'wallet-validation-failed',
      };
    }

    if (!wallet) {
      return { booked: false, reason: 'invalid-default-wallet' };
    }

    const { data: lines } = await privateDb
      .from('inventory_checkout_lines')
      .select('product_id')
      .eq('checkout_session_id', checkoutId);

    const productIds = [
      ...new Set(
        (lines ?? [])
          .map((line) => line.product_id)
          .filter((id): id is string => Boolean(id))
      ),
    ];

    let categoryId: string | null = null;
    if (productIds.length > 0) {
      const { data: products } = await sbAdmin
        .from('workspace_products')
        .select('finance_category_id')
        .in('id', productIds);
      categoryId = resolveSharedFinanceCategoryId(
        (products ?? []).map((product) => product.finance_category_id)
      );
    }

    const { data: transaction, error } = await sbAdmin
      .from('wallet_transactions')
      .insert({
        amount: session.total_amount,
        category_id: categoryId,
        description: `Storefront sale ${session.polar_order_id ?? session.id}`,
        report_opt_in: true,
        taken_at: session.completed_at ?? new Date().toISOString(),
        wallet_id: wallet.id,
      })
      .select('id')
      .single();

    if (error || !transaction) {
      return { booked: false, reason: error?.message ?? 'insert-failed' };
    }

    // Link back, but only while still unbooked, so a concurrent webhook retry
    // can't double-book.
    await privateDb
      .from('inventory_checkout_sessions')
      .update({ finance_transaction_id: transaction.id } as never)
      .eq('id', checkoutId)
      .is('finance_transaction_id' as never, null);

    return { booked: true, transactionId: transaction.id };
  } catch (error) {
    return {
      booked: false,
      reason: error instanceof Error ? error.message : 'unexpected-error',
    };
  }
}
