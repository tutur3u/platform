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
    table: 'inventory_batch_products',
    wsId,
    offset,
    limit,
  });
  return createFetchResponse(result, 'inventory-batch-products');
}

export async function PUT(req: Request) {
  const json = await req.json();
  const result = await batchUpsert({
    table: 'inventory_batch_products',
    data: json?.data || [],
    onConflict: 'id',
  });
  return createMigrationResponse(result, 'inventory-batch-products');
}
