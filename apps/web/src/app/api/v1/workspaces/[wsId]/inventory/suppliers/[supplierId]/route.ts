import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { getInventoryActorContext } from '@/lib/inventory/actor';
import {
  createInventoryAuditLog,
  diffInventoryAuditFields,
} from '@/lib/inventory/audit';
import { authorizeInventoryWorkspace } from '@/lib/inventory/commerce/auth';
import {
  canDeleteInventorySetup,
  canUpdateInventorySetup,
} from '@/lib/inventory/permissions';

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
    serverLogger.error(
      'Error loading inventory supplier for update',
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

  const { data, error } = await inventory
    .from('inventory_suppliers')
    .update(parsed.data)
    .eq('id', supplierId)
    .eq('ws_id', wsId)
    .select('*')
    .single();

  if (error) {
    serverLogger.error('Error updating inventory supplier', error);
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
    serverLogger.error(
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
    serverLogger.error(
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
    serverLogger.error('Error deleting inventory supplier', error);
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
