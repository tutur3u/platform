import { batchUpsert, createMigrationResponse } from '../batch-upsert';

export async function PUT(req: Request) {
  const json = await req.json();
  const result = await batchUpsert({
    table: 'finance_invoice_promotions',
    data: json?.data || [],
    onConflict: 'invoice_id,code',
  });
  return createMigrationResponse(result, 'bill coupons');
}
