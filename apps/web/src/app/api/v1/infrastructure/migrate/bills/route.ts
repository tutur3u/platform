import { batchUpsert, createMigrationResponse } from '../batch-upsert';

export async function PUT(req: Request) {
  const json = await req.json();
  const result = await batchUpsert({
    table: 'finance_invoices',
    data: json?.data || [],
  });
  return createMigrationResponse(result, 'bills');
}
