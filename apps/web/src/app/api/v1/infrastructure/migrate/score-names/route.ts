import { batchUpsert, createMigrationResponse } from '../batch-upsert';

export async function PUT(req: Request) {
  const json = await req.json();
  const result = await batchUpsert({
    table: 'healthcare_vitals',
    data: json?.data || [],
  });
  return createMigrationResponse(result, 'score names');
}
