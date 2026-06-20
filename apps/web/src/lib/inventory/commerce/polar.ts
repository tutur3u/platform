import 'server-only';

import { createHash } from 'node:crypto';
import {
  type InventoryCheckoutSession,
  type InventoryPolarEnvironment,
  type InventoryPolarIntegration,
  type InventoryPolarSettings,
  type InventoryPolarSettingsPayload,
  toPolarCurrency,
} from '@tuturuuu/internal-api/inventory';
import type { Checkout, Order } from '@tuturuuu/payment/polar';
import { createPolarClient } from '@tuturuuu/payment/polar/server';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { decryptField, encryptField } from '@tuturuuu/utils/encryption';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  getOrCreateWorkspaceKey,
  getWorkspaceKey,
} from '@/lib/workspace-encryption';
import { recordInventorySaleFinanceTransaction } from './finance';
import {
  buildPolarDiscountInput,
  type PromotionForPolar,
} from './promotions-polar';

type SupabaseErrorLike = { message?: string } | null;

type PolarIntegrationRow = {
  access_token_encrypted: string;
  access_token_fingerprint: string | null;
  access_token_last4: string | null;
  environment: InventoryPolarEnvironment;
  last_error: string | null;
  last_validated_at: string | null;
  polar_product_id: string | null;
  polar_product_name: string | null;
  status: 'error' | 'pending' | 'ready';
  updated_at: string | null;
  webhook_secret_encrypted: string | null;
  webhook_secret_last4: string | null;
  ws_id: string;
};

type PolarSettingsRow = {
  production_environment: InventoryPolarEnvironment;
  testing_environment: InventoryPolarEnvironment;
};

function environmentFromDeployment(settings: InventoryPolarSettings) {
  const isProduction =
    process.env.VERCEL_ENV === 'production' ||
    process.env.NODE_ENV === 'production';
  return isProduction
    ? settings.productionEnvironment
    : settings.testingEnvironment;
}

