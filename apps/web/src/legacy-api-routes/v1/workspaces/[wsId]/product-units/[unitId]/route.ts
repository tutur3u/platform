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
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const UnitUpdateSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional(),
});

interface Params {
  params: Promise<{
    wsId: string;
    unitId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const { wsId: id, unitId } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const sbAdmin = await createAdminClient();
  const inventory = sbAdmin.schema('private');
  const { permissions, wsId } = authorization.value;

  if (!canUpdateInventorySetup(permissions)) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update units' },
      { status: 403 }
    );
  }

  const parsed = UnitUpdateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const { data: existing, error: existingError } = await inventory
    .from('inventory_units')
    .select('*')
    .eq('id', unitId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (existingError) {
    console.error('Error loading product unit for update', existingError);
    return NextResponse.json(
      { message: 'Error loading product unit for update' },
      { status: 500 }
    );
  }

  if (!existing) {
    return NextResponse.json({ message: 'Unit not found' }, { status: 404 });
  }

  const { data, error } = await inventory
    .from('inventory_units')
    .update(parsed.data)
    .eq('id', unitId)
    .eq('ws_id', wsId)
    .select('*')
    .single();

  if (error) {
    console.error('Error updating product unit', error);
    return NextResponse.json(
      { message: 'Error updating product unit' },
      { status: 500 }
    );
  }

  await createInventoryAuditLog(sbAdmin, {
    wsId,
    eventKind: 'updated',
    entityKind: 'unit',
    entityId: data.id,
    entityLabel: data.name,
    summary: `Updated unit ${data.name}`,
    changedFields: diffInventoryAuditFields(existing, data),
    before: existing,
    after: data,
    actor: await getInventoryActorContext(req, wsId),
  });

  return NextResponse.json({ message: 'success', data });
}

export async function DELETE(req: Request, { params }: Params) {
  const { wsId: id, unitId } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const sbAdmin = await createAdminClient();
  const inventory = sbAdmin.schema('private');
  const { permissions, wsId } = authorization.value;

  if (!canDeleteInventorySetup(permissions)) {
    return NextResponse.json(
      { message: 'Insufficient permissions to delete units' },
      { status: 403 }
    );
  }

  const { data: existing, error: existingError } = await inventory
    .from('inventory_units')
    .select('*')
    .eq('id', unitId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (existingError) {
    console.error('Error loading product unit for deletion', existingError);
    return NextResponse.json(
      { message: 'Error loading product unit for deletion' },
      { status: 500 }
    );
  }

  if (!existing) {
    return NextResponse.json({ message: 'Unit not found' }, { status: 404 });
  }

  const { data: linkedProducts, error: linkedProductsError } = await inventory
    .from('inventory_products')
    .select('product_id')
    .eq('unit_id', unitId)
    .limit(1);

  if (linkedProductsError) {
    console.error('Error validating product unit usage', linkedProductsError);
    return NextResponse.json(
      { message: 'Failed to validate unit usage' },
      { status: 500 }
    );
  }

  if ((linkedProducts ?? []).length > 0) {
    return NextResponse.json(
      { message: 'Cannot delete unit while products are assigned to it' },
      { status: 409 }
    );
  }

  const { error } = await inventory
    .from('inventory_units')
    .delete()
    .eq('id', unitId)
    .eq('ws_id', wsId);

  if (error) {
    console.error('Error deleting product unit', error);
    return NextResponse.json(
      { message: 'Error deleting product unit' },
      { status: 500 }
    );
  }

  await createInventoryAuditLog(sbAdmin, {
    wsId,
    eventKind: 'deleted',
    entityKind: 'unit',
    entityId: existing.id,
    entityLabel: existing.name,
    summary: `Deleted unit ${existing.name}`,
    actor: await getInventoryActorContext(req, wsId),
  });

  return NextResponse.json({ message: 'success' });
}
