import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { canViewInventoryDashboard } from '@tuturuuu/inventory-core/permissions';
import { getInventoryBatches } from '@tuturuuu/inventory-core/product-rpc';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

async function countOrZero(label: string, loader: () => Promise<number>) {
  try {
    return await loader();
  } catch (error) {
    console.error(`Error fetching inventory statistic: ${label}`, error);
    return 0;
  }
}

export async function GET(req: Request, { params }: Params) {
  const { wsId: id } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const { permissions, wsId } = authorization.value;
  if (!canViewInventoryDashboard(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const sbAdmin = await createAdminClient();
  const inventory = sbAdmin.schema('private');

  const [
    products,
    inventoryProducts,
    categories,
    batches,
    warehouses,
    units,
    suppliers,
    promotions,
  ] = await Promise.all([
    countOrZero('products', async () => {
      const { data, error } = await sbAdmin.rpc(
        'get_workspace_products_count',
        {
          ws_id: wsId,
        }
      );
      if (error) throw error;
      return Number(data ?? 0);
    }),
    countOrZero('inventory products', async () => {
      const { data, error } = await sbAdmin.rpc(
        'get_inventory_products_count',
        {
          ws_id: wsId,
        }
      );
      if (error) throw error;
      return Number(data ?? 0);
    }),
    countOrZero('categories', async () => {
      const { count, error } = await sbAdmin
        .from('product_categories')
        .select('id', { count: 'exact', head: true })
        .eq('ws_id', wsId);
      if (error) throw error;
      return count ?? 0;
    }),
    countOrZero('batches', async () => {
      const { count } = await getInventoryBatches({
        limit: 1,
        sbAdmin,
        wsId,
      });
      return count ?? 0;
    }),
    countOrZero('warehouses', async () => {
      const { count, error } = await inventory
        .from('inventory_warehouses')
        .select('id', { count: 'exact', head: true })
        .eq('ws_id', wsId);
      if (error) throw error;
      return count ?? 0;
    }),
    countOrZero('units', async () => {
      const { count, error } = await inventory
        .from('inventory_units')
        .select('id', { count: 'exact', head: true })
        .eq('ws_id', wsId);
      if (error) throw error;
      return count ?? 0;
    }),
    countOrZero('suppliers', async () => {
      const { count, error } = await inventory
        .from('inventory_suppliers')
        .select('id', { count: 'exact', head: true })
        .eq('ws_id', wsId);
      if (error) throw error;
      return count ?? 0;
    }),
    countOrZero('promotions', async () => {
      const { count, error } = await inventory
        .from('workspace_promotions')
        .select('id', { count: 'exact', head: true })
        .eq('ws_id', wsId);
      if (error) throw error;
      return count ?? 0;
    }),
  ]);

  return NextResponse.json({
    batches,
    categories,
    inventoryProducts,
    products,
    promotions,
    suppliers,
    units,
    warehouses,
  });
}
