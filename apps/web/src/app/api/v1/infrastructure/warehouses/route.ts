import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';

export async function GET(req: Request) {
  const inventory = (await createAdminClient()).schema('private');

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

  const { data, error, count } = await inventory
    .from('inventory_warehouses')
    .select('*', { count: 'exact' })
    .eq('ws_id', wsId)
    .range(
      Number.parseInt(offset, 10),
      Number.parseInt(offset, 10) + Number.parseInt(limit, 10) - 1
    );

  if (error) {
    serverLogger.error('Error fetching inventory_warehouses:', error);
    return NextResponse.json(
      { message: 'Error fetching inventory_warehouses' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: data || [],
    count: count || 0,
  });
}
