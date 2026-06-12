import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { getInventoryActorContext } from '@/lib/inventory/actor';
import {
  getInventoryApiListRange,
  parseInventoryApiListQuery,
  shouldReturnPaginatedInventoryList,
} from '@/lib/inventory/api-list-query';
import { createInventoryAuditLog } from '@/lib/inventory/audit';
import { authorizeInventoryWorkspace } from '@/lib/inventory/commerce/auth';
import {
  canCreateInventorySetup,
  canManageInventorySetup,
  canViewInventoryCatalog,
} from '@/lib/inventory/permissions';

const SupplierSchema = z.object({
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

  const shouldPaginate = shouldReturnPaginatedInventoryList(req);
  const parsedQuery = parseInventoryApiListQuery(req);

  if (!parsedQuery.success) {
    return NextResponse.json(
      { message: 'Invalid query parameters' },
      { status: 400 }
    );
  }

  const { permissions, wsId } = authorization.value;
  if (
    !canViewInventoryCatalog(permissions) &&
    !canManageInventorySetup(permissions)
  ) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const inventory = (await createAdminClient()).schema('private');
  const query = inventory
    .from('inventory_suppliers')
    .select('*', { count: shouldPaginate ? 'exact' : undefined })
    .eq('ws_id', wsId);

  const { q, page, pageSize } = parsedQuery.data;
  if (q) query.ilike('name', `%${q}%`);
  if (shouldPaginate) {
    const { start, end } = getInventoryApiListRange({ page, pageSize });
    query.range(start, end);
  }

  const { data, error, count } = await query.order('name');

  if (error) {
    serverLogger.error('Error fetching inventory suppliers', error);
    return NextResponse.json(
      { message: 'Failed to fetch inventory suppliers' },
      { status: 500 }
    );
  }

  if (shouldPaginate) {
    return NextResponse.json({ count: count ?? 0, data: data ?? [] });
  }

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request, { params }: Params) {
  const { wsId: id } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const { permissions, wsId } = authorization.value;
  if (!canCreateInventorySetup(permissions, { allowUpdateInventory: true })) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = SupplierSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin
    .schema('private')
    .from('inventory_suppliers')
    .insert({
      ...parsed.data,
      ws_id: wsId,
    })
    .select('*')
    .single();

  if (error) {
    serverLogger.error('Error creating inventory supplier', error);
    return NextResponse.json(
      { message: 'Failed to create inventory supplier' },
      { status: error.code === '23505' ? 409 : 500 }
    );
  }

  await createInventoryAuditLog(sbAdmin, {
    wsId,
    eventKind: 'created',
    entityKind: 'supplier',
    entityId: data.id,
    entityLabel: data.name,
    summary: `Created supplier ${data.name}`,
    changedFields: ['name'],
    after: data,
    actor: await getInventoryActorContext(req, wsId),
  });

  return NextResponse.json({ data }, { status: 201 });
}
