import { batchUpsert, createMigrationResponse } from '../batch-upsert';

export async function PUT(req: Request) {
  const json = await req.json();
  const result = await batchUpsert({
    table: 'user_linked_promotions',
    data: json?.data || [],
    onConflict: 'user_id,promo_id',
  });
  return createMigrationResponse(result, 'user coupons');
}
