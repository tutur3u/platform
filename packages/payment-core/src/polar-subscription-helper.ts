import type { Subscription } from '@tuturuuu/payment/polar';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import type { Database } from '@tuturuuu/types';
import type { WorkspaceSubscriptionProduct } from '@tuturuuu/types/db';
import { addDays } from 'date-fns';
import { syncProductToDatabase } from './polar-product-helper';
import {
  isAiCreditPackProduct,
  parseCreditPackTokens,
} from './polar-product-metadata';

const CREDIT_PACK_EXPIRY_DAYS = 60;

function privateSchema(supabase: TypedSupabaseClient) {
  return supabase.schema('private');
}

type SubscriptionProductPricing = Pick<
  WorkspaceSubscriptionProduct,
  'pricing_model' | 'price_per_seat'
>;

function isSubscriptionProductPricing(
  product: unknown
): product is SubscriptionProductPricing {
  return (
    !!product &&
    typeof product === 'object' &&
    'pricing_model' in product &&
    'price_per_seat' in product
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function lookupSubscriptionProduct(
  supabase: TypedSupabaseClient,
  productId: string
): Promise<SubscriptionProductPricing | null> {
  const { data: products, error: productError } = await privateSchema(supabase)
    .from('workspace_subscription_products')
    .select('pricing_model, price_per_seat')
    .eq('id', productId)
    .limit(2);

  if (productError) {
    throw new Error(
      `Subscription product lookup error for ${productId}: ${productError.message}`
    );
  }

  if ((products?.length ?? 0) > 1) {
    throw new Error(
      `Subscription product lookup error for ${productId}: multiple product rows matched`
    );
  }

  return products?.[0] ?? null;
}

async function resolveSubscriptionProduct(
  supabase: TypedSupabaseClient,
  subscription: Subscription
): Promise<SubscriptionProductPricing> {
  const existingProduct = await lookupSubscriptionProduct(
    supabase,
    subscription.product.id
  );

  if (existingProduct) return existingProduct;

  try {
    const syncedProduct = await syncProductToDatabase(
      supabase,
      subscription.product
    );

    if (isSubscriptionProductPricing(syncedProduct)) {
      return {
        pricing_model: syncedProduct.pricing_model,
        price_per_seat: syncedProduct.price_per_seat,
      };
    }
  } catch (error) {
    throw new Error(
      `Subscription product ${subscription.product.id} not found and product sync failed: ${getErrorMessage(error)}`
    );
  }

  throw new Error(
    `Subscription product ${subscription.product.id} did not resolve to a workspace subscription product`
  );
}

async function upsertSubscription(
  supabase: TypedSupabaseClient,
  wsId: string,
  subscription: Subscription
) {
  const product = await resolveSubscriptionProduct(supabase, subscription);

  const isSeatBased = product.pricing_model === 'seat_based';
  const seatCount = isSeatBased ? (subscription.seats ?? 1) : null;

  const subscriptionData = {
    ws_id: wsId,
    status:
      subscription.status as Database['public']['Enums']['subscription_status'],
    polar_subscription_id: subscription.id,
    product_id: subscription.product.id,
    current_period_start: new Date(
      subscription.currentPeriodStart
    ).toISOString(),
    current_period_end: subscription.currentPeriodEnd
      ? new Date(subscription.currentPeriodEnd).toISOString()
      : null,
    cancel_at_period_end: subscription.cancelAtPeriodEnd,
    created_at: new Date(subscription.createdAt).toISOString(),
    updated_at: subscription.modifiedAt
      ? new Date(subscription.modifiedAt).toISOString()
      : null,
    seat_count: seatCount,
  };

  const { error: dbError } = await supabase
    .from('workspace_subscriptions')
    .upsert([subscriptionData], {
      onConflict: 'polar_subscription_id',
      ignoreDuplicates: false,
    });

  if (dbError) {
    throw new Error(`Subscription upsert error: ${dbError.message}`);
  }

  return { subscriptionData, isSeatBased };
}

async function upsertCreditPackPurchase(
  supabase: TypedSupabaseClient,
  wsId: string,
  subscription: Subscription
) {
  const tokens = parseCreditPackTokens(subscription.product.metadata);
  if (!tokens) {
    throw new Error(
      `Credit pack ${subscription.product.id} is missing metadata tokens`
    );
  }

  const periodExpiry = addDays(
    subscription.currentPeriodStart,
    CREDIT_PACK_EXPIRY_DAYS
  );
  const expiresAtIso = periodExpiry.toISOString();

  // Store the actual Polar status for audit trail
  const status = subscription.status;

  const shouldRetainCredits = [
    'active',
    'trialing',
    'past_due',
    'incomplete',
  ].includes(status);
  const currentPeriodStartIso = subscription.currentPeriodStart.toISOString();

  const { data: existingPurchase, error: existingError } = await supabase
    .from('workspace_credit_pack_purchases')
    .select('id, tokens_remaining, granted_at, expires_at')
    .eq('polar_subscription_id', subscription.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(
      `Credit pack purchase lookup error: ${existingError.message}`
    );
  }

  let tokensRemaining = 0;
  let grantedAt = currentPeriodStartIso;
  let expiresAt = expiresAtIso;
  // When the subscription is in a non-retainable status (cancelled, revoked,
  // unpaid) we zero out tokens but preserve the historical grant/expiry dates
  // so the audit trail remains intact.
  const keepHistoricalDates = !shouldRetainCredits;

  if (!existingPurchase) {
    tokensRemaining = tokens;
  } else if (shouldRetainCredits) {
    const existingGrantedAt = new Date(existingPurchase.granted_at).getTime();
    const currentGrantedAt = new Date(currentPeriodStartIso).getTime();
    if (existingGrantedAt >= currentGrantedAt) {
      tokensRemaining = existingPurchase.tokens_remaining;
      grantedAt = existingPurchase.granted_at;
      expiresAt = existingPurchase.expires_at;
    } else {
      tokensRemaining = tokens;
    }
  } else if (keepHistoricalDates) {
    const existingGrantedAt = new Date(existingPurchase.granted_at).getTime();
    const currentGrantedAt = new Date(currentPeriodStartIso).getTime();
    if (existingGrantedAt >= currentGrantedAt) {
      grantedAt = existingPurchase.granted_at;
      expiresAt = existingPurchase.expires_at;
    }
  }

  const purchaseData = {
    ws_id: wsId,
    credit_pack_id: subscription.product.id,
    polar_subscription_id: subscription.id,
    tokens_granted: tokens,
    tokens_remaining: tokensRemaining,
    granted_at: grantedAt,
    expires_at: expiresAt,
    status: status as Database['public']['Enums']['subscription_status'],
    updated_at: new Date().toISOString(),
  };

  const { error: upsertError } = await supabase
    .from('workspace_credit_pack_purchases')
    .upsert(purchaseData, {
      onConflict: 'polar_subscription_id',
      ignoreDuplicates: false,
    });

  if (upsertError) {
    throw new Error(
      `Credit pack purchase upsert error: ${upsertError.message}`
    );
  }

  return purchaseData;
}

export async function syncSubscriptionToDatabase(
  supabase: TypedSupabaseClient,
  subscription: Subscription
) {
  const wsId = subscription.metadata?.wsId;
  if (!wsId || typeof wsId !== 'string') {
    console.error('Subscription sync error: Workspace ID not found.');
    throw new Error('Workspace ID not found.');
  }

  if (isAiCreditPackProduct(subscription.product.metadata)) {
    const purchaseData = await upsertCreditPackPurchase(
      supabase,
      wsId,
      subscription
    );

    return { purchaseData };
  }

  const { subscriptionData, isSeatBased } = await upsertSubscription(
    supabase,
    wsId,
    subscription
  );

  return { subscriptionData, isSeatBased };
}
