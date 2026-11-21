import { connection, NextResponse } from 'next/server';
import { authorizeInfrastructureWorkspaceRequest } from '@/lib/infrastructure-admin-access';

export async function GET(req: Request) {
  await connection();

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

  const authorization = await authorizeInfrastructureWorkspaceRequest(
    wsId,
    'view_inventory'
  );
  if (!authorization.ok) return authorization.response;
  const { sbAdmin, wsId: normalizedWsId } = authorization;

  const { data, error, count } = await sbAdmin
    .from('workspace_products')
    .select('*', { count: 'exact' })
    .eq('ws_id', normalizedWsId)
    .range(
      Number.parseInt(offset, 10),
      Number.parseInt(offset, 10) + Number.parseInt(limit, 10) - 1
    );

  if (error) {
    console.error('Error fetching workspace products:', error);
    return NextResponse.json(
      { message: 'Error fetching workspace products' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: data || [],
    count: count || 0,
  });
}
