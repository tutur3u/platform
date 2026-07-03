type InventoryRelationClient = {
  from: (
    table: 'inventory_owners' | 'inventory_units' | 'inventory_warehouses'
  ) => {
    select: (columns: 'id') => {
      eq: (
        column: 'ws_id',
        value: string
      ) => {
        in: (
          column: 'id',
          values: string[]
        ) => Promise<{
          data: Array<{ id: string }> | null;
          error: unknown;
        }>;
      };
    };
  };
};

export type InventoryRelationItem = {
  unit_id: string;
  warehouse_id: string;
  revenue_share_partner_id?: string | null;
};

export type InventoryRelationValidationResult =
  | { ok: true }
  | {
      error?: unknown;
      message: string;
      ok: false;
      status: 400 | 500;
    };

async function countWorkspaceRows({
  client,
  ids,
  table,
  wsId,
}: {
  client: InventoryRelationClient;
  ids: string[];
  table: 'inventory_owners' | 'inventory_units' | 'inventory_warehouses';
  wsId: string;
}) {
  if (ids.length === 0) return { count: 0, error: null };

  const { data, error } = await client
    .from(table)
    .select('id')
    .eq('ws_id', wsId)
    .in('id', ids);

  return {
    count: new Set((data ?? []).map((row) => row.id)).size,
    error,
  };
}

export async function validateInventoryItemWorkspaceRelations({
  inventory,
  inventoryClient,
  wsId,
}: {
  inventory: readonly InventoryRelationItem[];
  inventoryClient: unknown;
  wsId: string;
}): Promise<InventoryRelationValidationResult> {
  const client = inventoryClient as InventoryRelationClient;
  const unitIds = [...new Set(inventory.map((item) => item.unit_id))];
  const warehouseIds = [...new Set(inventory.map((item) => item.warehouse_id))];
  const revenueSharePartnerIds = [
    ...new Set(
      inventory
        .map((item) => item.revenue_share_partner_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const [unitResult, warehouseResult, revenueSharePartnerResult] =
    await Promise.all([
      countWorkspaceRows({
        client,
        ids: unitIds,
        table: 'inventory_units',
        wsId,
      }),
      countWorkspaceRows({
        client,
        ids: warehouseIds,
        table: 'inventory_warehouses',
        wsId,
      }),
      countWorkspaceRows({
        client,
        ids: revenueSharePartnerIds,
        table: 'inventory_owners',
        wsId,
      }),
    ]);

  if (unitResult.error) {
    return {
      ok: false,
      status: 500,
      message: 'Error validating inventory units',
      error: unitResult.error,
    };
  }

  if (warehouseResult.error) {
    return {
      ok: false,
      status: 500,
      message: 'Error validating inventory warehouses',
      error: warehouseResult.error,
    };
  }

  if (revenueSharePartnerResult.error) {
    return {
      ok: false,
      status: 500,
      message: 'Error validating revenue share partners',
      error: revenueSharePartnerResult.error,
    };
  }

  if (unitResult.count !== unitIds.length) {
    return {
      ok: false,
      status: 400,
      message: 'Invalid inventory unit',
    };
  }

  if (warehouseResult.count !== warehouseIds.length) {
    return {
      ok: false,
      status: 400,
      message: 'Invalid inventory warehouse',
    };
  }

  if (revenueSharePartnerResult.count !== revenueSharePartnerIds.length) {
    return {
      ok: false,
      status: 400,
      message: 'Invalid revenue share partner',
    };
  }

  return { ok: true };
}
