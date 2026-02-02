import { createClient } from '@tuturuuu/supabase/next/server';
import type {
  InventoryProduct,
  RawInventoryProduct,
} from '@tuturuuu/types/primitives/InventoryProductRelations';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const SearchParamsSchema = z.object({
  q: z.string().default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(10),
  sortBy: z
    .enum([
      'id',
      'name',
      'manufacturer',
      'description',
      'usage',
      'category_id',
      'created_at',
    ])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const supabase = await createClient();
    const { wsId: id } = await params;

    // Resolve workspace ID
    const wsId = await normalizeWorkspaceId(id);

    // Check permissions
    const { containsPermission } = await getPermissions({ wsId });
    const canViewInventory = containsPermission('view_inventory');
    const canViewStockQuantity = containsPermission('view_stock_quantity');

    if (!canViewInventory) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const params_obj: Record<string, string | string[]> = {};

    searchParams.forEach((value, key) => {
      params_obj[key] = value;
    });

    const parsed = SearchParamsSchema.safeParse(params_obj);
    if (!parsed.success) {
      console.error('Invalid query parameters:', parsed.error);
      return NextResponse.json(
        { message: 'Invalid query parameters' },
        { status: 400 }
      );
    }
    const { q, page, pageSize, sortBy, sortOrder } = parsed.data;

    const start = (page - 1) * pageSize;
    const end = page * pageSize - 1;

    let rawData: RawInventoryProduct[] | null = null;
    let count: number | null = null;

    if (canViewStockQuantity) {
      let query = supabase
        .from('workspace_products')
        .select(
          'id, name, manufacturer, description, usage, category_id, created_at, ws_id, product_categories(name), inventory_products!inventory_products_product_id_fkey(amount, min_amount, price, warehouse_id, unit_id, created_at, inventory_warehouses!inventory_products_warehouse_id_fkey(id, name), inventory_units!inventory_products_unit_id_fkey(id, name))',
          {
            count: 'exact',
          }
        )
        .eq('ws_id', wsId);

      if (q) query = query.ilike('name', `%${q}%`);
      query = query.range(start, end);

      // Apply sorting - default to created_at desc for consistent ordering
      if (sortBy && sortOrder) {
        query = query.order(sortBy, { ascending: sortOrder === 'asc' });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const {
        data,
        error,
        count: fetchedCount,
      } = await query.overrideTypes<RawInventoryProduct[]>();
      if (error) throw error;
      rawData = data;
      count = fetchedCount;
    } else {
      let query = supabase
        .from('workspace_products')
        .select(
          'id, name, manufacturer, description, usage, category_id, created_at, ws_id, product_categories(name)',
          {
            count: 'exact',
          }
        )
        .eq('ws_id', wsId);

      if (q) query = query.ilike('name', `%${q}%`);
      query = query.range(start, end);

      // Apply sorting - default to created_at desc for consistent ordering
      if (sortBy && sortOrder) {
        query = query.order(sortBy, { ascending: sortOrder === 'asc' });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const {
        data,
        error,
        count: fetchedCount,
      } = await query.overrideTypes<RawInventoryProduct[]>();
      if (error) throw error;
      rawData = data;
      count = fetchedCount;
    }

    const selectPrimaryInventory = (
      inventories: InventoryProduct[] | null | undefined
    ) => {
      if (!inventories?.length) return undefined;

      return inventories.slice().sort((a, b) => {
        const aKey = [
          a.warehouse_id ?? '',
          a.unit_id ?? '',
          a.created_at ?? '',
        ].join('|');
        const bKey = [
          b.warehouse_id ?? '',
          b.unit_id ?? '',
          b.created_at ?? '',
        ].join('|');

        return aKey.localeCompare(bKey);
      })[0];
    };

    const data = (rawData ?? []).map((item) => {
      const primaryInventory = selectPrimaryInventory(item.inventory_products);

      return {
        id: item.id,
        name: item.name,
        manufacturer: item.manufacturer,
        description: item.description,
        usage: item.usage,
        unit: canViewStockQuantity
          ? (primaryInventory?.inventory_units?.name ?? null)
          : null,
        stock: canViewStockQuantity
          ? (item.inventory_products || []).map((inventory) => ({
              amount: inventory.amount,
              min_amount: inventory.min_amount,
              unit: inventory.inventory_units?.name,
              warehouse: inventory.inventory_warehouses?.name,
              price: inventory.price,
            }))
          : [],
        min_amount: canViewStockQuantity
          ? (primaryInventory?.min_amount ?? null)
          : null,
        warehouse: canViewStockQuantity
          ? (primaryInventory?.inventory_warehouses?.name ?? null)
          : null,
        category: item.product_categories?.name,
        category_id: item.category_id,
        ws_id: item.ws_id,
        created_at: item.created_at,
      };
    });

    return NextResponse.json({
      data,
      count: count ?? 0,
    });
  } catch (error) {
    console.error('Error in workspace products API:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
