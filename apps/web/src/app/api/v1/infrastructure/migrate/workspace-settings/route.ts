import { batchUpsert, createMigrationResponse } from '../batch-upsert';

export async function PUT(req: Request) {
  const json = await req.json();
  const result = await batchUpsert({
    table: 'workspace_settings',
    data: json?.data || [],
    onConflict: 'ws_id',
  });
  return createMigrationResponse(result, 'workspace-settings');
}
