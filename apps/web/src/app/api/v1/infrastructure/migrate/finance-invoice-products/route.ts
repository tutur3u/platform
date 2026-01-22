import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { batchUpsert, createMigrationResponse } from '../batch-upsert';

// finance_invoice_products doesn't have ws_id - query via invoice_id -> finance_invoices
export async function GET(req: Request) {
  const url = new URL(req.url);
  const wsId = url.searchParams.get('ws_id');
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = parseInt(url.searchParams.get('limit') || '500', 10);

  if (!wsId) {
    return Response.json({ error: 'ws_id is required' }, { status: 400 });
  }

  const supabase = await createClient();

  // Get invoice IDs for this workspace
  const { data: invoices, error: invoiceError } = await supabase
    .from('finance_invoices')
    .select('id')
    .eq('ws_id', wsId);

  if (invoiceError) {
    return NextResponse.json(
      { message: 'Error fetching invoices', error: invoiceError },
      { status: 500 }
    );
  }

  const invoiceIds = invoices?.map((i) => i.id) ?? [];
  if (invoiceIds.length === 0) {
    return NextResponse.json({ data: [], count: 0 });
  }

  // Get products for those invoices
  const { data, error, count } = await supabase
    .from('finance_invoice_products')
    .select('*', { count: 'exact' })
    .in('invoice_id', invoiceIds)
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json(
      { message: 'Error fetching finance-invoice-products', error },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: data ?? [], count: count ?? 0 });
}

export async function PUT(req: Request) {
  const json = await req.json();
  // No unique constraint on this table - use plain insert
  // Duplicates should be handled by reconciliation before syncing
  const result = await batchUpsert({
    table: 'finance_invoice_products',
    data: json?.data || [],
    // No onConflict - table has no unique constraint
  });
  return createMigrationResponse(result, 'finance-invoice-products');
}
