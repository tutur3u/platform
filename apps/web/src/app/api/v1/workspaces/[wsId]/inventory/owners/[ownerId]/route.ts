import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { getInventoryActorContext } from '@tuturuuu/inventory-core/actor';
import {
  createInventoryAuditLog,
  diffInventoryAuditFields,
} from '@tuturuuu/inventory-core/audit';
import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { canManageInventorySetup } from '@tuturuuu/inventory-core/permissions';

const OwnerUpdateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  linked_workspace_user_id: z.guid().nullable().optional(),
  avatar_url: z.string().trim().url().nullable().optional(),
  archived: z.boolean().optional(),
});

interface Params {
  params: Promise<{
    wsId: string;
    ownerId: string;
  }>;
}

export async function PATCH(req: Request, { params }: Params) {
  const { wsId: id, ownerId } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const sbAdmin = await createAdminClient();
  const inventory = sbAdmin.schema('private');
  const { permissions, wsId } = authorization.value;

  if (!canManageInventorySetup(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const parsed = OwnerUpdateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const { data: existing, error: existingError } = await inventory
    .from('inventory_owners')
    .select('*')
    .eq('id', ownerId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      { message: 'Failed to fetch inventory owner' },
      { status: 500 }
    );
  }

  if (!existing) {
    return NextResponse.json({ message: 'Owner not found' }, { status: 404 });
  }

  const { data, error } = await inventory
    .from('inventory_owners')
    .update({
      ...parsed.data,
      updated_at: new Date().toISOString(),
      avatar_url:
        parsed.data.avatar_url === undefined
          ? undefined
          : parsed.data.avatar_url,
      linked_workspace_user_id:
        parsed.data.linked_workspace_user_id === undefined
          ? undefined
          : parsed.data.linked_workspace_user_id,
    })
    .eq('id', ownerId)
    .eq('ws_id', wsId)
    .select('*')
    .single();

  if (error) {
    serverLogger.error('Error updating inventory owner', error);
    return NextResponse.json(
      { message: 'Failed to update inventory owner' },
      { status: 500 }
    );
  }

  await createInventoryAuditLog(sbAdmin, {
    wsId,
    eventKind: data.archived ? 'archived' : 'updated',
    entityKind: 'owner',
    entityId: data.id,
    entityLabel: data.name,
    summary: `${data.archived ? 'Archived' : 'Updated'} owner ${data.name}`,
    changedFields: diffInventoryAuditFields(existing, data),
    before: existing,
    after: data,
    actor: await getInventoryActorContext(req, wsId),
  });

  return NextResponse.json({ data });
}

export async function DELETE(req: Request, { params }: Params) {
  const { wsId: id, ownerId } = await params;
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
    .eq('owner_id', ownerId)
    .limit(1);

  if (linkedProductsError) {
    return NextResponse.json(
      { message: 'Failed to validate owner usage' },
      { status: 500 }
    );
  }

  if ((linkedProducts ?? []).length > 0) {
    return NextResponse.json(
      { message: 'Cannot delete owner while products are assigned to it' },
      { status: 409 }
    );
  }

  const { data, error } = await inventory
    .from('inventory_owners')
    .delete()
    .eq('id', ownerId)
    .eq('ws_id', wsId)
    .select('*')
    .maybeSingle();

  if (error) {
    serverLogger.error('Error deleting inventory owner', error);
    return NextResponse.json(
      { message: 'Failed to delete inventory owner' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ message: 'Owner not found' }, { status: 404 });
  }

  await createInventoryAuditLog(sbAdmin, {
    wsId,
    eventKind: 'deleted',
    entityKind: 'owner',
    entityId: data.id,
    entityLabel: data.name,
    summary: `Deleted owner ${data.name}`,
    actor: await getInventoryActorContext(req, wsId),
  });

  return NextResponse.json({ message: 'success' });
}
