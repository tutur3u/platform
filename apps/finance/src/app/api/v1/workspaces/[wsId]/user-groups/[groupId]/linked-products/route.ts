import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    groupId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId, groupId } = await params;

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (permissions.withoutPermission('view_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view linked products' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();
  const { data, error, count } = await sbAdmin
    .from('user_group_linked_products')
    .select(
      'warehouse_id, unit_id, workspace_products!inner(id, name, description)',
      { count: 'exact' }
    )
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching linked products:', error);
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
  const { wsId, groupId } = await params;

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

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

  const sbAdmin = await createAdminClient();
  const { error } = await sbAdmin.from('user_group_linked_products').insert({
    group_id: groupId,
    product_id: body.productId,
    warehouse_id: body.warehouseId,
    unit_id: body.unitId,
  });

  if (error) {
    console.error('Error creating linked product:', error);
    return NextResponse.json(
      { message: 'Error creating linked product' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
