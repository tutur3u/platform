import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { getInventoryActorContext } from '@tuturuuu/inventory-core/actor';
import {
  createInventoryAuditLog,
  diffInventoryAuditFields,
} from '@tuturuuu/inventory-core/audit';
import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import {
  canDeleteInventorySetup,
  canUpdateInventorySetup,
} from '@tuturuuu/inventory-core/permissions';

const WarehouseUpdateSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional(),
});

interface Params {
  params: Promise<{
    warehouseId: string;
    wsId: string;
  }>;
}

async function parseBody(req: Request) {
  try {
    return { ok: true as const, value: await req.json() };
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: 'Invalid JSON body' },
        { status: 400 }
      ),
    };
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const { warehouseId, wsId: id } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const { permissions, wsId } = authorization.value;
  if (!canUpdateInventorySetup(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const body = await parseBody(req);
  if (!body.ok) return body.response;

  const parsed = WarehouseUpdateSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient();
  const inventory = sbAdmin.schema('private');
  const { data: existing, error: existingError } = await inventory
    .from('inventory_warehouses')
    .select('*')
    .eq('id', warehouseId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (existingError) {
    serverLogger.error(
      'Error loading inventory warehouse for update',
      existingError
    );
    return NextResponse.json(
      { message: 'Failed to fetch inventory warehouse' },
      { status: 500 }
    );
  }

  if (!existing) {
    return NextResponse.json(
      { message: 'Warehouse not found' },
      { status: 404 }
    );
  }

  const { data, error } = await inventory
    .from('inventory_warehouses')
    .update(parsed.data)
    .eq('id', warehouseId)
    .eq('ws_id', wsId)
    .select('*')
    .single();

  if (error) {
    serverLogger.error('Error updating inventory warehouse', error);
    return NextResponse.json(
      { message: 'Failed to update inventory warehouse' },
      { status: error.code === '23505' ? 409 : 500 }
    );
  }

  await createInventoryAuditLog(sbAdmin, {
    wsId,
    eventKind: 'updated',
    entityKind: 'warehouse',
    entityId: data.id,
    entityLabel: data.name,
    summary: `Updated warehouse ${data.name}`,
    changedFields: diffInventoryAuditFields(existing, data),
    before: existing,
    after: data,
    actor: await getInventoryActorContext(req, wsId),
  });

  return NextResponse.json({ data });
}

export const PUT = PATCH;

export async function DELETE(req: Request, { params }: Params) {
  const { warehouseId, wsId: id } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const { permissions, wsId } = authorization.value;
  if (!canDeleteInventorySetup(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const sbAdmin = await createAdminClient();
  const inventory = sbAdmin.schema('private');
  const { data: existing, error: existingError } = await inventory
    .from('inventory_warehouses')
    .select('*')
    .eq('id', warehouseId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (existingError) {
    serverLogger.error(
      'Error loading inventory warehouse for deletion',
      existingError
    );
    return NextResponse.json(
      { message: 'Failed to fetch inventory warehouse' },
      { status: 500 }
    );
  }

  if (!existing) {
    return NextResponse.json(
      { message: 'Warehouse not found' },
      { status: 404 }
    );
  }

  const { data: linkedStockRows, error: linkedStockRowsError } = await inventory
    .from('inventory_products')
    .select('product_id')
    .eq('warehouse_id', warehouseId)
    .limit(1);

  if (linkedStockRowsError) {
    serverLogger.error(
      'Error validating inventory warehouse stock usage',
      linkedStockRowsError
    );
    return NextResponse.json(
      { message: 'Failed to validate warehouse usage' },
      { status: 500 }
    );
  }

  if ((linkedStockRows ?? []).length > 0) {
    return NextResponse.json(
      {
        message: 'Cannot delete warehouse while stock rows are assigned to it',
      },
      { status: 409 }
    );
  }

  const { data: linkedBatches, error: linkedBatchesError } = await inventory
    .from('inventory_batches')
    .select('id')
    .eq('warehouse_id', warehouseId)
    .limit(1);

  if (linkedBatchesError) {
    serverLogger.error(
      'Error validating inventory warehouse batch usage',
      linkedBatchesError
    );
    return NextResponse.json(
      { message: 'Failed to validate warehouse usage' },
      { status: 500 }
    );
  }

  if ((linkedBatches ?? []).length > 0) {
    return NextResponse.json(
      { message: 'Cannot delete warehouse while batches are assigned to it' },
      { status: 409 }
    );
  }

  const { data, error } = await inventory
    .from('inventory_warehouses')
    .delete()
    .eq('id', warehouseId)
    .eq('ws_id', wsId)
    .select('*')
    .maybeSingle();

  if (error) {
    serverLogger.error('Error deleting inventory warehouse', error);
    return NextResponse.json(
      { message: 'Failed to delete inventory warehouse' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { message: 'Warehouse not found' },
      { status: 404 }
    );
  }

  await createInventoryAuditLog(sbAdmin, {
    wsId,
    eventKind: 'deleted',
    entityKind: 'warehouse',
    entityId: data.id,
    entityLabel: data.name,
    summary: `Deleted warehouse ${data.name}`,
    before: existing,
    actor: await getInventoryActorContext(req, wsId),
  });

  return NextResponse.json({ message: 'success' });
}
