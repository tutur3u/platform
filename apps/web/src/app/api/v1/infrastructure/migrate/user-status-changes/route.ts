import { batchUpsert, createMigrationResponse } from '../batch-upsert';

export async function PUT(req: Request) {
  const json = await req.json();
  const result = await batchUpsert({
    table: 'workspace_user_status_changes',
    data: json?.data || [],
  });
  return createMigrationResponse(result, 'user status changes');
}
