import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  batchFetch,
  batchUpsert,
  createFetchResponse,
  createMigrationResponse,
  requireDevMode,
} from '../batch-upsert';

export async function GET(req: Request) {
  const devModeError = requireDevMode();
  if (devModeError) return devModeError;

  const url = new URL(req.url);
  const wsId = url.searchParams.get('ws_id');
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = parseInt(url.searchParams.get('limit') || '500', 10);

  if (!wsId) {
    return Response.json({ error: 'ws_id is required' }, { status: 400 });
  }

  const supabase = createAdminClient({ noCookie: true });
  const result = await batchFetch({
    table: 'finance_invoices',
    wsId,
    offset,
    limit,
    supabase,
  });
  return createFetchResponse(result, 'finance-invoices');
}

export async function PUT(req: Request) {
  const devModeError = requireDevMode();
  if (devModeError) return devModeError;

  const json = await req.json();
  const supabase = createAdminClient({ noCookie: true });
  // Strip transaction_id - these reference wallet_transactions from source workspace
  // which won't exist in target. The link can be re-established manually if needed.
  const data = (json?.data || []).map((invoice: Record<string, unknown>) => {
    const { transaction_id: _, ...rest } = invoice;
    return rest;
  });
  const result = await batchUpsert({
    table: 'finance_invoices',
    data,
    onConflict: 'id',
    supabase,
  });
  return createMigrationResponse(result, 'finance-invoices');
}
