import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const WarehouseUpdateSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional(),
});

interface Params {
  params: Promise<{
    wsId: string;
    warehouseId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const { wsId: rawWsId, warehouseId: id } = await params;
  const supabase = await createClient(req);
  const wsId = await normalizeWorkspaceId(rawWsId, supabase);

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { containsPermission } = permissions;
  if (!containsPermission('update_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update warehouses' },
      { status: 403 }
    );
  }

  const parsed = WarehouseUpdateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const inventory = (await createAdminClient()).schema('private');

  const { data: warehouse, error } = await inventory
    .from('inventory_warehouses')
    .update(parsed.data)
    .eq('id', id)
    .eq('ws_id', wsId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Error updating product warehouse', error);
    return NextResponse.json(
      { message: 'Error updating warehouse' },
      { status: 500 }
    );
  }

  if (!warehouse) {
    return NextResponse.json(
      { message: 'Warehouse not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, { params }: Params) {
  const { wsId: rawWsId, warehouseId: id } = await params;
  const supabase = await createClient(req);
  const wsId = await normalizeWorkspaceId(rawWsId, supabase);

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { containsPermission } = permissions;
  if (!containsPermission('delete_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to delete warehouses' },
      { status: 403 }
    );
  }

  const inventory = (await createAdminClient()).schema('private');

  const { data: warehouse, error } = await inventory
    .from('inventory_warehouses')
    .delete()
    .eq('id', id)
    .eq('ws_id', wsId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Error deleting product warehouse', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }

  if (!warehouse) {
    return NextResponse.json(
      { message: 'Warehouse not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
