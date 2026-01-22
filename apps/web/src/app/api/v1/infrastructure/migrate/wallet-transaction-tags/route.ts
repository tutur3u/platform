import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { batchUpsert, createMigrationResponse } from '../batch-upsert';

// wallet_transaction_tags doesn't have ws_id - query via wallet_id -> workspace_wallets
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

  // Get transaction IDs for those wallets
  const { data: transactions, error: txError } = await supabase
    .from('wallet_transactions')
    .select('id')
    .in('wallet_id', walletIds);

  if (txError) {
    return NextResponse.json(
      { message: 'Error fetching transactions', error: txError },
      { status: 500 }
    );
  }

  const transactionIds = transactions?.map((t) => t.id) ?? [];
  if (transactionIds.length === 0) {
    return NextResponse.json({ data: [], count: 0 });
  }

  // Get tags for those transactions
  const { data, error, count } = await supabase
    .from('wallet_transaction_tags')
    .select('*', { count: 'exact' })
    .in('transaction_id', transactionIds)
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json(
      { message: 'Error fetching wallet-transaction-tags', error },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: data ?? [], count: count ?? 0 });
}

export async function PUT(req: Request) {
  const json = await req.json();
  // Composite key: (tag_id, transaction_id)
  const result = await batchUpsert({
    table: 'wallet_transaction_tags',
    data: json?.data || [],
    onConflict: 'tag_id,transaction_id',
  });
  return createMigrationResponse(result, 'wallet-transaction-tags');
}
