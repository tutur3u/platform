import type { Product } from '@tuturuuu/payment/polar';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { getSupportedProductPrice } from './polar-price';
import {
  isAiCreditPackProduct,
  isCustomDomainAddonProduct,
  parseCreditPackTokens,
  parseWorkspaceProductTier,
} from './polar-product-metadata';
import {
  activeWorkspaceCatalog,
  getVersionedWorkspaceProductPrices,
} from './workspace-catalog';

const CREDIT_PACK_EXPIRY_DAYS = 60;

function privateSchema(supabase: TypedSupabaseClient) {
  return supabase.schema('private');
}

export type WorkspaceOrderProductKind =
  | 'subscription_product'
  | 'credit_pack'
  | 'unknown';

export async function resolveWorkspaceOrderProduct(
  supabase: TypedSupabaseClient,
  polarProductId?: string | null
): Promise<{
  productKind: WorkspaceOrderProductKind;
  productId: string | null;
  creditPackId: string | null;
}> {
  if (!polarProductId) {
    return {
      productKind: 'unknown',
      productId: null,
      creditPackId: null,
    };
  }

  const { data: creditPack, error: creditPackError } = await privateSchema(
    supabase
  )
    .from('workspace_credit_packs')
    .select('id')
    .eq('id', polarProductId)
    .maybeSingle();

  if (creditPackError) {
    throw new Error(
      `Credit pack lookup failed: ${creditPackError.message ?? 'Unknown error'}`
    );
  }

  if (creditPack?.id) {
    return {
      productKind: 'credit_pack',
      productId: null,
      creditPackId: creditPack.id,
    };
  }

  const { data: subscriptionProduct, error: subscriptionProductError } =
    await privateSchema(supabase)
      .from('workspace_subscription_products')
      .select('id')
      .eq('id', polarProductId)
      .maybeSingle();

  if (subscriptionProductError) {
    throw new Error(
      `Subscription product lookup failed: ${subscriptionProductError.message ?? 'Unknown error'}`
    );
  }

  if (subscriptionProduct?.id) {
    return {
      productKind: 'subscription_product',
      productId: subscriptionProduct.id,
      creditPackId: null,
    };
  }

  return {
    productKind: 'unknown',
    productId: null,
    creditPackId: null,
  };
}

async function upsertSubscriptionProduct(
  supabase: TypedSupabaseClient,
  product: Product
) {
  const tier = parseWorkspaceProductTier(product.metadata);
  if (!tier) {
    throw new Error(
      `Subscription product ${product.id} is missing valid product_tier metadata`
    );
  }

  const resolved = getSupportedProductPrice(product);

  const productData = {
    id: product.id,
    name: product.name,
    description: product.description || '',
    price: resolved.amount,
    recurring_interval: product.recurringInterval ?? 'month',
    tier,
    archived: product.isArchived ?? false,
    pricing_model: resolved.price.amountType,
    price_per_seat: resolved.pricePerSeat,
    min_seats: resolved.minSeats,
    max_seats: resolved.maxSeats,
  };

  const { error: upsertError } = await privateSchema(supabase)
    .from('workspace_subscription_products')
    .upsert([productData], {
      onConflict: 'id',
      ignoreDuplicates: false,
    });

  if (upsertError) {
    throw new Error(
      `Subscription product upsert error: ${upsertError.message}`
    );
  }

  return productData;
}

async function upsertCreditPackProduct(
  supabase: TypedSupabaseClient,
  product: Product
) {
  const tokens = parseCreditPackTokens(product.metadata);
  if (!tokens) {
    throw new Error(`Credit pack ${product.id} is missing metadata tokens`);
  }

  const resolved = getSupportedProductPrice(product, false);
  if (resolved.price.amountType !== 'fixed') {
    throw new Error(`Credit pack ${product.id} requires a fixed price`);
  }
  const price = resolved.amount ?? 0;
  const currency = resolved.price.priceCurrency.toLowerCase();

  const creditPackData = {
    id: product.id,
    name: product.name,
    description: product.description || '',
    price,
    currency,
    tokens,
    expiry_days: CREDIT_PACK_EXPIRY_DAYS,
    archived: product.isArchived ?? false,
  };

  const { error: upsertError } = await privateSchema(supabase)
    .from('workspace_credit_packs')
    .upsert([creditPackData], {
      onConflict: 'id',
      ignoreDuplicates: false,
    });

  if (upsertError) {
    throw new Error(`Credit pack upsert error: ${upsertError.message}`);
  }

  return creditPackData;
}

export async function syncProductToDatabase(
  supabase: TypedSupabaseClient,
  product: Product
) {
  // Domain add-ons are not plans or credit packs; their entitlement comes
  // from subscriptions (private.workspace_domain_addons).
  if (isCustomDomainAddonProduct(product.metadata)) return null;
  const versioned = getVersionedWorkspaceProductPrices(product);
  if (versioned) {
    const tier = parseWorkspaceProductTier(product.metadata);
    if (!tier) throw new Error('Invalid versioned workspace catalog tier');
    const published =
      !product.isArchived &&
      product.visibility === 'public' &&
      activeWorkspaceCatalog()?.some(
        (offer) =>
          offer.productId === product.id &&
          offer.priceId === versioned.usd.price.id &&
          offer.vndPriceId === versioned.vnd.price.id
      ) === true;
    const { data, error } = await supabase.rpc(
      'sync_versioned_workspace_subscription_product',
      {
        p_product_id: product.id,
        p_name: product.name,
        p_description: product.description ?? '',
        p_tier: tier,
        p_interval: versioned.offer.term,
        p_archived: !published,
        p_provider_updated_at: new Date(
          product.modifiedAt ?? product.createdAt
        ).toISOString(),
        p_usd_price_id: versioned.usd.price.id,
        p_usd_amount: versioned.offer.unitAmount,
        p_vnd_price_id: versioned.vnd.price.id,
        p_vnd_amount: versioned.offer.vndUnitAmount,
      }
    );
    if (error || !data)
      throw new Error('Versioned workspace catalog projection failed');
    return data;
  }
  if (product.isArchived) {
    const table = isAiCreditPackProduct(product.metadata)
      ? 'workspace_credit_packs'
      : 'workspace_subscription_products';
    const { data, error } = await privateSchema(supabase)
      .from(table)
      .update({ archived: true })
      .eq('id', product.id)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`Product archival failed: ${error.message}`);
    return data;
  }
  if (isAiCreditPackProduct(product.metadata)) {
    const creditPackData = await upsertCreditPackProduct(supabase, product);
    return creditPackData;
  }

  const subscriptionProductData = await upsertSubscriptionProduct(
    supabase,
    product
  );

  return subscriptionProductData;
}
