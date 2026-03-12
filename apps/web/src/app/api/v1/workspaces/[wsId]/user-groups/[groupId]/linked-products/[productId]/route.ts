import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    groupId: string;
    productId: string;
  }>;
}

export async function PATCH(req: Request, { params }: Params) {
  const { wsId, groupId, productId } = await params;

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

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, { params }: Params) {
  const { wsId, groupId, productId } = await params;

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

  const sbAdmin = await createAdminClient();
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

  return NextResponse.json({ message: 'success' });
}
