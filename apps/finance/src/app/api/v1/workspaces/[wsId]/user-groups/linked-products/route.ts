import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const access = await getFinanceRouteContext(
    request,
    rawWsId,
    await resolveFinanceRouteAuthContext(request)
  );

  if (access.response) return access.response;

  const { normalizedWsId, permissions, sbAdmin } = access.context;
  if (
    permissions.withoutPermission('view_user_groups') &&
    permissions.withoutPermission('create_invoices')
  ) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view linked products' },
      { status: 403 }
    );
  }

  const groupIds = [
    ...new Set(
      new URL(request.url).searchParams
        .getAll('groupIds')
        .map((groupId) => groupId.trim())
        .filter(Boolean)
    ),
  ];

  if (groupIds.length === 0) return NextResponse.json({ items: [] });

  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('get_user_group_linked_products_with_units', {
      p_group_ids: groupIds,
      p_ws_id: normalizedWsId,
    });

  if (error) {
    console.error('Failed to load Finance group-linked products', {
      error,
      groupIds,
      wsId: normalizedWsId,
    });
    return NextResponse.json(
      { message: 'Error fetching linked products' },
      { status: 500 }
    );
  }

  const items = ((data ?? []) as Array<{ item: unknown | null }>)
    .map((row) => row.item)
    .filter((item): item is NonNullable<typeof item> => item != null);

  return NextResponse.json({ items });
}
