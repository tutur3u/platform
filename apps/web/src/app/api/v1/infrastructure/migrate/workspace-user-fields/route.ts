import {
  batchFetch,
  batchUpsert,
  createFetchResponse,
  createMigrationResponse,
} from '../batch-upsert';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const wsId = url.searchParams.get('ws_id');
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = parseInt(url.searchParams.get('limit') || '500', 10);

  if (!wsId) {
    return Response.json({ error: 'ws_id is required' }, { status: 400 });
  }

  const result = await batchFetch({
    table: 'workspace_user_fields',
    wsId,
    offset,
    limit,
  });
  return createFetchResponse(result, 'workspace-user-fields');
}

export async function PUT(req: Request) {
  const json = await req.json();
  const result = await batchUpsert({
    table: 'workspace_user_fields',
    data: json?.data || [],
    onConflict: 'id',
  });
  return createMigrationResponse(result, 'workspace-user-fields');
}
