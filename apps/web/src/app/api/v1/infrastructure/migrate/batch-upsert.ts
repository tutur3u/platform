import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

const BATCH_SIZE = 100;
const FETCH_LIMIT = 500;

// Batch fetch for GET requests
interface BatchFetchOptions {
  table: string;
  wsId: string;
  offset?: number;
  limit?: number;
  wsColumn?: string;
  supabase?: TypedSupabaseClient;
}

export async function batchFetch({
  table,
  wsId,
  offset = 0,
  limit = FETCH_LIMIT,
  wsColumn = 'ws_id',
  supabase: providedSupabase,
}: BatchFetchOptions) {
  const supabase = providedSupabase ?? (await createClient());

  const { data, error, count } = await supabase
    .from(table as 'workspace_users')
    .select('*', { count: 'exact' })
    .eq(wsColumn, wsId)
    .range(offset, offset + limit - 1);

  if (error) {
    return { data: null, error, count: 0 };
  }

  return { data: data ?? [], error: null, count: count ?? 0 };
}

export function createFetchResponse(
  result: { data: unknown[] | null; error: unknown; count: number },
  entityName: string
) {
  if (result.error) {
    return NextResponse.json(
      {
        message: `Error fetching ${entityName}`,
        error: result.error,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: result.data,
    count: result.count,
  });
}

interface BatchUpsertOptions {
  table: string;
  data: unknown[];
  onConflict?: string;
  ignoreDuplicates?: boolean;
  supabase?: TypedSupabaseClient;
}

interface BatchUpsertResult {
  success: boolean;
  successCount: number;
  errorCount: number;
  totalBatches: number;
  errors: unknown[];
}

export async function batchUpsert({
  table,
  data,
  onConflict,
  ignoreDuplicates = false,
  supabase: providedSupabase,
}: BatchUpsertOptions): Promise<BatchUpsertResult> {
  const supabase = providedSupabase ?? (await createClient());
  const errors: unknown[] = [];
  let successCount = 0;

  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

    const upsertOptions = onConflict
      ? { onConflict, ignoreDuplicates }
      : undefined;

    const { error } = await supabase
      .from(table as 'workspace_users')
      .upsert(batch as never[], upsertOptions);

    if (error) {
      console.error(`Batch ${batchNumber} error for ${table}:`, error);
      errors.push({ batch: batchNumber, error });
    } else {
      successCount += batch.length;
    }
  }

  return {
    success: errors.length === 0,
    successCount,
    errorCount: errors.length,
    totalBatches: Math.ceil(data.length / BATCH_SIZE),
    errors,
  };
}

export function createMigrationResponse(
  result: BatchUpsertResult,
  entityName: string
) {
  if (!result.success) {
    // Include first error details for debugging
    const firstError = result.errors[0] as {
      batch: number;
      error: { message?: string; code?: string; details?: string };
    };
    return NextResponse.json(
      {
        message: `Error migrating ${entityName}`,
        successCount: result.successCount,
        errorCount: result.errorCount,
        totalBatches: result.totalBatches,
        errorDetails: firstError?.error?.message || 'Unknown error',
        errorCode: firstError?.error?.code,
        errorBatch: firstError?.batch,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: 'success',
    count: result.successCount,
  });
}
