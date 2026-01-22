import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { batchUpsert, createMigrationResponse } from '../batch-upsert';

// wallet_transactions doesn't have ws_id - query via wallet_id -> workspace_wallets
export async function GET(req: Request) {
  const url = new URL(req.url);
  const wsId = url.searchParams.get('ws_id');
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = parseInt(url.searchParams.get('limit') || '500', 10);

  if (!wsId) {
    return Response.json({ error: 'ws_id is required' }, { status: 400 });
  }

  const supabase = await createClient();

  // Get wallet IDs for this workspace
  const { data: wallets, error: walletError } = await supabase
    .from('workspace_wallets')
    .select('id')
    .eq('ws_id', wsId);

  if (walletError) {
    return NextResponse.json(
      { message: 'Error fetching wallets', error: walletError },
      { status: 500 }
    );
  }

  const walletIds = wallets?.map((w) => w.id) ?? [];
  if (walletIds.length === 0) {
    return NextResponse.json({ data: [], count: 0 });
  }

  // Get transactions for those wallets
  const { data, error, count } = await supabase
    .from('wallet_transactions')
    .select('*', { count: 'exact' })
    .in('wallet_id', walletIds)
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json(
      { message: 'Error fetching wallet-transactions', error },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: data ?? [], count: count ?? 0 });
}

export async function PUT(req: Request) {
  const json = await req.json();
  // Strip invoice_id to break circular FK dependency with finance_invoices
  // After both tables are migrated, use PATCH to update invoice_id
  const dataWithoutInvoiceId = (json?.data || []).map(
    (item: Record<string, unknown>) => {
      const { invoice_id: _invoiceId, ...rest } = item;
      return rest;
    }
  );
  const result = await batchUpsert({
    table: 'wallet_transactions',
    data: dataWithoutInvoiceId,
  });
  return createMigrationResponse(result, 'wallet transactions');
}

// PATCH: Update invoice_id after finance_invoices are migrated
// This resolves the circular FK dependency
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const json = await req.json();

  // Expect array of { id, invoice_id } pairs
  const updates = json?.data || [];

  let successCount = 0;
  let errorCount = 0;
  const errors: unknown[] = [];

  for (const item of updates) {
    const { id, invoice_id } = item as { id: string; invoice_id: string };
    if (!id || !invoice_id) continue;

    const { error } = await supabase
      .from('wallet_transactions')
      .update({ invoice_id })
      .eq('id', id);

    if (error) {
      errorCount++;
      errors.push({ id, error });
    } else {
      successCount++;
    }
  }

  return NextResponse.json({
    message: errorCount === 0 ? 'success' : 'partial success',
    successCount,
    errorCount,
    errors: errors.slice(0, 5), // Return first 5 errors
  });
}
