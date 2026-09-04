import {
  getInventoryApiListRange,
  parseInventoryApiListQuery,
  shouldReturnPaginatedInventoryList,
} from '@tuturuuu/inventory-core/api-list-query';
import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId: id } = await params;
  const shouldPaginate = shouldReturnPaginatedInventoryList(req);

  const parsedQuery = parseInventoryApiListQuery(req);
  if (!parsedQuery.success) {
    return NextResponse.json(
      { message: 'Invalid query parameters' },
      { status: 400 }
    );
  }

  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;
  const { permissions, wsId } = authorization.value;
  const { containsPermission } = permissions;
  if (!containsPermission('view_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view inventory' },
      { status: 403 }
    );
  }

  const query = (await createAdminClient())
    .from('product_categories')
    .select('*', { count: shouldPaginate ? 'exact' : undefined })
    .eq('ws_id', wsId);

  const { q, page, pageSize } = parsedQuery.data;
  if (q) query.ilike('name', `%${q}%`);
  if (shouldPaginate) {
    const { start, end } = getInventoryApiListRange({ page, pageSize });
    query.range(start, end);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching product categories', error);
    return NextResponse.json(
      { message: 'Error fetching product categories' },
      { status: 500 }
    );
  }

  if (shouldPaginate) {
    return NextResponse.json({ count: count ?? 0, data: data ?? [] });
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const { wsId: id } = await params;
  const data = await req.json();

  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;
  const { permissions, wsId } = authorization.value;
  const { containsPermission } = permissions;
  if (!containsPermission('create_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to create inventory' },
      { status: 403 }
    );
  }

  const { error } = await (await createAdminClient())
    .from('product_categories')
    .insert({
      ...data,
      ws_id: wsId,
    });

  if (error) {
    console.error('Error creating inventory category', error);
    return NextResponse.json(
      { message: 'Error creating inventory category' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
