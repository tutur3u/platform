import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import {
  batchFetch,
  batchUpsert,
  createFetchResponse,
  createMigrationResponse,
  requireDevMode,
} from '../batch-upsert';

export async function GET(req: Request) {
  const devModeError = requireDevMode();
  if (devModeError) return devModeError;

  const url = new URL(req.url);
  const wsId = url.searchParams.get('ws_id');
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = parseInt(url.searchParams.get('limit') || '500', 10);

  if (!wsId) {
    return Response.json({ error: 'ws_id is required' }, { status: 400 });
  }

  const result = await batchFetch({
    table: 'workspace_settings',
    wsId,
    offset,
    limit,
  });
  return createFetchResponse(result, 'workspace-settings');
}

export async function PUT(req: Request) {
  const devModeError = requireDevMode();
  if (devModeError) return devModeError;

  const json = await req.json();
  // Strip referral_promotion_id to break circular FK dependency with workspace_promotions
  // After promotions are migrated, use PATCH to update referral_promotion_id
  const dataWithoutPromoId = (json?.data || []).map(
    (item: Record<string, unknown>) => {
      const { referral_promotion_id: _promoId, ...rest } = item;
      return rest;
    }
  );
  const result = await batchUpsert({
    table: 'workspace_settings',
    data: dataWithoutPromoId,
    onConflict: 'ws_id',
  });
  return createMigrationResponse(result, 'workspace-settings');
}

// PATCH: Update referral_promotion_id after workspace_promotions are migrated
// This resolves the circular FK dependency
export async function PATCH(req: Request) {
  const devModeError = requireDevMode();
  if (devModeError) return devModeError;

  const supabase = await createClient();
  const json = await req.json();

  // Expect array of { ws_id, referral_promotion_id } pairs
  const updates = json?.data || [];

  let successCount = 0;
  let errorCount = 0;
  const errors: unknown[] = [];

  for (const item of updates) {
    const { ws_id, referral_promotion_id } = item as {
      ws_id: string;
      referral_promotion_id: string;
    };
    if (!ws_id || !referral_promotion_id) continue;

    const { error } = await supabase
      .from('workspace_settings')
      .update({ referral_promotion_id })
      .eq('ws_id', ws_id);

    if (error) {
      errorCount++;
      errors.push({ ws_id, error });
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
