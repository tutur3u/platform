import { getInventoryActorContext } from '@tuturuuu/inventory-core/actor';
import {
  getInventoryApiListRange,
  parseInventoryApiListQuery,
  shouldReturnPaginatedInventoryList,
} from '@tuturuuu/inventory-core/api-list-query';
import { createInventoryAuditLog } from '@tuturuuu/inventory-core/audit';
import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import {
  canCreateInventorySetup,
  canManageInventorySetup,
  canViewInventoryCatalog,
} from '@tuturuuu/inventory-core/permissions';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';

const CategorySchema = z.object({
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

  const sbAdmin = await createAdminClient();
  const query = sbAdmin
    .from('product_categories')
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
    serverLogger.error('Error fetching inventory categories', error);
    return NextResponse.json(
      { message: 'Failed to fetch inventory categories' },
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

  const parsed = CategorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin
    .from('product_categories')
    .insert({
      ...parsed.data,
      ws_id: wsId,
    })
    .select('*')
    .single();

  if (error) {
    serverLogger.error('Error creating inventory category', error);
    return NextResponse.json(
      { message: 'Failed to create inventory category' },
      { status: error.code === '23505' ? 409 : 500 }
    );
  }

  await createInventoryAuditLog(sbAdmin, {
    wsId,
    eventKind: 'created',
    entityKind: 'category',
    entityId: data.id,
    entityLabel: data.name,
    summary: `Created category ${data.name}`,
    changedFields: ['name'],
    after: data,
    actor: await getInventoryActorContext(req, wsId),
  });

  return NextResponse.json({ data }, { status: 201 });
}
