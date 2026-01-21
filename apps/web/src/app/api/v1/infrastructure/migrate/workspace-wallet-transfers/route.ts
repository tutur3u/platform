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
    table: 'workspace_wallet_transfers',
    wsId,
    offset,
    limit,
  });
  return createFetchResponse(result, 'workspace-wallet-transfers');
}

export async function PUT(req: Request) {
  const json = await req.json();
  const result = await batchUpsert({
    table: 'workspace_wallet_transfers',
    data: json?.data || [],
    onConflict: 'id',
  });
  return createMigrationResponse(result, 'workspace-wallet-transfers');
}
