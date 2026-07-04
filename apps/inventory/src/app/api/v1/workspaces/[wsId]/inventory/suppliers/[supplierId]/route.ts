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

const SupplierUpdateSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional(),
});

interface Params {
  params: Promise<{
    wsId: string;
    supplierId: string;
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
  const { wsId: id, supplierId } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const { permissions, wsId } = authorization.value;
  if (!canUpdateInventorySetup(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const body = await parseBody(req);
  if (!body.ok) return body.response;

  const parsed = SupplierUpdateSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient();
  const inventory = sbAdmin.schema('private');
  const { data: existing, error: existingError } = await inventory
    .from('inventory_suppliers')
    .select('*')
    .eq('id', supplierId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (existingError) {
    console.error('Error loading inventory supplier for update', existingError);
    return NextResponse.json(
      { message: 'Failed to fetch inventory supplier' },
      { status: 500 }
    );
  }

  if (!existing) {
    return NextResponse.json(
      { message: 'Supplier not found' },
      { status: 404 }
    );
  }

  const { data, error } = await inventory
    .from('inventory_suppliers')
    .update(parsed.data)
    .eq('id', supplierId)
    .eq('ws_id', wsId)
    .select('*')
    .single();

  if (error) {
    console.error('Error updating inventory supplier', error);
    return NextResponse.json(
      { message: 'Failed to update inventory supplier' },
      { status: error.code === '23505' ? 409 : 500 }
    );
  }

  await createInventoryAuditLog(sbAdmin, {
    wsId,
    eventKind: 'updated',
    entityKind: 'supplier',
    entityId: data.id,
    entityLabel: data.name,
    summary: `Updated supplier ${data.name}`,
    changedFields: diffInventoryAuditFields(existing, data),
    before: existing,
    after: data,
    actor: await getInventoryActorContext(req, wsId),
  });

  return NextResponse.json({ data });
}

export const PUT = PATCH;

export async function DELETE(req: Request, { params }: Params) {
  const { wsId: id, supplierId } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const { permissions, wsId } = authorization.value;
  if (!canDeleteInventorySetup(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const sbAdmin = await createAdminClient();
  const inventory = sbAdmin.schema('private');
  const { data: existing, error: existingError } = await inventory
    .from('inventory_suppliers')
    .select('*')
    .eq('id', supplierId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (existingError) {
    console.error(
      'Error loading inventory supplier for deletion',
      existingError
    );
    return NextResponse.json(
      { message: 'Failed to fetch inventory supplier' },
      { status: 500 }
    );
  }

  if (!existing) {
    return NextResponse.json(
      { message: 'Supplier not found' },
      { status: 404 }
    );
  }

  const { data: linkedBatches, error: linkedBatchesError } = await inventory
    .from('inventory_batches')
    .select('id')
    .eq('supplier_id', supplierId)
    .limit(1);

  if (linkedBatchesError) {
    console.error(
      'Error validating inventory supplier usage',
      linkedBatchesError
    );
    return NextResponse.json(
      { message: 'Failed to validate supplier usage' },
      { status: 500 }
    );
  }

  if ((linkedBatches ?? []).length > 0) {
    return NextResponse.json(
      { message: 'Cannot delete supplier while batches are assigned to it' },
      { status: 409 }
    );
  }

  const { data, error } = await inventory
    .from('inventory_suppliers')
    .delete()
    .eq('id', supplierId)
    .eq('ws_id', wsId)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('Error deleting inventory supplier', error);
    return NextResponse.json(
      { message: 'Failed to delete inventory supplier' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { message: 'Supplier not found' },
      { status: 404 }
    );
  }

  await createInventoryAuditLog(sbAdmin, {
    wsId,
    eventKind: 'deleted',
    entityKind: 'supplier',
    entityId: data.id,
    entityLabel: data.name,
    summary: `Deleted supplier ${data.name}`,
    before: existing,
    actor: await getInventoryActorContext(req, wsId),
  });

  return NextResponse.json({ message: 'success' });
}
