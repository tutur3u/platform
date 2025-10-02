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
    .from('wallet_transactions')
    .select('*', { count: 'exact' })
    .eq('ws_id', wsId)
    .range(Number.parseInt(offset, 10), Number.parseInt(offset, 10) + Number.parseInt(limit, 10) - 1);

  if (error) {
    console.error('Error fetching wallet_transactions:', error);
    return NextResponse.json(
      { message: 'Error fetching wallet_transactions' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: data || [],
    count: count || 0,
  });
}
