import 'server-only';

import {
  type InventoryCheckoutSession,
  type InventoryPolarEnvironment,
  toPolarCurrency,
} from '@tuturuuu/internal-api/inventory';
import { createPolarClient } from '@tuturuuu/payment/polar/server';
import {
  decryptIntegrationToken,
  ensureInventoryPolarCheckoutProduct,
  environmentFromDeployment,
  extractErrorMessage,
  getIntegration,
  getInventoryPolarSettings,
  getPrivateAdmin,
  getStorefrontPolarEnvironment,
  productHasCurrency,
  type SupabaseErrorLike,
} from './polar-core';

/**
 * Polar checkouts charge a single product and have no line-item/quantity
 * concept, so we can only attribute an order to a real synced product when the
 * cart is a single listing (of any quantity, e.g. 4x of product X). The amount
 * is locked separately by an ad-hoc fixed price equal to the reserved total, so
 * the product's catalog price does not need to match. Returns that product id,
 * or null to fall back to the generic checkout product.
 */
async function resolveSingleListingPolarProduct({
  checkout,
  environment,
  polar,
}: {
  checkout: InventoryCheckoutSession;
  environment: InventoryPolarEnvironment;
  polar: ReturnType<typeof createPolarClient>;
}): Promise<string | null> {
  if (checkout.lines.length !== 1) return null;
  const line = checkout.lines[0];
  if (!line) return null;
  if (!line.listingId) return null;

  const privateAdmin = await getPrivateAdmin();
  const { data } = (await privateAdmin
    .from('inventory_storefront_listings' as never)
    .select('polar_product_id, polar_environment, polar_sync_status')
    .eq('id', line.listingId)
    .eq('ws_id', checkout.wsId)
    .maybeSingle()) as {
    data: {
      polar_environment?: string | null;
      polar_product_id?: string | null;
      polar_sync_status?: string | null;
    } | null;
  };

  if (
    !data?.polar_product_id ||
    data.polar_sync_status !== 'synced' ||
    data.polar_environment !== environment
  ) {
    return null;
  }

  // The ad-hoc fixed price locks the amount, but Polar still rejects a checkout
  // whose currency the product can't honor, so confirm the product carries the
  // checkout's currency before attributing the order to it.
  try {
    const wantCurrency = toPolarCurrency(checkout.currency);
    const product = await polar.products.get({ id: data.polar_product_id });
    if (productHasCurrency(product, wantCurrency)) {
      return data.polar_product_id;
    }
  } catch (error) {
    console.warn('Single-listing Polar product check failed', {
      error: extractErrorMessage(error),
      listingId: line.listingId,
    });
  }
  return null;
}

export async function createInventoryPolarCheckout({
  checkout,
  storefrontSlug,
  storefrontUrl,
}: {
  checkout: InventoryCheckoutSession;
  storefrontSlug: string;
  storefrontUrl: string;
}) {
  const settings = await getInventoryPolarSettings(checkout.wsId);
  // Prefer the storefront's explicit environment; fall back to the deployment.
  const environment =
    (await getStorefrontPolarEnvironment(checkout.wsId, storefrontSlug)) ??
    environmentFromDeployment(settings);
  const integration = await getIntegration({
    environment,
    wsId: checkout.wsId,
  });

  if (!integration?.access_token_encrypted) {
    throw new Error(
      `Polar is not connected for the ${environment} environment. Connect a ${environment} token in the Polar hub, or switch this storefront's environment.`
    );
  }

  const accessToken = await decryptIntegrationToken(integration);
  const polar = createPolarClient({ accessToken, environment });

  // Attribute the order to the real synced product when the cart is a single
  // listing of any quantity (e.g. 4x of product X); otherwise the generic
  // checkout product carries the exact reserved total.
  const singleListingProductId = await resolveSingleListingPolarProduct({
    checkout,
    environment,
    polar,
  });
  const productId =
    singleListingProductId ??
    (await ensureInventoryPolarCheckoutProduct({
      currency: checkout.currency,
      environment,
      wsId: checkout.wsId,
    }));

  const wantCurrency = toPolarCurrency(checkout.currency);
  const normalizedStorefrontUrl = storefrontUrl.replace(/\/$/u, '');
  const checkoutSession = await polar.checkouts.create({
    currency: wantCurrency as never,
    customerEmail: checkout.customerEmail,
    customerName: checkout.customerName,
    metadata: {
      checkoutId: checkout.id,
      environment,
      kind: 'inventory_checkout',
      publicToken: checkout.publicToken,
      storefrontSlug,
      wsId: checkout.wsId,
    },
    // Lock the amount: an ad-hoc FIXED price renders non-editable on Polar's
    // hosted page (a custom/"pay what you want" price does not). It is always the
    // exact reserved total (line totals + fees), so the buyer cannot change what
    // they pay, regardless of whether a real or generic product is used.
    prices: {
      [productId]: [
        {
          amountType: 'fixed' as const,
          priceAmount: checkout.totalAmount,
          priceCurrency: wantCurrency as never,
        },
      ],
    },
    products: [productId],
    returnUrl: `${normalizedStorefrontUrl}/${storefrontSlug}/cart`,
    successUrl: `${normalizedStorefrontUrl}/${storefrontSlug}/orders/${checkout.publicToken}?checkout_id={CHECKOUT_ID}`,
  });
  const checkoutUrl = checkoutSession.url;

  if (!checkoutUrl) {
    throw new Error('Polar checkout URL was not returned');
  }

  await updateCheckoutPolarState(checkout.id, checkout.wsId, {
    polar_checkout_id: checkoutSession.id,
    polar_checkout_url: checkoutUrl,
    polar_environment: environment,
    polar_product_id: productId,
    polar_status: 'checkout_created',
  });

  return {
    checkoutId: checkoutSession.id,
    checkoutUrl,
    environment,
    productId,
  };
}

export async function updateCheckoutPolarState(
  checkoutId: string,
  wsId: string,
  values: Record<string, unknown>
) {
  const privateAdmin = await getPrivateAdmin();
  const { error } = (await privateAdmin
    .from('inventory_checkout_sessions' as never)
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', checkoutId)
    .eq('ws_id', wsId)) as { error: SupabaseErrorLike };

  if (error) {
    throw new Error(error.message ?? 'Failed to update checkout payment state');
  }
}
