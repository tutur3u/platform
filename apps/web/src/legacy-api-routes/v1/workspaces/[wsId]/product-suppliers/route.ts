import {
  getInventoryApiListRange,
  parseInventoryApiListQuery,
  shouldReturnPaginatedInventoryList,
} from '@tuturuuu/inventory-core/api-list-query';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
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

  // Check permissions
  const permissions = await getPermissions({ wsId: id, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { containsPermission } = permissions;
  if (!containsPermission('view_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view inventory' },
      { status: 403 }
    );
  }

  const inventory = (await createAdminClient()).schema('private');

  const query = inventory
    .from('inventory_suppliers')
    .select('*', { count: shouldPaginate ? 'exact' : undefined })
    .eq('ws_id', id);

  const { q, page, pageSize } = parsedQuery.data;
  if (q) query.ilike('name', `%${q}%`);
  if (shouldPaginate) {
    const { start, end } = getInventoryApiListRange({ page, pageSize });
    query.range(start, end);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching product suppliers', error);
    return NextResponse.json(
      { message: 'Error fetching workspace user groups' },
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

  // Check permissions
  const permissions = await getPermissions({ wsId: id });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { containsPermission } = permissions;
  if (!containsPermission('create_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to create suppliers' },
      { status: 403 }
    );
  }

  const inventory = (await createAdminClient()).schema('private');
  const data = await req.json();

  const { error } = await inventory.from('inventory_suppliers').insert({
    ...data,
    ws_id: id,
  });

  if (error) {
    console.error('Error creating product supplier', error);
    return NextResponse.json(
      { message: 'Error creating workspace user group' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