function tokenFingerprint(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function tokenLast4(token: string) {
  return token.slice(-4) || null;
}

function mapIntegration(row: PolarIntegrationRow): InventoryPolarIntegration {
  return {
    accessTokenFingerprint: row.access_token_fingerprint,
    accessTokenLast4: row.access_token_last4,
    environment: row.environment,
    lastError: row.last_error,
    lastValidatedAt: row.last_validated_at,
    polarProductId: row.polar_product_id,
    polarProductName: row.polar_product_name ?? 'Tuturuuu Inventory Checkout',
    status: row.status,
    updatedAt: row.updated_at,
    webhookSecretLast4: row.webhook_secret_last4 ?? null,
  };
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return 'Unknown Polar error';
}

async function getPrivateAdmin() {
  return (await createAdminClient()).schema('private');
}

/**
 * Reads a storefront's chosen Polar environment (sandbox/production) so checkout
 * targets the right Polar account. Returns null when unset so callers can fall
 * back to the deployment default.
 */
async function getStorefrontPolarEnvironment(
  wsId: string,
  slug: string
): Promise<InventoryPolarEnvironment | null> {
  const privateAdmin = await getPrivateAdmin();
  const { data } = (await privateAdmin
    .from('inventory_storefronts' as never)
    .select('polar_environment')
    .eq('ws_id', wsId)
    .eq('slug', slug)
    .maybeSingle()) as {
    data: { polar_environment?: string | null } | null;
  };
  const environment = data?.polar_environment;
  return environment === 'sandbox' || environment === 'production'
    ? environment
    : null;
}

export async function getInventoryPolarSettings(
  wsId: string
): Promise<InventoryPolarSettings> {
  const privateAdmin = await getPrivateAdmin();
  const settingsResult = (await privateAdmin
    .from('inventory_polar_settings' as never)
    .select('testing_environment, production_environment')
    .eq('ws_id', wsId)
    .maybeSingle()) as {
    data: PolarSettingsRow | null;
    error: SupabaseErrorLike;
  };

  if (settingsResult.error) {
    throw new Error(settingsResult.error.message ?? 'Failed to load settings');
  }

  const integrationsResult = (await privateAdmin
    .from('inventory_polar_integrations' as never)
    .select(
      'ws_id, environment, access_token_fingerprint, access_token_last4, polar_product_id, polar_product_name, status, last_validated_at, last_error, updated_at, access_token_encrypted, webhook_secret_encrypted, webhook_secret_last4'
    )
    .eq('ws_id', wsId)
    .order('environment', { ascending: true })) as {
    data: PolarIntegrationRow[] | null;
    error: SupabaseErrorLike;
  };

  if (integrationsResult.error) {
    throw new Error(
      integrationsResult.error.message ?? 'Failed to load integrations'
    );
  }

  return {
    integrations: (integrationsResult.data ?? []).map(mapIntegration),
    productionEnvironment:
      settingsResult.data?.production_environment ?? 'production',
    testingEnvironment: settingsResult.data?.testing_environment ?? 'sandbox',
    wsId,
  };
}

async function upsertPolarSettings({
  payload,
  userId,
  wsId,
}: {
  payload: InventoryPolarSettingsPayload;
  userId: string;
  wsId: string;
}) {
  if (!payload.testingEnvironment && !payload.productionEnvironment) return;

  const current = await getInventoryPolarSettings(wsId);
  const privateAdmin = await getPrivateAdmin();
  const { error } = (await privateAdmin
    .from('inventory_polar_settings' as never)
    .upsert(
      {
        production_environment:
          payload.productionEnvironment ?? current.productionEnvironment,
        testing_environment:
          payload.testingEnvironment ?? current.testingEnvironment,
        updated_at: new Date().toISOString(),
        updated_by: userId,
        ws_id: wsId,
      } as never,
      { onConflict: 'ws_id' }
    )) as { error: SupabaseErrorLike };

  if (error) throw new Error(error.message ?? 'Failed to save settings');
}

async function getIntegration({
  environment,
  wsId,
}: {
  environment: InventoryPolarEnvironment;
  wsId: string;
}) {
  const privateAdmin = await getPrivateAdmin();
  const result = (await privateAdmin
    .from('inventory_polar_integrations' as never)
    .select(
      'ws_id, environment, access_token_encrypted, access_token_fingerprint, access_token_last4, polar_product_id, polar_product_name, status, last_validated_at, last_error, updated_at, webhook_secret_encrypted, webhook_secret_last4'
    )
    .eq('ws_id', wsId)
    .eq('environment', environment)
    .maybeSingle()) as {
    data: PolarIntegrationRow | null;
    error: SupabaseErrorLike;
  };

  if (result.error) {
    throw new Error(result.error.message ?? 'Failed to load Polar integration');
  }

  return result.data;
}

async function updateIntegration(
  wsId: string,
  environment: InventoryPolarEnvironment,
  values: Record<string, unknown>
) {
  const privateAdmin = await getPrivateAdmin();
  const { error } = (await privateAdmin
    .from('inventory_polar_integrations' as never)
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('ws_id', wsId)
    .eq('environment', environment)) as { error: SupabaseErrorLike };

  if (error) {
    throw new Error(error.message ?? 'Failed to update Polar integration');
  }
}

async function decryptIntegrationToken(row: PolarIntegrationRow) {
  const workspaceKey = await getWorkspaceKey(row.ws_id);
  if (!workspaceKey) {
    throw new Error('Workspace encryption key is not available');
  }

  return decryptField(row.access_token_encrypted, workspaceKey);
}

async function upsertIntegrationToken({
  accessToken,
  environment,
  userId,
  wsId,
}: {
  accessToken: string;
  environment: InventoryPolarEnvironment;
  userId: string;
  wsId: string;
}) {
  const workspaceKey = await getOrCreateWorkspaceKey(wsId);
  if (!workspaceKey) {
    throw new Error(
      'Workspace encryption is required before saving Polar tokens'
    );
  }

  const privateAdmin = await getPrivateAdmin();
  const encryptedToken = encryptField(accessToken, workspaceKey);
  const { error } = (await privateAdmin
    .from('inventory_polar_integrations' as never)
    .upsert(
      {
        access_token_encrypted: encryptedToken,
        access_token_fingerprint: tokenFingerprint(accessToken),
        access_token_last4: tokenLast4(accessToken),
        environment,
        last_error: null,
        status: 'pending',
        updated_at: new Date().toISOString(),
        updated_by: userId,
        ws_id: wsId,
      } as never,
      { onConflict: 'ws_id,environment' }
    )) as { error: SupabaseErrorLike };

  if (error) throw new Error(error.message ?? 'Failed to save Polar token');
}

async function upsertWebhookSecret({
  environment,
  userId,
  webhookSecret,
  wsId,
}: {
  environment: InventoryPolarEnvironment;
  userId: string;
  webhookSecret: string;
  wsId: string;
}) {
  const workspaceKey = await getOrCreateWorkspaceKey(wsId);
  if (!workspaceKey) {
    throw new Error(
      'Workspace encryption is required before saving the webhook secret'
    );
  }

  // The webhook secret lives on the integration row, which is created when the
  // access token is saved — so the token must be connected first.
  const privateAdmin = await getPrivateAdmin();
  const { data, error } = (await privateAdmin
    .from('inventory_polar_integrations' as never)
    .update({
      updated_at: new Date().toISOString(),
      updated_by: userId,
      webhook_secret_encrypted: encryptField(webhookSecret, workspaceKey),
      webhook_secret_last4: tokenLast4(webhookSecret),
    } as never)
    .eq('ws_id', wsId)
    .eq('environment', environment)
    .select('environment')
    .maybeSingle()) as { data: unknown; error: SupabaseErrorLike };

  if (error) throw new Error(error.message ?? 'Failed to save webhook secret');
  if (!data) {
    throw new Error(
      `Connect a Polar ${environment} access token before saving its webhook secret`
    );
  }
}

/**
 * Decrypts the workspace's Polar webhook signing secret for an environment, used
 * to verify incoming webhook signatures. Returns null when not configured.
 */
export async function getInventoryPolarWebhookSecret(
  wsId: string,
  environment: InventoryPolarEnvironment
): Promise<string | null> {
  const integration = await getIntegration({ environment, wsId });
  if (!integration?.webhook_secret_encrypted) return null;
  const workspaceKey = await getWorkspaceKey(wsId);
  if (!workspaceKey) return null;
  return decryptField(integration.webhook_secret_encrypted, workspaceKey);
}

export async function ensureInventoryPolarProduct({
  environment,
  wsId,
}: {
  environment: InventoryPolarEnvironment;
  wsId: string;
}) {
  const integration = await getIntegration({ environment, wsId });
  if (!integration) {
    throw new Error(`Polar ${environment} token is not configured`);
  }

  const accessToken = await decryptIntegrationToken(integration);
  const polar = createPolarClient({ accessToken, environment });

  if (integration.polar_product_id) {
    try {
      await polar.products.get({ id: integration.polar_product_id });
      await updateIntegration(wsId, environment, {
        last_error: null,
        last_validated_at: new Date().toISOString(),
        status: 'ready',
      });
      return integration.polar_product_id;
    } catch (error) {
      serverLogger.warn('Inventory Polar product validation failed', {
        environment,
        error: extractErrorMessage(error),
        wsId,
      });
    }
  }

  try {
    const product = await polar.products.create({
      description:
        'Private checkout product used by Tuturuuu Inventory storefront orders.',
      metadata: {
        environment,
        kind: 'inventory_checkout',
        wsId,
      },
      name: integration.polar_product_name ?? 'Tuturuuu Inventory Checkout',
      prices: [{ amountType: 'custom' }],
      visibility: 'private',
    });

    await updateIntegration(wsId, environment, {
      last_error: null,
      last_validated_at: new Date().toISOString(),
      polar_product_id: product.id,
      status: 'ready',
    });

    return product.id;
  } catch (error) {
    const message = extractErrorMessage(error);
    await updateIntegration(wsId, environment, {
      last_error: message,
      last_validated_at: new Date().toISOString(),
      status: 'error',
    });
    throw new Error(message);
  }
}

async function getCheckoutProductId(
  wsId: string,
  environment: InventoryPolarEnvironment,
  currency: string
): Promise<string | null> {
  const privateAdmin = await getPrivateAdmin();
  const { data } = (await privateAdmin
    .from('inventory_polar_checkout_products' as never)
    .select('polar_product_id')
    .eq('ws_id', wsId)
    .eq('environment', environment)
    .eq('currency', currency)
    .maybeSingle()) as { data: { polar_product_id?: string | null } | null };
  return data?.polar_product_id ?? null;
}

async function upsertCheckoutProductId({
  currency,
  environment,
  productId,
  wsId,
}: {
  currency: string;
  environment: InventoryPolarEnvironment;
  productId: string;
  wsId: string;
}) {
  const privateAdmin = await getPrivateAdmin();
  await privateAdmin.from('inventory_polar_checkout_products' as never).upsert(
    {
      currency,
      environment,
      polar_product_id: productId,
      updated_at: new Date().toISOString(),
      ws_id: wsId,
    } as never,
    { onConflict: 'ws_id,environment,currency' }
  );
}

function productHasCurrency(
  product: { prices?: unknown[] | null },
  priceCurrency: string
) {
  const prices = (product.prices ?? []) as Array<{
    priceCurrency?: string | null;
  }>;
  // Accept when a price matches the currency, or when no currency is exposed.
  return (
    prices.length === 0 ||
    prices.some((price) => {
      const pc = price.priceCurrency;
      return !pc || pc.toLowerCase() === priceCurrency;
    })
  );
}

/**
 * Ensures a generic custom-amount Polar checkout product priced in the given
 * currency exists for the workspace+environment, creating it on demand. Polar
 * prices are currency-bound, so multi-currency workspaces need one product per
 * currency; checkouts must reference the product matching the storefront's
 * currency or Polar rejects them ("Product is not available in the specified
 * currency"). Persisted in `inventory_polar_checkout_products`.
 */
export async function ensureInventoryPolarCheckoutProduct({
  currency: rawCurrency,
  environment,
  wsId,
}: {
  currency: string | null | undefined;
  environment: InventoryPolarEnvironment;
  wsId: string;
}): Promise<string> {
  const currencyUpper = (rawCurrency ?? 'USD').trim().toUpperCase() || 'USD';
  const priceCurrency = toPolarCurrency(currencyUpper);
  const integration = await getIntegration({ environment, wsId });
  if (!integration) {
    throw new Error(`Polar ${environment} token is not configured`);
  }

  const accessToken = await decryptIntegrationToken(integration);
  const polar = createPolarClient({ accessToken, environment });

  const existingId = await getCheckoutProductId(
    wsId,
    environment,
    currencyUpper
  );
  if (existingId) {
    try {
      const product = await polar.products.get({ id: existingId });
      if (productHasCurrency(product, priceCurrency)) return existingId;
    } catch (error) {
      serverLogger.warn('Inventory Polar checkout product validation failed', {
        currency: currencyUpper,
        environment,
        error: extractErrorMessage(error),
        wsId,
      });
    }
  }

  // Polar requires the organization's default presentment currency (USD for
  // Tuturuuu orgs) to be present in a product's prices, and selects the price
  // matching the checkout's currency. So include a USD price plus the
  // storefront's currency. minimumAmount 0 = "pay what you want"; safe because
  // checkout always sets the exact reserved amount.
  const priceCurrencies = Array.from(new Set(['usd', priceCurrency]));
  const product = await polar.products.create({
    description:
      'Private checkout product used by Tuturuuu Inventory storefront orders.',
    metadata: {
      currency: currencyUpper,
      environment,
      kind: 'inventory_checkout',
      wsId,
    },
    name: integration.polar_product_name ?? 'Tuturuuu Inventory Checkout',
    prices: priceCurrencies.map((code) => ({
      amountType: 'custom' as const,
      minimumAmount: 0,
      priceCurrency: code as never,
    })),
    visibility: 'private',
  });
  await upsertCheckoutProductId({
    currency: currencyUpper,
    environment,
    productId: product.id,
    wsId,
  });
  return product.id;
}

export async function saveInventoryPolarSettings({
  payload,
  userId,
  wsId,
}: {
  payload: InventoryPolarSettingsPayload;
  userId: string;
  wsId: string;
}) {
  await upsertPolarSettings({ payload, userId, wsId });

  if (payload.accessToken?.trim()) {
    if (!payload.environment) {
      throw new Error('Polar environment is required when saving a token');
    }

    await upsertIntegrationToken({
      accessToken: payload.accessToken.trim(),
      environment: payload.environment,
      userId,
      wsId,
    });
    await ensureInventoryPolarProduct({
      environment: payload.environment,
      wsId,
    });
  }

  if (payload.webhookSecret?.trim()) {
    if (!payload.environment) {
      throw new Error(
        'Polar environment is required when saving a webhook secret'
      );
    }

    await upsertWebhookSecret({
      environment: payload.environment,
      userId,
      webhookSecret: payload.webhookSecret.trim(),
      wsId,
    });
  }

  return getInventoryPolarSettings(wsId);
}

/**
 * Resolves a ready-to-use Polar client + environment for a workspace, reusing
 * the storefront's chosen environment when a slug is given (else the deployment
 * default). Returns null when the workspace has no usable Polar integration for
 * that environment, so callers can degrade gracefully instead of throwing.
 */
export async function resolveInventoryPolarContext({
  storefrontSlug,
  wsId,
}: {
  storefrontSlug?: string | null;
  wsId: string;
}): Promise<{
  environment: InventoryPolarEnvironment;
  polar: ReturnType<typeof createPolarClient>;
} | null> {
  const settings = await getInventoryPolarSettings(wsId);
  const environment =
    (storefrontSlug
      ? await getStorefrontPolarEnvironment(wsId, storefrontSlug)
      : null) ?? environmentFromDeployment(settings);
  const integration = await getIntegration({ environment, wsId });
  if (!integration?.access_token_encrypted) return null;
  const accessToken = await decryptIntegrationToken(integration);
  return {
    environment,
    polar: createPolarClient({ accessToken, environment }),
  };
}

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
    serverLogger.warn('Single-listing Polar product check failed', {
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

async function updateCheckoutPolarState(
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

function getInventoryMetadata(value: unknown) {
  if (!value || typeof value !== 'object') return null;

  const metadata = value as Record<string, unknown>;
  if (metadata.kind !== 'inventory_checkout') return null;

  const checkoutId = metadata.checkoutId;
  const wsId = metadata.wsId;

  if (typeof checkoutId !== 'string' || typeof wsId !== 'string') {
    return null;
  }

  return {
    checkoutId,
    environment:
      metadata.environment === 'production' ? 'production' : 'sandbox',
    publicToken:
      typeof metadata.publicToken === 'string' ? metadata.publicToken : null,
    storefrontSlug:
      typeof metadata.storefrontSlug === 'string'
        ? metadata.storefrontSlug
        : null,
    wsId,
  } satisfies {
    checkoutId: string;
    environment: InventoryPolarEnvironment;
    publicToken: string | null;
    storefrontSlug: string | null;
    wsId: string;
  };
}

export function hasInventoryPolarMetadata(value: unknown) {
  return Boolean(getInventoryMetadata(value));
}

function mapCheckoutStatus(status: string) {
  if (status === 'expired') return 'expired';
  if (status === 'failed') return 'failed';
  if (status === 'confirmed' || status === 'succeeded') return 'paid';
  return 'checkout_created';
}

export async function syncInventoryPolarCheckout(checkout: Checkout) {
  const metadata = getInventoryMetadata(checkout.metadata);
  if (!metadata) return false;

  const polarStatus = mapCheckoutStatus(String(checkout.status));
  await updateCheckoutPolarState(metadata.checkoutId, metadata.wsId, {
    polar_checkout_id: checkout.id,
    polar_status: polarStatus,
  });

  if (polarStatus === 'expired' || polarStatus === 'failed') {
    const sbAdmin = await createAdminClient();
    const { error } = (await sbAdmin.schema('private').rpc(
      'release_inventory_checkout_session' as never,
      {
        p_checkout_id: metadata.checkoutId,
      } as never
    )) as { error: SupabaseErrorLike };

    if (error) {
      throw new Error(
        error.message ?? 'Failed to release checkout reservation'
      );
    }
  }

  return true;
}

function mapOrderPolarStatus(status: string) {
  if (status === 'paid') return 'paid';
  if (status === 'pending') return 'pending';
  return 'failed';
}

export async function syncInventoryPolarOrder(order: Order) {
  const metadata = getInventoryMetadata(order.metadata);
  if (!metadata) return false;

  await updateCheckoutPolarState(metadata.checkoutId, metadata.wsId, {
    polar_order_id: order.id,
    polar_status: mapOrderPolarStatus(String(order.status)),
  });

  if (order.status === 'paid') {
    const sbAdmin = await createAdminClient();
    const { error } = (await sbAdmin.schema('private').rpc(
      'complete_inventory_checkout_session_payment' as never,
      {
        p_checkout_id: metadata.checkoutId,
        p_polar_order_id: order.id,
      } as never
    )) as { error: SupabaseErrorLike };

    if (error) {
      throw new Error(error.message ?? 'Failed to complete inventory checkout');
    }

    // Book the sale revenue into the workspace finance ledger. Idempotent and
    // non-throwing, so a booking hiccup can never fail the payment webhook.
    await recordInventorySaleFinanceTransaction({
      checkoutId: metadata.checkoutId,
    });
  }

  return true;
}

/**
 * Mirrors an inventory promotion to a Polar discount so it applies at Polar
 * checkout. Best-effort and non-throwing: returns the created discount id (and
 * the environment used), or null if the workspace has no usable Polar
 * integration or the Polar call fails. Prefers a production integration, then
 * sandbox.
 */
export async function syncInventoryPromotionDiscount({
  promotion,
  wsId,
}: {
  promotion: PromotionForPolar;
  wsId: string;
}): Promise<{
  discountId: string | null;
  environment: InventoryPolarEnvironment | null;
}> {
  const environments: InventoryPolarEnvironment[] = ['production', 'sandbox'];

  for (const environment of environments) {
    const integration = await getIntegration({ environment, wsId });
    if (!integration?.access_token_encrypted) continue;

    try {
      const productId = await ensureInventoryPolarProduct({
        environment,
        wsId,
      });
      const accessToken = await decryptIntegrationToken(integration);
      const polar = createPolarClient({ accessToken, environment });
      // Fixed discounts need a currency; promotions are workspace-level, so we
      // default to USD (percentage discounts ignore it).
      const input = buildPolarDiscountInput(promotion, 'USD', productId);
      const discount = await polar.discounts.create(input as never);
      return { discountId: discount.id, environment };
    } catch (error) {
      serverLogger.warn('Inventory promotion Polar discount sync failed', {
        environment,
        error: extractErrorMessage(error),
        wsId,
      });
      return { discountId: null, environment };
    }
  }

  return { discountId: null, environment: null };
}
