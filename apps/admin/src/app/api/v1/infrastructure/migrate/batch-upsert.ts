import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';

const BATCH_SIZE = 100;
const FETCH_LIMIT = 500;
const TRUTHY_ENV_VALUES = new Set(['1', 'true', 'yes', 'on']);
const SAFE_LOCAL_WEB_ORIGINS = new Set([
  'http://127.0.0.1:7803',
  'http://localhost:7803',
  'https://tuturuuu.localhost',
  'https://tuturuuu.localhost:1355',
]);
const SAFE_LOCAL_SUPABASE_ORIGINS = new Set([
  'http://127.0.0.1:8001',
  'http://host.docker.internal:8001',
  'http://localhost:8001',
]);
const LOCAL_E2E_WEB_URL_KEYS = [
  'BASE_URL',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_WEB_APP_URL',
  'PORTLESS_URL',
  'WEB_APP_URL',
] as const;
const LOCAL_E2E_SUPABASE_URL_KEYS = [
  'DOCKER_INTERNAL_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVER_URL',
  'SUPABASE_URL',
] as const;
const SUPABASE_REFERENCE_KEYS = [
  'DATABASE_URL',
  'DIRECT_URL',
  'DOCKER_INTERNAL_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'POSTGRES_URL',
  'SUPABASE_SERVER_URL',
  'SUPABASE_URL',
] as const;

function resolveSchemaClient(
  admin: TypedSupabaseClient,
  schema: 'private' | 'public'
) {
  return (schema === 'private'
    ? admin.schema('private')
    : admin) as unknown as TypedSupabaseClient;
}

function isTruthyEnv(value: string | undefined) {
  return TRUTHY_ENV_VALUES.has(value?.toLowerCase() ?? '');
}

function isCloudSupabaseReference(value: string | undefined) {
  return /supabase\.(co|in)/iu.test(value ?? '');
}

function hasOnlyAllowedOrigins(
  keys: readonly string[],
  allowedOrigins: ReadonlySet<string>
) {
  let hasConfiguredUrl = false;

  for (const key of keys) {
    const value = process.env[key];
    if (!value) continue;

    hasConfiguredUrl = true;

    try {
      const origin = new URL(value).origin;
      if (!allowedOrigins.has(origin)) return false;
    } catch {
      return false;
    }
  }

  return hasConfiguredUrl;
}

function allowsLocalE2EMigrationAccess() {
  if (!isTruthyEnv(process.env.TUTURUUU_LOCAL_E2E_AUTH_BYPASS)) {
    return false;
  }

  if (
    SUPABASE_REFERENCE_KEYS.some((key) =>
      isCloudSupabaseReference(process.env[key])
    )
  ) {
    return false;
  }

  return (
    hasOnlyAllowedOrigins(LOCAL_E2E_WEB_URL_KEYS, SAFE_LOCAL_WEB_ORIGINS) &&
    hasOnlyAllowedOrigins(
      LOCAL_E2E_SUPABASE_URL_KEYS,
      SAFE_LOCAL_SUPABASE_ORIGINS
    )
  );
}

/**
 * Security check for infrastructure migration routes.
 *
 * These routes should ONLY be accessible in development/staging environments.
 * In production, they could expose sensitive data or allow unintended data modifications.
 *
 * @returns NextResponse with 403 error if not in DEV_MODE, null otherwise
 */
export function requireDevMode(): NextResponse | null {
  if (DEV_MODE || allowsLocalE2EMigrationAccess()) {
    return null; // Allow access in development and tightly scoped local E2E
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
  schema?: 'private' | 'public';
  wsColumn?: string;
  supabase?: TypedSupabaseClient | Promise<TypedSupabaseClient>;
}

export async function batchFetch({
  table,
  wsId,
  offset = 0,
  limit = FETCH_LIMIT,
  schema = 'public',
  wsColumn = 'ws_id',
  supabase: providedSupabase,
}: BatchFetchOptions) {
  const admin =
    (await providedSupabase) ?? (await createAdminClient({ noCookie: true }));
  const supabase = resolveSchemaClient(admin, schema);

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
  schema?: 'private' | 'public';
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
  schema = 'public',
  onConflict,
  ignoreDuplicates = false,
  supabase: providedSupabase,
}: BatchUpsertOptions): Promise<BatchUpsertResult> {
  const admin =
    (await providedSupabase) ?? (await createAdminClient({ noCookie: true }));
  const supabase = resolveSchemaClient(admin, schema);
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
