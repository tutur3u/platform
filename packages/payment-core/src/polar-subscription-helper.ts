import type { Subscription } from '@tuturuuu/payment/polar';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import type { Database } from '@tuturuuu/types';
import type { WorkspaceSubscriptionProduct } from '@tuturuuu/types/db';
import { addDays } from 'date-fns';
import { syncProductToDatabase } from './polar-product-helper';
import {
  isAiCreditPackProduct,
  isCustomDomainAddonProduct,
  parseCreditPackTokens,
} from './polar-product-metadata';
import { upsertWorkspaceDomainAddon } from './workspace-domain-addon';

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
  const seatCount = isSeatBased ? (subscription.seats ?? null) : null;
  if (
    isSeatBased &&
    (seatCount === null || !Number.isSafeInteger(seatCount) || seatCount < 1)
  )
    throw new Error('Subscription seats could not be verified');

  const eventVersion = new Date(
    subscription.modifiedAt ?? subscription.createdAt
  ).toISOString();
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
    updated_at: eventVersion,
    seat_count: seatCount,
  };

  const { error: dbError } = await supabase
    .from('workspace_subscriptions')
    .upsert([subscriptionData], {
      onConflict: 'polar_subscription_id',
      ignoreDuplicates: true,
    });

  if (dbError) {
    // A deleted workspace removes its subscription rows by cascade. Later
    // provider events for it have nothing to project, so they are not errors.
    if (dbError.code === '23503') {
      const { data: workspace, error: workspaceError } = await supabase
        .from('workspaces')
        .select('id')
        .eq('id', subscriptionData.ws_id)
        .maybeSingle();
      if (!workspaceError && !workspace) {
        return { subscriptionData: null, isSeatBased };
      }
    }
    throw new Error(`Subscription upsert error: ${dbError.message}`);
  }

  // INSERT ... ON CONFLICT DO NOTHING cannot overwrite a newer event. The
  // subsequent UPDATE evaluates the version predicate atomically in Postgres.
  // Equal versions may retry side effects only for an identical projection;
  // different payloads without a provable ordering must not overwrite it.
  const identicalProjection = Object.entries(subscriptionData)
    .map(([column, value]) =>
      value === null
        ? `${column}.is.null`
        : `${column}.eq.${JSON.stringify(value)}`
    )
    .join(',');
  const { data: applied, error: updateError } = await supabase
    .from('workspace_subscriptions')
    .update(subscriptionData)
    .eq('polar_subscription_id', subscription.id)
    .or(
      `updated_at.is.null,updated_at.lt.${eventVersion},and(${identicalProjection})`
    )
    .select('id')
    .maybeSingle();
  if (updateError)
    throw new Error(`Subscription projection error: ${updateError.message}`);
  if (!applied) return { subscriptionData: null, isSeatBased };

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

  // The projection runs as one locked, relative update in the database. It
  // never writes back a tokens_remaining snapshot, so a credit hold taken
  // while this event is in flight is not restored. A renewal starts a new
  // grant; a non-retained status zeroes it and keeps the historical dates.
  const { data, error } = await (
    supabase.schema('private') as unknown as {
      rpc: (
        fn: 'sync_credit_pack_purchase',
        args: Record<string, unknown>
      ) => Promise<{
        data:
          | Database['public']['Tables']['workspace_credit_pack_purchases']['Row'][]
          | null;
        error: { message: string } | null;
      }>;
    }
  ).rpc('sync_credit_pack_purchase', {
    p_ws_id: wsId,
    p_credit_pack_id: subscription.product.id,
    p_polar_subscription_id: subscription.id,
    p_tokens: tokens,
    p_status: subscription.status,
    p_period_start: subscription.currentPeriodStart.toISOString(),
    p_expires_at: expiresAtIso,
  });

  const purchaseData = data?.[0];
  if (error || !purchaseData) {
    throw new Error(
      `Credit pack purchase sync error: ${error?.message ?? 'no row returned'}`
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

  if (isCustomDomainAddonProduct(subscription.product.metadata)) {
    const { domainAddonData } = await upsertWorkspaceDomainAddon(
      supabase,
      wsId,
      subscription
    );
    return { domainAddonData };
  }

  const { subscriptionData, isSeatBased } = await upsertSubscription(
    supabase,
    wsId,
    subscription
  );

  return { subscriptionData, isSeatBased };
}
