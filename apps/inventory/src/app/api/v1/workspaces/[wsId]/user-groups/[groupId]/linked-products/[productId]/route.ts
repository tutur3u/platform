import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { revalidateUserGroupCache } from '@/lib/user-groups/revalidate';

interface Params {
  params: Promise<{
    wsId: string;
    groupId: string;
    productId: string;
  }>;
}

export async function PATCH(req: Request, { params }: Params) {
  const { wsId, groupId, productId } = await params;

  const authorization = await authorizeInventoryWorkspace(req, wsId);
  if (!authorization.ok) return authorization.response;
  const { permissions } = authorization.value;

  if (permissions.withoutPermission('update_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update linked products' },
      { status: 403 }
    );
  }

  const body = (await req.json()) as {
    warehouseId?: string;
    unitId?: string;
  };

  if (!body.warehouseId || !body.unitId) {
    return NextResponse.json(
      { message: 'Invalid request payload' },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient();
  const { data: group, error: groupError } = await sbAdmin
    .from('workspace_user_groups')
    .select('id')
    .eq('id', groupId)
    .eq('ws_id', permissions.wsId)
    .maybeSingle();
  if (groupError) {
    console.error('Error checking user group:', groupError);
    return NextResponse.json(
      { message: 'Error checking user group' },
      { status: 500 }
    );
  }
  if (!group) {
    return NextResponse.json(
      { message: 'User group not found' },
      { status: 404 }
    );
  }
  const [warehouse, unit] = await Promise.all([
    sbAdmin
      .schema('private')
      .from('inventory_warehouses')
      .select('id')
      .eq('id', body.warehouseId)
      .eq('ws_id', permissions.wsId)
      .maybeSingle(),
    sbAdmin
      .schema('private')
      .from('inventory_units')
      .select('id')
      .eq('id', body.unitId)
      .eq('ws_id', permissions.wsId)
      .maybeSingle(),
  ]);
  if (warehouse.error || unit.error) {
    console.error(
      'Error checking inventory references:',
      warehouse.error || unit.error
    );
    return NextResponse.json(
      { message: 'Error checking inventory references' },
      { status: 500 }
    );
  }
  if (!warehouse.data || !unit.data) {
    return NextResponse.json(
      { message: 'Inventory reference not found' },
      { status: 404 }
    );
  }
  const { error } = await sbAdmin
    .from('user_group_linked_products')
    .update({
      warehouse_id: body.warehouseId,
      unit_id: body.unitId,
    })
    .eq('group_id', groupId)
    .eq('product_id', productId);

  if (error) {
    console.error('Error updating linked product:', error);
    return NextResponse.json(
      { message: 'Error updating linked product' },
      { status: 500 }
    );
  }

  revalidateUserGroupCache(groupId);
  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, { params }: Params) {
  const { wsId, groupId, productId } = await params;

  const authorization = await authorizeInventoryWorkspace(req, wsId);
  if (!authorization.ok) return authorization.response;
  const { permissions } = authorization.value;

  if (permissions.withoutPermission('update_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update linked products' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();
  const { data: group, error: groupError } = await sbAdmin
    .from('workspace_user_groups')
    .select('id')
    .eq('id', groupId)
    .eq('ws_id', permissions.wsId)
    .maybeSingle();
  if (groupError) {
    console.error('Error checking user group:', groupError);
    return NextResponse.json(
      { message: 'Error checking user group' },
      { status: 500 }
    );
  }
  if (!group) {
    return NextResponse.json(
      { message: 'User group not found' },
      { status: 404 }
    );
  }
  const { error } = await sbAdmin
    .from('user_group_linked_products')
    .delete()
    .eq('group_id', groupId)
    .eq('product_id', productId);

  if (error) {
    console.error('Error deleting linked product:', error);
    return NextResponse.json(
      { message: 'Error deleting linked product' },
      { status: 500 }
    );
  }

  revalidateUserGroupCache(groupId);
  return NextResponse.json({ message: 'success' });
}
