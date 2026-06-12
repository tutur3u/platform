import 'server-only';

import type {
  InventoryCostImportPayload,
  InventoryCostImportPreview,
  InventoryCostingAnalytics,
  InventoryCostProfile,
  InventoryCostProfileListQuery,
  InventoryCostProfilePayload,
  InventoryListResponse,
} from '@tuturuuu/internal-api/inventory';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { parseInventoryCostingCsv } from './costing-csv';

type SupabaseErrorLike = { message?: string } | null;

type ListRpcRow<TKey extends string, TValue> = {
  total_count: number | null;
} & Record<TKey, TValue | null>;

function normalizePagination(page?: number, pageSize?: number) {
  const limit = Math.max(1, Math.min(pageSize ?? 25, 100));
  const offset = (Math.max(1, page ?? 1) - 1) * limit;
  return { limit, offset };
}

function normalizeSearch(q?: string) {
  const value = q?.trim();
  return value ? value : null;
}

function mapRpcList<TKey extends string, TValue>(
  rows: ListRpcRow<TKey, TValue>[] | null | undefined,
  key: TKey
): InventoryListResponse<TValue> {
  return {
    count: rows?.[0]?.total_count ?? 0,
    data: (rows ?? []).map((row) => row[key]).filter(Boolean) as TValue[],
  };
}

async function createPrivateInventoryClient() {
  const sbAdmin = await createAdminClient();
  return { inventory: sbAdmin.schema('private'), sbAdmin };
}

async function assertWorkspaceProduct(
  sbAdmin: Awaited<ReturnType<typeof createPrivateInventoryClient>>['sbAdmin'],
  wsId: string,
  productId: string | null | undefined
) {
  if (!productId) return;

  const { count, error } = await sbAdmin
    .from('workspace_products')
    .select('id', { count: 'exact', head: true })
    .eq('id', productId)
    .eq('ws_id', wsId);

  if (error) throw error;
  if (!count) throw new Error('Product not found in workspace');
}

async function assertWorkspaceCategory(
  sbAdmin: Awaited<ReturnType<typeof createPrivateInventoryClient>>['sbAdmin'],
  wsId: string,
  categoryId: string | null | undefined
) {
  if (!categoryId) return;

  const { count, error } = await sbAdmin
    .from('product_categories')
    .select('id', { count: 'exact', head: true })
    .eq('id', categoryId)
    .eq('ws_id', wsId);

  if (error) throw error;
  if (!count) throw new Error('Category not found in workspace');
}

async function replaceScenarioRows(
  inventory: Awaited<
    ReturnType<typeof createPrivateInventoryClient>
  >['inventory'],
  wsId: string,
  profileId: string,
  scenarios: NonNullable<InventoryCostProfilePayload['scenarios']>
) {
  const { error: deleteError } = await inventory
    .from('inventory_cost_scenarios' as never)
    .delete()
    .eq('ws_id' as never, wsId as never)
    .eq('profile_id' as never, profileId as never);

  if (deleteError) throw deleteError;

  if (scenarios.length === 0) return;

  const rows = scenarios.map((scenario, index) => ({
    art_commission_cost: scenario.artCommissionCost ?? 0,
    batch_size: scenario.batchSize,
    manufacturing_cost_per_unit: scenario.manufacturingCostPerUnit ?? 0,
    name: scenario.name,
    other_cost_per_unit: scenario.otherCostPerUnit ?? 0,
    packaging_cost_per_unit: scenario.packagingCostPerUnit ?? 0,
    profile_id: profileId,
    shipping_cost: scenario.shippingCost ?? 0,
    sort_order: scenario.sortOrder ?? index,
    tariff_cost: scenario.tariffCost ?? 0,
    ws_id: wsId,
  }));
  const { error } = await inventory
    .from('inventory_cost_scenarios' as never)
    .insert(rows as never);

  if (error) throw error;
}

