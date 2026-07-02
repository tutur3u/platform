import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInfrastructureInventoryRead } from '../inventory-read-auth';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawWsId = searchParams.get('ws_id');
  const limit = searchParams.get('limit') || '1000';
  const offset = searchParams.get('offset') || '0';

  if (!rawWsId) {
    return NextResponse.json(
      { message: 'Missing ws_id parameter' },
      { status: 400 }
    );
  }

  const authorization = await authorizeInfrastructureInventoryRead(
    req,
    rawWsId
  );
  if (!authorization.ok) return authorization.response;

  const { wsId } = authorization;
  const inventory = (await createAdminClient()).schema('private');

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
