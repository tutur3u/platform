import 'server-only';

import { createHash } from 'node:crypto';
import {
  type InventoryPolarEnvironment,
  type InventoryPolarIntegration,
  type InventoryPolarSettings,
  type InventoryPolarSettingsPayload,
  toPolarCurrency,
} from '@tuturuuu/internal-api/inventory';
import { createPolarClient } from '@tuturuuu/payment/polar/server';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { decryptField, encryptField } from '@tuturuuu/utils/encryption';
import {
  getOrCreateWorkspaceKey,
  getWorkspaceKey,
} from '../../workspace-encryption';

export type SupabaseErrorLike = { message?: string } | null;

export type PolarIntegrationRow = {
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

export function environmentFromDeployment(settings: InventoryPolarSettings) {
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

export function extractErrorMessage(error: unknown) {
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

export async function getPrivateAdmin() {
  return (await createAdminClient()).schema('private');
}

/**
 * Reads a storefront's chosen Polar environment (sandbox/production) so checkout
 * targets the right Polar account. Returns null when unset so callers can fall
 * back to the deployment default.
 */
export async function getStorefrontPolarEnvironment(
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

export async function getIntegration({
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

export async function decryptIntegrationToken(row: PolarIntegrationRow) {
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
      console.warn('Inventory Polar product validation failed', {
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

export function productHasCurrency(
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
      console.warn('Inventory Polar checkout product validation failed', {
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
