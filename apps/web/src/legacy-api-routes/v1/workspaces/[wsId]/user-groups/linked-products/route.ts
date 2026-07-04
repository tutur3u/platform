import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { NextResponse } from 'next/server';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';

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

  if (
    permissions.withoutPermission('view_user_groups') &&
    permissions.withoutPermission('create_invoices')
  ) {
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
    .schema('private')
    .rpc('get_user_group_linked_products_with_units', {
      p_group_ids: groupIds,
      p_ws_id: wsId,
    });

  if (error) {
    console.error('Error fetching multi-group linked products:', error);
    return NextResponse.json(
      { message: 'Error fetching linked products' },
      { status: 500 }
    );
  }

  const items = ((data ?? []) as Array<{ item: unknown | null }>)
    .map((row) => row.item)
    .filter(Boolean);

  return NextResponse.json({ items });
}
