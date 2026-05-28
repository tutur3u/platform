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
import { canManageInventorySetup } from '@/lib/inventory/permissions';

const ManufacturerUpdateSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional(),
});

interface Params {
  params: Promise<{
    wsId: string;
    manufacturerId: string;
  }>;
}

export async function PATCH(req: Request, { params }: Params) {
  const { wsId: id, manufacturerId } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const sbAdmin = await createAdminClient();
  const inventory = sbAdmin.schema('private');
  const { permissions, wsId } = authorization.value;

  if (!canManageInventorySetup(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const parsed = ManufacturerUpdateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const { data: existing, error: existingError } = await inventory
    .from('inventory_manufacturers')
    .select('*')
    .eq('id', manufacturerId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (existingError) {
    serverLogger.error(
      'Error loading inventory manufacturer for update',
      existingError
    );
    return NextResponse.json(
      { message: 'Failed to fetch inventory manufacturer' },
      { status: 500 }
    );
  }

  if (!existing) {
    return NextResponse.json(
      { message: 'Manufacturer not found' },
      { status: 404 }
    );
  }

  const { data, error } = await inventory
    .from('inventory_manufacturers')
    .update({
      ...parsed.data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', manufacturerId)
    .eq('ws_id', wsId)
    .select('*')
    .single();

  if (error) {
    serverLogger.error('Error updating inventory manufacturer', error);
    return NextResponse.json(
      { message: 'Failed to update inventory manufacturer' },
      { status: error.code === '23505' ? 409 : 500 }
    );
  }

  await createInventoryAuditLog(sbAdmin, {
    wsId,
    eventKind: 'updated',
    entityKind: 'manufacturer',
    entityId: data.id,
    entityLabel: data.name,
    summary: `Updated manufacturer ${data.name}`,
    changedFields: diffInventoryAuditFields(existing, data),
    before: existing,
    after: data,
    actor: await getInventoryActorContext(req, wsId),
  });

  return NextResponse.json({ data });
}

export async function DELETE(req: Request, { params }: Params) {
  const { wsId: id, manufacturerId } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const sbAdmin = await createAdminClient();
  const inventory = sbAdmin.schema('private');
  const { permissions, wsId } = authorization.value;

  if (!canManageInventorySetup(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { data: linkedProducts, error: linkedProductsError } = await sbAdmin
    .from('workspace_products')
    .select('id')
    .eq('ws_id', wsId)
    .eq('manufacturer_id', manufacturerId)
    .limit(1);

  if (linkedProductsError) {
    serverLogger.error(
      'Error validating inventory manufacturer usage',
      linkedProductsError
    );
    return NextResponse.json(
      { message: 'Failed to validate manufacturer usage' },
      { status: 500 }
    );
  }

  if ((linkedProducts ?? []).length > 0) {
    return NextResponse.json(
      {
        message: 'Cannot delete manufacturer while products are assigned to it',
      },
      { status: 409 }
    );
  }

  const { data, error } = await inventory
    .from('inventory_manufacturers')
    .delete()
    .eq('id', manufacturerId)
    .eq('ws_id', wsId)
    .select('*')
    .maybeSingle();

  if (error) {
    serverLogger.error('Error deleting inventory manufacturer', error);
    return NextResponse.json(
      { message: 'Failed to delete inventory manufacturer' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { message: 'Manufacturer not found' },
      { status: 404 }
    );
  }

  await createInventoryAuditLog(sbAdmin, {
    wsId,
    eventKind: 'deleted',
    entityKind: 'manufacturer',
    entityId: data.id,
    entityLabel: data.name,
    summary: `Deleted manufacturer ${data.name}`,
    actor: await getInventoryActorContext(req, wsId),
  });

  return NextResponse.json({ message: 'success' });
}
