import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import {
  batchUpsert,
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

  // noCookie: true returns sync, so cast is safe
  const supabase = createAdminClient({
    noCookie: true,
  }) as TypedSupabaseClient;

  // Use RPC for efficient fetching with proper JOINs
  // This avoids the 1000-row limit when using .in() queries
  const { data, error } = await supabase.rpc(
    'get_finance_invoice_promotions_by_workspace',
    { p_ws_id: wsId, p_offset: offset, p_limit: limit }
  );

  if (error) {
    return NextResponse.json(
      { message: 'Error fetching finance-invoice-promotions', error },
      { status: 500 }
    );
  }

  const count = data?.[0]?.total_count ?? 0;
  // Remove total_count from each row
  const cleanData = (data ?? []).map(({ total_count: _, ...rest }) => rest);

  return NextResponse.json({ data: cleanData, count });
}

export async function PUT(req: Request) {
  const devModeError = requireDevMode();
  if (devModeError) return devModeError;

  const json = await req.json();
  const supabase = createAdminClient({ noCookie: true });
  // Unique constraint: (invoice_id, code)
  const result = await batchUpsert({
    table: 'finance_invoice_promotions',
    data: json?.data || [],
    onConflict: 'invoice_id,code',
    supabase,
  });
  return createMigrationResponse(result, 'finance-invoice-promotions');
}
