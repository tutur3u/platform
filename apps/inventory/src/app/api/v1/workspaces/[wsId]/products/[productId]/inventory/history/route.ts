import type { InventoryStockHistoryResponse } from '@tuturuuu/internal-api/inventory';
import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { canViewInventoryStock } from '@tuturuuu/inventory-core/permissions';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mapStockMovement, type RawStockMovement } from './movement';

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

interface Params {
  params: Promise<{ productId: string; wsId: string }>;
}

export async function GET(req: Request, { params }: Params) {
  const { productId, wsId: requestedWsId } = await params;
  const parsedQuery = QuerySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams)
  );
  if (!parsedQuery.success) {
    return NextResponse.json(
      { message: 'Invalid pagination parameters' },
      { status: 400 }
    );
  }

  const auth = await authorizeInventoryWorkspace(req, requestedWsId, {
    appSessionTargets: ['inventory'],
  });
  if (!auth.ok) return auth.response;
  const { permissions, wsId } = auth.value;
  if (!canViewInventoryStock(permissions)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const sbAdmin = await createAdminClient();
  const { data: product, error: productError } = await sbAdmin
    .from('workspace_products')
    .select('id')
    .eq('id', productId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (productError) {
    console.error('Error validating stock history product', productError);
    return NextResponse.json(
      { message: 'Error validating product' },
      { status: 500 }
    );
  }
  if (!product) {
    return NextResponse.json({ message: 'Product not found' }, { status: 404 });
  }

  const { limit, offset } = parsedQuery.data;
  const { data, error } = await sbAdmin
    .from('product_stock_changes')
    .select(
      `id, product_id, amount, beneficiary_id, creator_id, unit_id, warehouse_id, note, created_at,
       warehouse:inventory_warehouses(id, name),
       unit:inventory_units(id, name),
       operator:workspace_users!product_stock_changes_creator_id_fkey(id, display_name, full_name, email),
       beneficiary:workspace_users!product_stock_changes_beneficiary_id_fkey(id, display_name, full_name, email)`
    )
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit);

  if (error) {
    console.error('Error fetching product stock history', error);
    return NextResponse.json(
      { message: 'Error fetching stock history' },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as unknown as RawStockMovement[];
  const response: InventoryStockHistoryResponse = {
    data: rows.slice(0, limit).map(mapStockMovement),
    pagination: {
      hasMore: rows.length > limit,
      limit,
      offset,
    },
  };

  return NextResponse.json(response);
}
