import { batchUpsert, createMigrationResponse } from '../batch-upsert';

export async function PUT(req: Request) {
  const json = await req.json();
  const result = await batchUpsert({
    table: 'workspace_user_groups',
    data: json?.data || [],
  });
  return createMigrationResponse(result, 'roles');
}
