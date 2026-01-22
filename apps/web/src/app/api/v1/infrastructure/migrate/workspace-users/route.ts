import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import {
  batchFetch,
  batchUpsert,
  createFetchResponse,
  createMigrationResponse,
} from '../batch-upsert';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const wsId = url.searchParams.get('ws_id');
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = parseInt(url.searchParams.get('limit') || '500', 10);

  if (!wsId) {
    return Response.json({ error: 'ws_id is required' }, { status: 400 });
  }

  const result = await batchFetch({
    table: 'workspace_users',
    wsId,
    offset,
    limit,
  });
  return createFetchResponse(result, 'workspace-users');
}

export async function PUT(req: Request) {
  const json = await req.json();
  // Strip updated_by to avoid self-referencing FK constraint
  // (updated_by references workspace_users.id which may not exist yet)
  // After all records are created, use PATCH to restore updated_by
  const dataWithoutUpdatedBy = (json?.data || []).map(
    (item: Record<string, unknown>) => {
      const { updated_by: _updatedBy, ...rest } = item;
      return rest;
    }
  );
  const result = await batchUpsert({
    table: 'workspace_users',
    data: dataWithoutUpdatedBy,
    onConflict: 'id',
  });
  return createMigrationResponse(result, 'workspace-users');
}

// PATCH: Update updated_by after all workspace_users are created
// This resolves the self-referencing FK constraint
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const json = await req.json();

  // Expect array of { id, updated_by } pairs
  const updates = json?.data || [];

  let successCount = 0;
  let errorCount = 0;
  const errors: unknown[] = [];

  for (const item of updates) {
    const { id, updated_by } = item as { id: string; updated_by: string };
    if (!id || !updated_by) continue;

    const { error } = await supabase
      .from('workspace_users')
      .update({ updated_by })
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
    errors: errors.slice(0, 5),
  });
}
