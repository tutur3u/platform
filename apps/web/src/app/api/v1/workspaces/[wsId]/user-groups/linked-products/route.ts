import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { NextResponse } from 'next/server';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const access = await getFinanceRouteContext(
    req,
    rawWsId,
    await resolveFinanceRouteAuthContext(req)
  );

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId: wsId, permissions, sbAdmin } = access.context;

  if (permissions.withoutPermission('view_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view linked products' },
      { status: 403 }
    );
  }

  const requestUrl = new URL(req.url);
  const groupIds = requestUrl.searchParams
    .getAll('groupIds')
    .map((groupId) => groupId.trim())
    .filter(Boolean);

  if (groupIds.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const { data, error } = await sbAdmin
    .from('user_group_linked_products')
    .select(
      'group_id, workspace_user_groups!inner(name), workspace_products(id, name, product_categories(name)), inventory_units(name, id), warehouse_id'
    )
    .eq('workspace_user_groups.ws_id', wsId)
    .in('group_id', groupIds);

  if (error) {
    serverLogger.error('Error fetching multi-group linked products:', error);
    return NextResponse.json(
      { message: 'Error fetching linked products' },
      { status: 500 }
    );
  }

  return NextResponse.json({ items: data ?? [] });
}
