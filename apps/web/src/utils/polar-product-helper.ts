import type { Product } from '@tuturuuu/payment/polar';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import {
  isAiCreditPackProduct,
  parseCreditPackTokens,
  parseWorkspaceProductTier,
} from '@/utils/polar-product-metadata';

const CREDIT_PACK_EXPIRY_DAYS = 60;

type PolarPrice = Product['prices'][number];

function isPolarPrice(value: unknown): value is PolarPrice {
  if (!value || typeof value !== 'object') return false;
  return 'amountType' in value && 'priceAmount' in value;
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

  const { data: creditPack, error: creditPackError } = await supabase
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
    await supabase
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

  const firstPrice = product.prices.find(isPolarPrice);
  if (!firstPrice) {
    throw new Error(
      `Subscription product ${product.id} is missing valid pricing data`
    );
  }
  const isSeatBased = firstPrice.amountType === 'seat_based';
  const isFixed = firstPrice.amountType === 'fixed';

  const price = isFixed ? firstPrice.priceAmount : null;
  const pricePerSeat = isSeatBased
    ? (firstPrice.seatTiers?.tiers?.[0]?.pricePerSeat ?? null)
    : null;
  const minSeats = isSeatBased ? firstPrice.seatTiers?.minimumSeats : null;
  const maxSeats = isSeatBased ? firstPrice.seatTiers?.maximumSeats : null;

  const productData = {
    id: product.id,
    name: product.name,
    description: product.description || '',
    price,
    recurring_interval: product.recurringInterval ?? 'month',
    tier,
    archived: product.isArchived ?? false,
    pricing_model: firstPrice.amountType,
    price_per_seat: pricePerSeat,
    min_seats: minSeats,
    max_seats: maxSeats,
  };

  const { error: upsertError } = await supabase
    .from('workspace_subscription_products')
    .upsert(productData, {
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

  const firstPrice = product.prices.find(isPolarPrice);
  const isFixed = firstPrice?.amountType === 'fixed';
  if (!firstPrice || !isFixed) {
    throw new Error(
      `Credit pack ${product.id} is missing a fixed price configuration`
    );
  }
  const price = firstPrice.priceAmount;
  const currency = firstPrice.priceCurrency
    ? firstPrice.priceCurrency.toLowerCase()
    : 'usd';

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

  const { error: upsertError } = await supabase
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
