import { batchUpsert, createMigrationResponse } from '../batch-upsert';

export async function PUT(req: Request) {
  const json = await req.json();
  const result = await batchUpsert({
    table: 'external_user_monthly_reports',
    data: json?.data || [],
  });
  return createMigrationResponse(result, 'user monthly reports');
}
