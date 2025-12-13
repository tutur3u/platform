import { batchUpsert, createMigrationResponse } from '../batch-upsert';

export async function PUT(req: Request) {
  const json = await req.json();
  const result = await batchUpsert({
    table: 'workspace_user_groups_users',
    data: json?.data || [],
    onConflict: 'user_id,group_id',
  });
  return createMigrationResponse(result, 'class members');
}
