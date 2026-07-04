import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const supabase = await createClient();

  const { searchParams } = new URL(req.url);
  const wsId = searchParams.get('ws_id');
  const limit = searchParams.get('limit') || '1000';
  const offset = searchParams.get('offset') || '0';

  if (!wsId) {
    return NextResponse.json(
      { message: 'Missing ws_id parameter' },
      { status: 400 }
    );
  }

  const { data, error, count } = await supabase
    .from('user_feedbacks')
    .select('*, workspace_users!user_feedbacks_user_id_fkey!inner(ws_id)', {
      count: 'exact',
    })
    .eq('workspace_users.ws_id', wsId)
    .range(
      Number.parseInt(offset, 10),
      Number.parseInt(offset, 10) + Number.parseInt(limit, 10) - 1
    );

  if (error) {
    console.error('Error fetching user_feedbacks:', error);
    return NextResponse.json(
      { message: 'Error fetching user_feedbacks' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: data || [],
    count: count || 0,
  });
}
