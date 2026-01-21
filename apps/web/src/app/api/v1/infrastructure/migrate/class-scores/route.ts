import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { batchUpsert, createMigrationResponse } from '../batch-upsert';

// user_indicators doesn't have ws_id - query via user_id -> workspace_users
export async function GET(req: Request) {
  const url = new URL(req.url);
  const wsId = url.searchParams.get('ws_id');
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = parseInt(url.searchParams.get('limit') || '500', 10);

  if (!wsId) {
    return Response.json({ error: 'ws_id is required' }, { status: 400 });
  }

  const supabase = await createClient();

  // Get user IDs for this workspace
  const { data: users, error: userError } = await supabase
    .from('workspace_users')
    .select('id')
    .eq('ws_id', wsId);

  if (userError) {
    return NextResponse.json(
      { message: 'Error fetching users', error: userError },
      { status: 500 }
    );
  }

  const userIds = users?.map((u) => u.id) ?? [];
  if (userIds.length === 0) {
    return NextResponse.json({ data: [], count: 0 });
  }

  // Get indicators for those users
  const { data, error, count } = await supabase
    .from('user_indicators')
    .select('*', { count: 'exact' })
    .in('user_id', userIds)
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json(
      { message: 'Error fetching class-scores', error },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: data ?? [], count: count ?? 0 });
}

export async function PUT(req: Request) {
  const json = await req.json();
  const result = await batchUpsert({
    table: 'user_indicators',
    data: json?.data || [],
    onConflict: 'user_id,indicator_id',
  });
  return createMigrationResponse(result, 'class scores');
}
