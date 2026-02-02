import { createClient } from '@tuturuuu/supabase/next/server';
import {
  batchUpsert,
  createMigrationResponse,
  requireDevMode,
} from '../batch-upsert';

export async function GET(req: Request) {
  const devModeError = requireDevMode();
  if (devModeError) return devModeError;

  const url = new URL(req.url);
  const wsId = url.searchParams.get('ws_id');
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = parseInt(url.searchParams.get('limit') || '500', 10);

  if (!wsId) {
    return Response.json({ error: 'ws_id is required' }, { status: 400 });
  }

  const supabase = await createClient();

  // inventory_batch_products doesn't have ws_id
  // Need to join: batch_products -> batches -> warehouses.ws_id

  // First get all warehouse IDs for this workspace
  const { data: warehouses, error: warehouseError } = await supabase
    .from('inventory_warehouses')
    .select('id')
    .eq('ws_id', wsId);

  if (warehouseError) {
    return Response.json(
      { error: 'Failed to fetch warehouses', details: warehouseError.message },
      { status: 500 }
    );
  }

  const warehouseIds = warehouses?.map((w) => w.id) ?? [];

  if (warehouseIds.length === 0) {
    return Response.json({ data: [], count: 0 });
  }

  // Get all batch IDs for these warehouses
  const { data: batches, error: batchError } = await supabase
    .from('inventory_batches')
    .select('id')
    .in('warehouse_id', warehouseIds);

  if (batchError) {
    return Response.json(
      { error: 'Failed to fetch batches', details: batchError.message },
      { status: 500 }
    );
  }

  const batchIds = batches?.map((b) => b.id) ?? [];

  if (batchIds.length === 0) {
    return Response.json({ data: [], count: 0 });
  }

  // Count total records
  const { count: totalCount, error: countError } = await supabase
    .from('inventory_batch_products')
    .select('*', { count: 'exact', head: true })
    .in('batch_id', batchIds);

  if (countError) {
    return Response.json(
      { error: 'Failed to count records', details: countError.message },
      { status: 500 }
    );
  }

  // Fetch paginated data
  const { data, error } = await supabase
    .from('inventory_batch_products')
    .select('*')
    .in('batch_id', batchIds)
    .range(offset, offset + limit - 1);

  if (error) {
    return Response.json(
      { error: 'Failed to fetch records', details: error.message },
      { status: 500 }
    );
  }

  return Response.json({
    data: data ?? [],
    count: totalCount ?? 0,
  });
}

export async function PUT(req: Request) {
  const devModeError = requireDevMode();
  if (devModeError) return devModeError;

  const json = await req.json();
  // Composite key: (batch_id, product_id, unit_id)
  const result = await batchUpsert({
    table: 'inventory_batch_products',
    data: json?.data || [],
    onConflict: 'batch_id,product_id,unit_id',
  });
  return createMigrationResponse(result, 'inventory-batch-products');
}
