import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

const BATCH_SIZE = 100;

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
    return NextResponse.json(
      {
        message: `Error migrating ${entityName}`,
        successCount: result.successCount,
        errorCount: result.errorCount,
        totalBatches: result.totalBatches,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: 'success',
    count: result.successCount,
  });
}
