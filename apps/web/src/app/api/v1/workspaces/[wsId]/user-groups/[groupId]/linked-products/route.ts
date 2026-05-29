import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { NextResponse } from 'next/server';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';

interface Params {
  params: Promise<{
    wsId: string;
    groupId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId: rawWsId, groupId } = await params;
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

  const { data: group } = await sbAdmin
    .from('workspace_user_groups')
    .select('id')
    .eq('id', groupId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (!group) {
    return NextResponse.json(
      { message: 'User group not found' },
      { status: 404 }
    );
  }

  const { data, error, count } = await sbAdmin
    .from('user_group_linked_products')
    .select(
      'warehouse_id, unit_id, workspace_products!inner(id, name, description)',
      { count: 'exact' }
    )
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });

  if (error) {
    serverLogger.error('Error fetching linked products:', error);
    return NextResponse.json(
      { message: 'Error fetching linked products' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    items: (data ?? []).map((row) => ({
      id: row.workspace_products.id,
      name: row.workspace_products.name,
      description: row.workspace_products.description,
      warehouse_id: row.warehouse_id,
      unit_id: row.unit_id,
    })),
    count: count ?? 0,
  });
}

export async function POST(req: Request, { params }: Params) {
  const { wsId: rawWsId, groupId } = await params;
  const access = await getFinanceRouteContext(
    req,
    rawWsId,
    await resolveFinanceRouteAuthContext(req)
  );

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId: wsId, permissions, sbAdmin } = access.context;

  if (permissions.withoutPermission('update_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update linked products' },
      { status: 403 }
    );
  }

  const body = (await req.json()) as {
    productId?: string;
    warehouseId?: string;
    unitId?: string;
  };

  if (!body.productId || !body.warehouseId || !body.unitId) {
    return NextResponse.json(
      { message: 'Invalid request payload' },
      { status: 400 }
    );
  }

  const { data: group } = await sbAdmin
    .from('workspace_user_groups')
    .select('id')
    .eq('id', groupId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (!group) {
    return NextResponse.json(
      { message: 'User group not found' },
      { status: 404 }
    );
  }

  const { error } = await sbAdmin.from('user_group_linked_products').insert({
    group_id: groupId,
    product_id: body.productId,
    warehouse_id: body.warehouseId,
    unit_id: body.unitId,
  });

  if (error) {
    serverLogger.error('Error creating linked product:', error);
    return NextResponse.json(
      { message: 'Error creating linked product' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
