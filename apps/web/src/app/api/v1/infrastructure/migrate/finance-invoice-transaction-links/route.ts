import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { requireDevMode } from '../batch-upsert';

// This module relinks finance_invoices.transaction_id after both
// wallet_transactions and finance_invoices have been migrated.
// It runs as a post-processing step to restore FK relationships.

export async function GET(req: Request) {
  const devModeError = requireDevMode();
  if (devModeError) return devModeError;

  const url = new URL(req.url);
  const wsId = url.searchParams.get('ws_id');

  if (!wsId) {
    return Response.json({ error: 'ws_id is required' }, { status: 400 });
  }

  // noCookie: true returns sync, so cast is safe
  const supabase = createAdminClient({
    noCookie: true,
  }) as TypedSupabaseClient;

  // Get invoices that have transaction_id in source (external) but need relinking
  // This returns invoices with their transaction_id for comparison
  const { data, error, count } = await supabase
    .from('finance_invoices')
    .select('id, transaction_id', { count: 'exact' })
    .eq('ws_id', wsId)
    .not('transaction_id', 'is', null);

  if (error) {
    return NextResponse.json(
      { message: 'Error fetching invoice transaction links', error },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: data ?? [], count: count ?? 0 });
}

export async function PUT(req: Request) {
  const devModeError = requireDevMode();
  if (devModeError) return devModeError;

  const json = await req.json();
  const links = (json?.data || []) as Array<{
    id: string;
    transaction_id: string | null;
  }>;

  if (links.length === 0) {
    return NextResponse.json({ message: 'success', count: 0, skipped: 0 });
  }

  // noCookie: true returns sync, so cast is safe
  const supabase = createAdminClient({
    noCookie: true,
  }) as TypedSupabaseClient;

  // Get all transaction IDs that need to exist
  const transactionIds = links
    .filter((l) => l.transaction_id != null)
    .map((l) => l.transaction_id as string);

  if (transactionIds.length === 0) {
    return NextResponse.json({ message: 'success', count: 0, skipped: 0 });
  }

  // Check which transactions actually exist in target
  // Batch queries to avoid URI too long error (Supabase .in() encodes as URL params)
  // UUIDs are 36 chars each, URLs typically limited to 8KB, so max ~100-150 IDs per batch
  const BATCH_SIZE = 100;
  const existingTxIds = new Set<string>();

  for (let i = 0; i < transactionIds.length; i += BATCH_SIZE) {
    const batch = transactionIds.slice(i, i + BATCH_SIZE);
    const { data: batchTransactions, error: txError } = await supabase
      .from('wallet_transactions')
      .select('id')
      .in('id', batch);

    if (txError) {
      return NextResponse.json(
        {
          message: 'Error checking transactions',
          error: txError,
          batch: i / BATCH_SIZE + 1,
        },
        { status: 500 }
      );
    }

    if (batchTransactions) {
      for (const t of batchTransactions) {
        existingTxIds.add(t.id);
      }
    }
  }

  // Update invoices where the transaction exists
  let successCount = 0;
  let skippedCount = 0;
  const errors: unknown[] = [];

  for (const link of links) {
    if (!link.transaction_id || !existingTxIds.has(link.transaction_id)) {
      skippedCount++;
      continue;
    }

    const { error } = await supabase
      .from('finance_invoices')
      .update({ transaction_id: link.transaction_id })
      .eq('id', link.id);

    if (error) {
      errors.push({ id: link.id, error });
    } else {
      successCount++;
    }
  }

  if (errors.length > 0) {
    return NextResponse.json(
      {
        message: 'Partial success relinking invoice transactions',
        count: successCount,
        skipped: skippedCount,
        errorCount: errors.length,
      },
      { status: 207 }
    );
  }

  return NextResponse.json({
    message: 'success',
    count: successCount,
    skipped: skippedCount,
  });
}
