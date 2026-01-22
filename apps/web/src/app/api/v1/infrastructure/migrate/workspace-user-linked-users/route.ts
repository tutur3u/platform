import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { DEV_MODE } from '@tuturuuu/utils/constants';
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
    table: 'workspace_user_linked_users',
    wsId,
    offset,
    limit,
  });
  return createFetchResponse(result, 'workspace-user-linked-users');
}

export async function PUT(req: Request) {
  if (!DEV_MODE) {
    return NextResponse.json(
      { message: 'Migration endpoints are only available in dev mode' },
      { status: 403 }
    );
  }

  const json = await req.json();

  // Use admin client to bypass RLS - this table has restrictive policies
  // that only allow users to insert rows for themselves (platform_user_id = auth.uid())
  // For migration, we need to insert rows for other users
  const sbAdmin = await createAdminClient();
  // Primary key is (platform_user_id, ws_id)
  const result = await batchUpsert({
    table: 'workspace_user_linked_users',
    data: json?.data || [],
    onConflict: 'platform_user_id,ws_id',
    supabase: sbAdmin,
  });
  return createMigrationResponse(result, 'workspace-user-linked-users');
}
