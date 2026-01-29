import { createClient } from '@tuturuuu/supabase/next/server';
import type { Tables } from '@tuturuuu/types/supabase';
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

type InventoryWarehouse = Pick<Tables<'inventory_warehouses'>, 'id' | 'name'>;
type InventoryUnit = Pick<Tables<'inventory_units'>, 'id' | 'name'>;
type InventoryProduct = Pick<
  Tables<'inventory_products'>,
  'amount' | 'min_amount' | 'price' | 'warehouse_id' | 'unit_id' | 'created_at'
> & {
  inventory_warehouses: InventoryWarehouse | null;
  inventory_units: InventoryUnit | null;
};
type ProductCategory = Pick<Tables<'product_categories'>, 'name'>;
type RawProduct = Tables<'workspace_products'> & {
  product_categories: ProductCategory | null;
  inventory_products: InventoryProduct[] | null;
};

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

    const queryBuilder = supabase
      .from('workspace_products')
      .select(
        'id, name, manufacturer, description, usage, category_id, created_at, ws_id, product_categories(name), inventory_products!inventory_products_product_id_fkey(amount, min_amount, price, warehouse_id, unit_id, created_at, inventory_warehouses!inventory_products_warehouse_id_fkey(id, name), inventory_units!inventory_products_unit_id_fkey(id, name))',
        {
          count: 'exact',
        }
      )
      .eq('ws_id', wsId);

    if (q) queryBuilder.ilike('name', `%${q}%`);

    const start = (page - 1) * pageSize;
    const end = page * pageSize - 1;
    queryBuilder.range(start, end);

    // Apply sorting - default to created_at desc for consistent ordering
    if (sortBy && sortOrder) {
      queryBuilder.order(sortBy, { ascending: sortOrder === 'asc' });
    } else {
      queryBuilder.order('created_at', { ascending: false });
    }

    const { data: rawData, error, count } = await queryBuilder;

    if (error) throw error;

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

    const typedData = rawData as RawProduct[] | null;
    const data = (typedData ?? []).map((item) => {
      const primaryInventory = selectPrimaryInventory(item.inventory_products);

      return {
        id: item.id,
        name: item.name,
        manufacturer: item.manufacturer,
        description: item.description,
        usage: item.usage,
        unit: primaryInventory?.inventory_units?.name ?? null,
        stock: (item.inventory_products || []).map((inventory) => ({
          amount: inventory.amount,
          min_amount: inventory.min_amount,
          unit: inventory.inventory_units?.name,
          warehouse: inventory.inventory_warehouses?.name,
          price: inventory.price,
        })),
        min_amount: primaryInventory?.min_amount ?? null,
        warehouse: primaryInventory?.inventory_warehouses?.name ?? null,
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
