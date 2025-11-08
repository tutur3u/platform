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

  const limitNum = Number.parseInt(limit, 10);
  const offsetNum = Number.parseInt(offset, 10);

  // Use optimized RPC function with pagination at database level
  const { data, error } = await supabase.rpc(
    'get_wallet_transactions_with_permissions',
    {
      p_ws_id: wsId,
      p_limit: limitNum,
      p_offset: offsetNum,
      p_order_by: 'taken_at',
      p_order_direction: 'DESC',
      p_include_count: true, // Include total count for infrastructure analytics
    }
  );

  if (error) {
    console.error('Error fetching wallet_transactions:', error);
    return NextResponse.json(
      { message: 'Error fetching wallet_transactions' },
      { status: 500 }
    );
  }

  // Extract total count from first row (all rows have same total_count)
  const totalCount = data && data.length > 0 ? (data[0]?.total_count ?? 0) : 0;

  return NextResponse.json({
    data: data || [],
    count: totalCount,
  });
}
