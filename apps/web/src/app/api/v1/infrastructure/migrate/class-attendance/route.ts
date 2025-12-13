import { batchUpsert, createMigrationResponse } from '../batch-upsert';

export async function PUT(req: Request) {
  const json = await req.json();
  const result = await batchUpsert({
    table: 'user_group_attendance',
    data: json?.data || [],
    onConflict: 'group_id,user_id,date',
  });
  return createMigrationResponse(result, 'class attendance');
}
