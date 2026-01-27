import { createClient } from '@tuturuuu/supabase/next/server';
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
        '*, product_categories(name), inventory_products!inventory_products_product_id_fkey(amount, min_amount, price, unit_id, warehouse_id, inventory_warehouses!inventory_products_warehouse_id_fkey(name), inventory_units!inventory_products_unit_id_fkey(name)), product_stock_changes!product_stock_changes_product_id_fkey(amount, created_at, beneficiary:workspace_users!product_stock_changes_beneficiary_id_fkey(full_name, email), creator:workspace_users!product_stock_changes_creator_id_fkey(full_name, email))',
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

    interface InventoryProduct {
      amount: number | null;
      min_amount: number;
      price: number;
      unit_id: string;
      warehouse_id: string;
      inventory_warehouses: {
        name: string | null;
      } | null;
      inventory_units: {
        name: string | null;
      } | null;
    }

    interface ProductStockChange {
      amount: number;
      created_at: string;
      beneficiary: {
        full_name: string | null;
        email: string | null;
      } | null;
      creator: {
        full_name: string | null;
        email: string | null;
      } | null;
    }

    const data = (rawData || []).map((item) => ({
      id: item.id,
      name: item.name,
      manufacturer: item.manufacturer,
      description: item.description,
      usage: item.usage,
      unit: (item.inventory_products as InventoryProduct[])?.[0]
        ?.inventory_units?.name,
      stock: ((item.inventory_products as InventoryProduct[] | null) || []).map(
        (inventory: InventoryProduct) => ({
          amount: inventory.amount,
          min_amount: inventory.min_amount,
          unit: inventory.inventory_units?.name,
          warehouse: inventory.inventory_warehouses?.name,
          price: inventory.price,
        })
      ),
      // Inventory with ids for editing
      inventory: (
        (item.inventory_products as InventoryProduct[] | null) || []
      ).map((inventory: InventoryProduct) => ({
        unit_id: inventory.unit_id,
        warehouse_id: inventory.warehouse_id,
        amount: inventory.amount,
        min_amount: inventory.min_amount,
        price: inventory.price,
      })),
      min_amount:
        (item.inventory_products as InventoryProduct[])?.[0]?.min_amount || 0,
      warehouse: (item.inventory_products as InventoryProduct[])?.[0]
        ?.inventory_warehouses?.name,
      category: item.product_categories?.name,
      category_id: item.category_id,
      ws_id: item.ws_id,
      created_at: item.created_at,
      stock_changes:
        (item.product_stock_changes as ProductStockChange[])?.map(
          (change: ProductStockChange) => ({
            amount: change.amount,
            creator: change.creator,
            beneficiary: change.beneficiary,
            created_at: change.created_at,
          })
        ) || [],
    }));

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
