import { batchUpsert, createMigrationResponse } from '../batch-upsert';

export async function PUT(req: Request) {
  const json = await req.json();
  const result = await batchUpsert({
    table: 'user_indicators',
    data: json?.data || [],
    onConflict: 'user_id,indicator_id',
  });
  return createMigrationResponse(result, 'class scores');
}