async function replaceProfitShareRows(
  inventory: Awaited<
    ReturnType<typeof createPrivateInventoryClient>
  >['inventory'],
  wsId: string,
  profileId: string,
  profitShares: NonNullable<InventoryCostProfilePayload['profitShares']>
) {
  const { error: deleteError } = await inventory
    .from('inventory_cost_profit_shares' as never)
    .delete()
    .eq('ws_id' as never, wsId as never)
    .eq('profile_id' as never, profileId as never);

  if (deleteError) throw deleteError;

  if (profitShares.length === 0) return;

  const rows = profitShares.map((share, index) => ({
    profile_id: profileId,
    recipient_label: share.recipientLabel,
    share_percentage: share.sharePercentage,
    sort_order: share.sortOrder ?? index,
    ws_id: wsId,
  }));
  const { error } = await inventory
    .from('inventory_cost_profit_shares' as never)
    .insert(rows as never);

  if (error) throw error;
}

function hasPayloadKey<T extends object, K extends PropertyKey>(
  payload: T,
  key: K
): payload is T & Record<K, unknown> {
  return Object.hasOwn(payload, key);
}

export async function listCostProfiles(
  wsId: string,
  query: InventoryCostProfileListQuery = {}
) {
  const { inventory } = await createPrivateInventoryClient();
  const { limit, offset } = normalizePagination(query.page, query.pageSize);
  const status = query.status && query.status !== 'all' ? query.status : null;
  const { data, error } = (await inventory.rpc(
    'list_inventory_cost_profiles' as never,
    {
      p_limit: limit,
      p_offset: offset,
      p_search: normalizeSearch(query.q),
      p_status: status,
      p_ws_id: wsId,
    } as never
  )) as {
    data: ListRpcRow<'profile', InventoryCostProfile>[] | null;
    error: SupabaseErrorLike;
  };

  if (error) throw error;
  return mapRpcList(data, 'profile');
}

export async function getCostProfile(wsId: string, profileId: string) {
  const { inventory } = await createPrivateInventoryClient();
  const { data, error } = (await inventory.rpc(
    'get_inventory_cost_profile' as never,
    {
      p_profile_id: profileId,
      p_ws_id: wsId,
    } as never
  )) as {
    data: InventoryCostProfile | null;
    error: SupabaseErrorLike;
  };

  if (error) throw error;
  return data;
}

export async function getCostingAnalytics(
  wsId: string
): Promise<InventoryCostingAnalytics> {
  const { inventory } = await createPrivateInventoryClient();
  const { data, error } = (await inventory.rpc(
    'get_inventory_costing_analytics' as never,
    { p_ws_id: wsId } as never
  )) as {
    data: InventoryCostingAnalytics | null;
    error: SupabaseErrorLike;
  };

  if (error) throw error;
  return (
    data ?? {
      averageMarginPercentage: 0,
      lowestBreakEvenQuantity: null,
      profilesCount: 0,
      scenarios: [],
      scenariosCount: 0,
    }
  );
}

export async function createCostProfile(
  wsId: string,
  payload: InventoryCostProfilePayload
) {
  const { inventory, sbAdmin } = await createPrivateInventoryClient();
  await assertWorkspaceProduct(sbAdmin, wsId, payload.productId);
  await assertWorkspaceCategory(sbAdmin, wsId, payload.categoryId);

  const { data, error } = await inventory
    .from('inventory_cost_profiles' as never)
    .insert({
      category_id: payload.categoryId ?? null,
      currency: payload.currency ?? 'USD',
      name: payload.name,
      notes: payload.notes ?? null,
      product_id: payload.productId ?? null,
      status: payload.status ?? 'active',
      target_retail_price: payload.targetRetailPrice,
      ws_id: wsId,
    } as never)
    .select('id' as never)
    .single();

  if (error) throw error;
  const profileId = (data as unknown as { id: string }).id;

  await replaceScenarioRows(
    inventory,
    wsId,
    profileId,
    payload.scenarios ?? []
  );
  await replaceProfitShareRows(
    inventory,
    wsId,
    profileId,
    payload.profitShares ?? []
  );

  const profile = await getCostProfile(wsId, profileId);
  if (!profile) throw new Error('Failed to create inventory cost profile');
  return profile;
}

