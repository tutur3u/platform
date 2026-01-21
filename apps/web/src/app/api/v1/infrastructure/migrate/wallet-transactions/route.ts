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
  const result = await batchUpsert({
    table: 'wallet_transactions',
    data: json?.data || [],
  });
  return createMigrationResponse(result, 'wallet transactions');
}
