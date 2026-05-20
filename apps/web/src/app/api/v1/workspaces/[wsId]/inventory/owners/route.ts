import { createAdminClient } from '@tuturuuu/supabase/next/server';
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

const OwnerSchema = z.object({
  name: z.string().trim().min(1).max(255),
  linked_workspace_user_id: z.guid().nullable().optional(),
  avatar_url: z.string().trim().url().nullable().optional(),
  archived: z.boolean().optional(),
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

  if (!canViewInventoryCatalog(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await sbAdmin
    .from('inventory_owners')
    .select('*')
    .eq('ws_id', wsId)
    .order('archived')
    .order('name');

  if (error) {
    serverLogger.error('Error fetching inventory owners', error);
    return NextResponse.json(
      { message: 'Failed to fetch inventory owners' },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request, { params }: Params) {
  const { wsId: id } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const sbAdmin = await createAdminClient();
  const { permissions, wsId } = authorization.value;

  if (!canManageInventorySetup(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const parsed = OwnerSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const { data, error } = await sbAdmin
    .from('inventory_owners')
    .insert({
      ...parsed.data,
      ws_id: wsId,
      avatar_url: parsed.data.avatar_url ?? null,
      linked_workspace_user_id: parsed.data.linked_workspace_user_id ?? null,
    })
    .select('*')
    .single();

  if (error) {
    serverLogger.error('Error creating inventory owner', error);
    return NextResponse.json(
      { message: 'Failed to create inventory owner' },
      { status: 500 }
    );
  }

  await createInventoryAuditLog(sbAdmin, {
    wsId,
    eventKind: 'created',
    entityKind: 'owner',
    entityId: data.id,
    entityLabel: data.name,
    summary: `Created owner ${data.name}`,
    changedFields: ['name'],
    after: data,
    actor: await getInventoryActorContext(req, wsId),
  });

  return NextResponse.json({ data });
}
