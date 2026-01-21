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
    table: 'finance_invoice_promotions',
    wsId,
    offset,
    limit,
  });
  return createFetchResponse(result, 'finance-invoice-promotions');
}

export async function PUT(req: Request) {
  const json = await req.json();
  const result = await batchUpsert({
    table: 'finance_invoice_promotions',
    data: json?.data || [],
    onConflict: 'id',
  });
  return createMigrationResponse(result, 'finance-invoice-promotions');
}
