import { batchUpsert, createMigrationResponse } from '../batch-upsert';

export async function PUT(req: Request) {
  const json = await req.json();
  const result = await batchUpsert({
    table: 'user_group_linked_products',
    data: json?.data || [],
    onConflict: 'group_id,product_id,unit_id',
  });
  return createMigrationResponse(result, 'class packages');
}
