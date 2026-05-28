import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { getInventoryActorContext } from '@/lib/inventory/actor';
import { createInventoryAuditLog } from '@/lib/inventory/audit';
import { authorizeInventoryWorkspace } from '@/lib/inventory/commerce/auth';
import {
  canManageInventorySetup,
  canViewInventoryCatalog,
} from '@/lib/inventory/permissions';

const UnitSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId: id } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const sbAdmin = await createAdminClient();
  const { permissions, wsId } = authorization.value;

  if (
    !canViewInventoryCatalog(permissions) &&
    !canManageInventorySetup(permissions)
  ) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view inventory' },
      { status: 403 }
    );
  }

  const { data, error } = await sbAdmin
    .from('inventory_units')
    .select('*')
    .eq('ws_id', wsId)
    .order('name');

  if (error) {
    serverLogger.error('Error fetching product units', error);
    return NextResponse.json(
      { message: 'Error fetching product units' },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: Request, { params }: Params) {
  const { wsId: id } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const sbAdmin = await createAdminClient();
  const { permissions, wsId } = authorization.value;

  if (!canManageInventorySetup(permissions)) {
    return NextResponse.json(
      { message: 'Insufficient permissions to create units' },
      { status: 403 }
    );
  }

  const parsed = UnitSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const { data, error } = await sbAdmin
    .from('inventory_units')
    .insert({
      ...parsed.data,
      ws_id: wsId,
    })
    .select('*')
    .single();

  if (error) {
    serverLogger.error('Error creating product unit', error);
    return NextResponse.json(
      { message: 'Error creating product unit' },
      { status: 500 }
    );
  }

  await createInventoryAuditLog(sbAdmin, {
    wsId,
    eventKind: 'created',
    entityKind: 'unit',
    entityId: data.id,
    entityLabel: data.name,
    summary: `Created unit ${data.name}`,
    changedFields: ['name'],
    after: data,
    actor: await getInventoryActorContext(req, wsId),
  });

  return NextResponse.json({ message: 'success', data });
}
