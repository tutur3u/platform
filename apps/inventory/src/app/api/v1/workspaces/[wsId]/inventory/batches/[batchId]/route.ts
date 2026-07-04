import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { canManageInventorySetup } from '@tuturuuu/inventory-core/permissions';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

type PrivateInventoryClient = ReturnType<
  Awaited<ReturnType<typeof createAdminClient>>['schema']
>;

const BatchPatchSchema = z.object({
  price: z.number().nonnegative().optional(),
  supplier_id: z.guid().nullable().optional(),
  total_diff: z.number().optional(),
  warehouse_id: z.guid().optional(),
});

interface Params {
  params: Promise<{
    batchId: string;
    wsId: string;
  }>;
}

async function getBatchWarehouseId(
  inventory: PrivateInventoryClient,
  batchId: string
) {
  const { data, error } = await inventory
    .from('inventory_batches')
    .select('warehouse_id')
    .eq('id', batchId)
    .maybeSingle();

  if (error) throw error;
  return data?.warehouse_id ?? null;
}

async function assertWorkspaceRelation({
  id,
  inventory,
  table,
  wsId,
}: {
  id: string;
  inventory: PrivateInventoryClient;
  table: 'inventory_suppliers' | 'inventory_warehouses';
  wsId: string;
}) {
  const { data, error } = await inventory
    .from(table)
    .select('id')
    .eq('id', id)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

async function loadBatch({
  batchId,
  inventory,
  wsId,
}: {
  batchId: string;
  inventory: PrivateInventoryClient;
  wsId: string;
}) {
  const { data: batch, error } = await inventory
    .from('inventory_batches')
    .select('id, created_at, price, total_diff, supplier_id, warehouse_id')
    .eq('id', batchId)
    .maybeSingle();

  if (error) throw error;
  if (!batch) return null;

  const { data: warehouse, error: warehouseError } = await inventory
    .from('inventory_warehouses')
    .select('id, name, ws_id')
    .eq('id', batch.warehouse_id)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (warehouseError) throw warehouseError;
  if (!warehouse) return null;

  const { data: supplier, error: supplierError } = batch.supplier_id
    ? await inventory
        .from('inventory_suppliers')
        .select('id, name')
        .eq('id', batch.supplier_id)
        .eq('ws_id', wsId)
        .maybeSingle()
    : { data: null, error: null };

  if (supplierError) throw supplierError;

  return {
    ...batch,
    supplier: supplier?.name ?? undefined,
    warehouse: warehouse.name,
    ws_id: warehouse.ws_id,
  };
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { batchId, wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(req, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canManageInventorySetup(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const parsed = BatchPatchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid batch payload', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const inventory = (await createAdminClient()).schema('private');
    const currentWarehouseId = await getBatchWarehouseId(inventory, batchId);
    if (!currentWarehouseId) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    if (
      !(await assertWorkspaceRelation({
        id: currentWarehouseId,
        inventory,
        table: 'inventory_warehouses',
        wsId: authorization.value.wsId,
      }))
    ) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    const warehouseId = parsed.data.warehouse_id ?? currentWarehouseId;
    if (
      warehouseId !== currentWarehouseId &&
      !(await assertWorkspaceRelation({
        id: warehouseId,
        inventory,
        table: 'inventory_warehouses',
        wsId: authorization.value.wsId,
      }))
    ) {
      return NextResponse.json(
        { message: 'Invalid batch warehouse' },
        { status: 400 }
      );
    }

    if (
      parsed.data.supplier_id &&
      !(await assertWorkspaceRelation({
        id: parsed.data.supplier_id,
        inventory,
        table: 'inventory_suppliers',
        wsId: authorization.value.wsId,
      }))
    ) {
      return NextResponse.json(
        { message: 'Invalid batch supplier' },
        { status: 400 }
      );
    }

    const { error } = await inventory
      .from('inventory_batches')
      .update(parsed.data)
      .eq('id', batchId);

    if (error) throw error;

    const data = await loadBatch({
      batchId,
      inventory,
      wsId: authorization.value.wsId,
    });
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error updating inventory batch', error);
    return NextResponse.json(
      { message: 'Failed to update inventory batch' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const { batchId, wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(req, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canManageInventorySetup(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const inventory = (await createAdminClient()).schema('private');
    const currentWarehouseId = await getBatchWarehouseId(inventory, batchId);
    if (!currentWarehouseId) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    if (
      !(await assertWorkspaceRelation({
        id: currentWarehouseId,
        inventory,
        table: 'inventory_warehouses',
        wsId: authorization.value.wsId,
      }))
    ) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    const { data, error } = await inventory
      .from('inventory_batches')
      .delete()
      .eq('id', batchId)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting inventory batch', error);
    return NextResponse.json(
      { message: 'Failed to delete inventory batch' },
      { status: 500 }
    );
  }
}
