import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  type InventoryFinanceProvider,
  recordInventoryFinanceAdjustment,
  recordInventorySaleFinanceTransaction,
} from '../finance';
import type {
  SquareApiDispute,
  SquareApiRefund,
  SquareEnvironment,
} from './types';

type SquareReconciliationScope = {
  environment: SquareEnvironment;
  eventId?: string | null;
  wsId: string;
};

type CheckoutSource = {
  checkout_provider: string | null;
  currency: string;
  id: string;
};

function normalizeSquareProvider(
  provider: string | null
): InventoryFinanceProvider {
  return provider === 'square_pos' ? 'square_pos' : 'square_terminal';
}

async function findCheckoutByPaymentId({
  environment,
  paymentId,
  wsId,
}: {
  environment: SquareEnvironment;
  paymentId: string;
  wsId: string;
}) {
  const sbAdmin = (await createAdminClient()) as TypedSupabaseClient;
  const { data, error } = await sbAdmin
    .schema('private')
    .from('inventory_checkout_sessions')
    .select('id, currency, checkout_provider')
    .eq('ws_id', wsId)
    .eq('square_environment', environment)
    .eq('square_payment_id', paymentId)
    .maybeSingle();
  if (error) throw error;
  return data as CheckoutSource | null;
}

function assertMatchingCurrency(
  checkout: CheckoutSource,
  providerCurrency: string | undefined
) {
  if (
    providerCurrency &&
    providerCurrency.toUpperCase() !== checkout.currency.toUpperCase()
  ) {
    throw new Error('Square correction currency does not match checkout');
  }
}

export async function syncInventorySquareRefund(
  refund: SquareApiRefund,
  scope: SquareReconciliationScope
) {
  if (
    !refund.id ||
    !refund.payment_id ||
    !refund.amount_money?.amount ||
    refund.status?.toUpperCase() !== 'COMPLETED'
  ) {
    return false;
  }

  const checkout = await findCheckoutByPaymentId({
    environment: scope.environment,
    paymentId: refund.payment_id,
    wsId: scope.wsId,
  });
  if (!checkout) return false;
  assertMatchingCurrency(checkout, refund.amount_money.currency);
  const provider = normalizeSquareProvider(checkout.checkout_provider);

  await recordInventorySaleFinanceTransaction({ checkoutId: checkout.id });
  await recordInventoryFinanceAdjustment({
    amountMinor: refund.amount_money.amount,
    checkoutId: checkout.id,
    kind: 'refund',
    metadata: {
      eventId: scope.eventId ?? null,
      paymentId: refund.payment_id,
      squareStatus: refund.status,
    },
    occurredAt: refund.updated_at ?? refund.created_at,
    provider,
    providerReferenceId: refund.id,
    providerStatus: refund.status,
    sourceKey: `refund:${refund.id}`,
  });
  return true;
}

export async function syncInventorySquareDispute(
  dispute: SquareApiDispute,
  scope: SquareReconciliationScope
) {
  if (
    !dispute.id ||
    !dispute.disputed_payment_id ||
    !dispute.amount_money?.amount
  ) {
    return false;
  }

  const checkout = await findCheckoutByPaymentId({
    environment: scope.environment,
    paymentId: dispute.disputed_payment_id,
    wsId: scope.wsId,
  });
  if (!checkout) return false;
  assertMatchingCurrency(checkout, dispute.amount_money.currency);
  const provider = normalizeSquareProvider(checkout.checkout_provider);
  const state = dispute.state?.toUpperCase() || 'UNKNOWN';
  const metadata = {
    disputeState: state,
    eventId: scope.eventId ?? null,
    paymentId: dispute.disputed_payment_id,
    reason: dispute.reason ?? null,
  };

  await recordInventorySaleFinanceTransaction({ checkoutId: checkout.id });
  await recordInventoryFinanceAdjustment({
    amountMinor: dispute.amount_money.amount,
    checkoutId: checkout.id,
    kind: 'chargeback_hold',
    metadata,
    occurredAt: dispute.created_at,
    provider,
    providerReferenceId: dispute.id,
    providerStatus: state,
    sourceKey: `dispute:${dispute.id}:hold`,
  });

  if (state === 'WON') {
    await recordInventoryFinanceAdjustment({
      amountMinor: dispute.amount_money.amount,
      checkoutId: checkout.id,
      kind: 'chargeback_release',
      metadata,
      occurredAt: dispute.updated_at ?? dispute.created_at,
      provider,
      providerReferenceId: dispute.id,
      providerStatus: state,
      sourceKey: `dispute:${dispute.id}:release`,
    });
  }

  return true;
}
