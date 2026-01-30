import {
  batchUpsert,
  createMigrationResponse,
  requireDevMode,
} from '../batch-upsert';

export async function PUT(req: Request) {
  const devModeError = requireDevMode();
  if (devModeError) return devModeError;

  const json = await req.json();
  const result = await batchUpsert({
    table: 'finance_invoice_products',
    data: json?.data || [],
    onConflict: 'invoice_id,product_name,product_unit,warehouse',
  });
  return createMigrationResponse(result, 'bill packages');
}
