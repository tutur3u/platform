import { batchUpsert, createMigrationResponse } from '../batch-upsert';

export async function PUT(req: Request) {
  const json = await req.json();
  const result = await batchUpsert({
    table: 'inventory_products',
    data: json?.data || [],
    onConflict: 'product_id,unit_id,warehouse_id',
  });
  return createMigrationResponse(result, 'product prices');
}
