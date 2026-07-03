import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';

interface Params {
  params: Promise<{
    wsId: string;
    supplierId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const { wsId, supplierId: id } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
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
    serverLogger.error('Error updating product supplier', error);
    return NextResponse.json(
      { message: 'Error updating product category' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const { wsId, supplierId: id } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
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
    serverLogger.error('Error deleting product supplier', error);
    return NextResponse.json(
      { message: 'Error deleting product category' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
