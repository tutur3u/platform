import type { AiMemoryProduct, AiMemorySettings } from './types';

const DEFAULT_SETTINGS: AiMemorySettings = {
  enabled: true,
  productEnabled: true,
  products: {},
};

type RpcSettingsRow = {
  enabled?: boolean | null;
  product_enabled?: boolean | null;
  products?: Record<string, boolean> | null;
};

type SupabaseRpcClient = {
  schema: (schema: string) => {
    rpc: (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };
};

async function createDefaultRpcClient() {
  const { createAdminClient } = await import('@tuturuuu/supabase/next/server');
  return (await createAdminClient()) as unknown as SupabaseRpcClient;
}

function normalizeSettings(
  row: RpcSettingsRow | null | undefined,
  product: AiMemoryProduct
): AiMemorySettings {
  const products = (row?.products ?? {}) as AiMemorySettings['products'];
  const enabled = row?.enabled ?? DEFAULT_SETTINGS.enabled;
  const productEnabled =
    row?.product_enabled ??
    products[product] ??
    DEFAULT_SETTINGS.productEnabled;

  return {
    enabled,
    productEnabled,
    products,
  };
}

export async function getAiMemorySettings({
  db,
  product,
  userId,
  wsId,
}: {
  db?: SupabaseRpcClient;
  product: AiMemoryProduct;
  userId: string;
  wsId: string;
}): Promise<AiMemorySettings> {
  try {
    const client = db ?? (await createDefaultRpcClient());
    const { data, error } = await client
      .schema('private')
      .rpc('get_ai_memory_settings', {
        p_product: product,
        p_user_id: userId,
        p_ws_id: wsId,
      });

    if (error) return DEFAULT_SETTINGS;

    const row = Array.isArray(data) ? data[0] : data;
    return normalizeSettings(row as RpcSettingsRow | null, product);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function isAiMemoryEnabledForScope(args: {
  db?: SupabaseRpcClient;
  product: AiMemoryProduct;
  userId: string;
  wsId: string;
}) {
  const settings = await getAiMemorySettings(args);
  return settings.enabled && settings.productEnabled;
}
