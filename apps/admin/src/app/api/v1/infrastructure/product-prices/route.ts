import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection, NextResponse } from 'next/server';
import { authorizeInfrastructureInventoryRead } from '../inventory-read-auth';

export async function GET(req: Request) {
  await connection();

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
    .from('inventory_products')
    .select('*, workspace_products!product_id!inner(ws_id)', { count: 'exact' })
    .eq('workspace_products.ws_id', wsId)
    .range(
      Number.parseInt(offset, 10),
      Number.parseInt(offset, 10) + Number.parseInt(limit, 10) - 1
    );

  if (error) {
    console.error('Error fetching inventory_products:', error);
    return NextResponse.json(
      { message: 'Error fetching inventory_products' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: data || [],
    count: count || 0,
  });
}
