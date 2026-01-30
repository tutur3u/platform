import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';

const BATCH_SIZE = 100;
const FETCH_LIMIT = 500;

/**
 * Security check for infrastructure migration routes.
 *
 * These routes should ONLY be accessible in development/staging environments.
 * In production, they could expose sensitive data or allow unintended data modifications.
 *
 * @returns NextResponse with 403 error if not in DEV_MODE, null otherwise
 */
export function requireDevMode(): NextResponse | null {
  if (DEV_MODE) {
    return null; // Allow access in development
  }

  console.error(
    '[SECURITY] Blocked access to infrastructure migration route in production'
  );

  return NextResponse.json(
    {
      error: 'Forbidden',
      message:
        'Infrastructure migration routes are only accessible in development mode',
      hint: 'These routes are intended for internal data migration and should not be used in production.',
    },
    { status: 403 }
  );
}

// Batch fetch for GET requests
interface BatchFetchOptions {
  table: string;
  wsId: string;
  offset?: number;
  limit?: number;
  wsColumn?: string;
  supabase?: TypedSupabaseClient | Promise<TypedSupabaseClient>;
}

export async function batchFetch({
  table,
  wsId,
  offset = 0,
  limit = FETCH_LIMIT,
  wsColumn = 'ws_id',
  supabase: providedSupabase,
}: BatchFetchOptions) {
  const supabase = (await providedSupabase) ?? (await createClient());

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
  supabase?: TypedSupabaseClient | Promise<TypedSupabaseClient>;
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
  const supabase = (await providedSupabase) ?? (await createClient());
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

/**
 * Fetch data via foreign key with proper pagination for related tables.
 * Handles the case where a table doesn't have ws_id but relates through another table.
 *
 * Uses inner pagination to avoid Supabase's 1000-row default limit.
 */
interface BatchFetchViaFkOptions {
  /** The table to fetch from */
  table: string;
  /** Array of foreign key values to filter by */
  fkValues: string[];
  /** The foreign key column name (e.g., 'invoice_id') */
  fkColumn: string;
  /** Offset for pagination */
  offset?: number;
  /** Limit for results */
  limit?: number;
  /** Batch size for .in() queries (default: 100) */
  inBatchSize?: number;
  /** Supabase client */
  supabase: TypedSupabaseClient | Promise<TypedSupabaseClient>;
}

export async function batchFetchViaFk({
  table,
  fkValues,
  fkColumn,
  offset = 0,
  limit = FETCH_LIMIT,
  inBatchSize = 100,
  supabase: providedSupabase,
}: BatchFetchViaFkOptions): Promise<{
  data: Record<string, unknown>[];
  error: unknown;
  count: number;
}> {
  const supabase = await providedSupabase;
  const FETCH_BATCH_SIZE = 1000;

  // Count total across all FK batches
  let totalCount = 0;
  for (let i = 0; i < fkValues.length; i += inBatchSize) {
    const batch = fkValues.slice(i, i + inBatchSize);
    const { count, error } = await supabase
      .from(table as 'workspace_users')
      .select('*', { count: 'exact', head: true })
      .in(fkColumn, batch);

    if (error) return { data: [], error, count: 0 };
    totalCount += count ?? 0;
  }

  // Fetch ALL data with inner pagination per FK batch
  const allData: Record<string, unknown>[] = [];

  for (let i = 0; i < fkValues.length; i += inBatchSize) {
    const batch = fkValues.slice(i, i + inBatchSize);
    let batchOffset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from(table as 'workspace_users')
        .select('*')
        .in(fkColumn, batch)
        .range(batchOffset, batchOffset + FETCH_BATCH_SIZE - 1);

      if (error) return { data: [], error, count: 0 };

      if (data && data.length > 0) {
        allData.push(...data);
        hasMore = data.length === FETCH_BATCH_SIZE;
        batchOffset += FETCH_BATCH_SIZE;
      } else {
        hasMore = false;
      }
    }
  }

  // Apply final offset/limit to combined results
  const paginatedData = allData.slice(offset, offset + limit);

  return { data: paginatedData, error: null, count: totalCount };
}
