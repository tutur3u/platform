import { batchUpsert, createMigrationResponse } from '../batch-upsert';

export async function PUT(req: Request) {
  const json = await req.json();
  const result = await batchUpsert({
    table: 'workspace_configs',
    data: json?.data || [],
    onConflict: 'ws_id,id',
  });
  return createMigrationResponse(result, 'workspace-configs');
}