export async function updateCostProfile(
  wsId: string,
  profileId: string,
  payload: Partial<InventoryCostProfilePayload>
) {
  const { inventory, sbAdmin } = await createPrivateInventoryClient();
  await assertWorkspaceProduct(sbAdmin, wsId, payload.productId);
  await assertWorkspaceCategory(sbAdmin, wsId, payload.categoryId);

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (payload.name !== undefined) update.name = payload.name;
  if (payload.status !== undefined) update.status = payload.status;
  if (payload.currency !== undefined) update.currency = payload.currency;
  if (payload.targetRetailPrice !== undefined) {
    update.target_retail_price = payload.targetRetailPrice;
  }
  if (hasPayloadKey(payload, 'productId')) {
    update.product_id = payload.productId ?? null;
  }
  if (hasPayloadKey(payload, 'categoryId')) {
    update.category_id = payload.categoryId ?? null;
  }
  if (hasPayloadKey(payload, 'notes')) {
    update.notes = payload.notes ?? null;
  }

  const { data, error } = await inventory
    .from('inventory_cost_profiles' as never)
    .update(update as never)
    .eq('id' as never, profileId as never)
    .eq('ws_id' as never, wsId as never)
    .select('id' as never)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  if (payload.scenarios) {
    await replaceScenarioRows(inventory, wsId, profileId, payload.scenarios);
  }
  if (payload.profitShares) {
    await replaceProfitShareRows(
      inventory,
      wsId,
      profileId,
      payload.profitShares
    );
  }

  return getCostProfile(wsId, profileId);
}

export async function deleteCostProfile(wsId: string, profileId: string) {
  const { inventory } = await createPrivateInventoryClient();
  const { data, error } = await inventory
    .from('inventory_cost_profiles' as never)
    .delete()
    .eq('id' as never, profileId as never)
    .eq('ws_id' as never, wsId as never)
    .select('id' as never)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

function deriveProfitShares(
  rows: InventoryCostImportPreview['rows']
): InventoryCostProfilePayload['profitShares'] {
  const first = rows[0];
  const talentProfit = first?.talentProfitPerSale ?? null;
  const partnerProfit = first?.partnerProfitPerSale ?? null;
  const totalProfit = (talentProfit ?? 0) + (partnerProfit ?? 0);

  if (totalProfit > 0) {
    return [
      {
        recipientLabel: 'Talent',
        sharePercentage: Number(
          (((talentProfit ?? 0) / totalProfit) * 100).toFixed(2)
        ),
        sortOrder: 0,
      },
      {
        recipientLabel: 'Partner',
        sharePercentage: Number(
          (((partnerProfit ?? 0) / totalProfit) * 100).toFixed(2)
        ),
        sortOrder: 1,
      },
    ];
  }

  return [
    { recipientLabel: 'Talent', sharePercentage: 70, sortOrder: 0 },
    { recipientLabel: 'Partner', sharePercentage: 30, sortOrder: 1 },
  ];
}

export async function importCostingCsv(
  wsId: string,
  payload: InventoryCostImportPayload
) {
  const preview = parseInventoryCostingCsv(payload.csv);

  if (!payload.commit || preview.rows.length === 0) {
    return preview;
  }

  const groups = new Map<string, InventoryCostImportPreview['rows']>();
  for (const row of preview.rows) {
    const existing = groups.get(row.itemCategory) ?? [];
    existing.push(row);
    groups.set(row.itemCategory, existing);
  }

  const createdProfiles: InventoryCostProfile[] = [];
  for (const [name, rows] of groups) {
    const first = rows[0];
    if (!first) continue;

    const profile = await createCostProfile(wsId, {
      currency: 'USD',
      name,
      profitShares: deriveProfitShares(rows),
      scenarios: rows.map((row, index) => ({
        batchSize: row.batchSize,
        manufacturingCostPerUnit: row.manufacturingCostPerUnit,
        name: `${row.batchSize} units`,
        otherCostPerUnit: Math.max(
          (row.totalCostPerUnit ?? row.manufacturingCostPerUnit) -
            row.manufacturingCostPerUnit,
          0
        ),
        sortOrder: index,
      })),
      status: 'active',
      targetRetailPrice: first.targetRetailPrice,
    });

    createdProfiles.push(profile);
  }

  return { ...preview, createdProfiles };
}
