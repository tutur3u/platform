import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    supplierId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const { wsId: rawWsId, supplierId: id } = await params;

  const authorization = await authorizeInventoryWorkspace(req, rawWsId);
  if (!authorization.ok) return authorization.response;
  const { permissions, wsId } = authorization.value;
  const { containsPermission } = permissions;
  if (!containsPermission('update_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update suppliers' },
      { status: 403 }
    );
  }

  const inventory = (await createAdminClient()).schema('private');
  const data = await req.json();

  const { error } = await inventory
    .from('inventory_suppliers')
    .update(data)
    .eq('id', id)
    .eq('ws_id', wsId);

  if (error) {
    console.error('Error updating product supplier', error);
    return NextResponse.json(
      { message: 'Error updating product category' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, { params }: Params) {
  const { wsId: rawWsId, supplierId: id } = await params;

  const authorization = await authorizeInventoryWorkspace(req, rawWsId);
  if (!authorization.ok) return authorization.response;
  const { permissions, wsId } = authorization.value;
  const { containsPermission } = permissions;
  if (!containsPermission('delete_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to delete suppliers' },
      { status: 403 }
    );
  }

  const inventory = (await createAdminClient()).schema('private');

  const { error } = await inventory
    .from('inventory_suppliers')
    .delete()
    .eq('id', id)
    .eq('ws_id', wsId);

  if (error) {
    console.error('Error deleting product supplier', error);
    return NextResponse.json(
      { message: 'Error deleting product category' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
