import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  parseInventoryApiListQuery,
  shouldReturnPaginatedInventoryList,
} from '@/lib/inventory/api-list-query';
import { authorizeInventoryWorkspace } from '@/lib/inventory/commerce/auth';
import { canViewInventoryCatalog } from '@/lib/inventory/permissions';
import { getInventoryBatches } from '@/lib/inventory/product-rpc';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId: id } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const parsedQuery = parseInventoryApiListQuery(req);
  if (!parsedQuery.success) {
    return NextResponse.json(
      { message: 'Invalid query parameters' },
      { status: 400 }
    );
  }

  const { permissions, wsId } = authorization.value;
  if (!canViewInventoryCatalog(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  try {
    const { page, pageSize, q } = parsedQuery.data;
    const result = await getInventoryBatches({
      limit: shouldReturnPaginatedInventoryList(req) ? pageSize : 10_000,
      offset: shouldReturnPaginatedInventoryList(req)
        ? (page - 1) * pageSize
        : 0,
      sbAdmin: await createAdminClient(),
      search: q,
      wsId,
    });

    return NextResponse.json(result);
  } catch (error) {
    serverLogger.error('Error fetching inventory batches', error);
    return NextResponse.json(
      { message: 'Failed to fetch inventory batches' },
      { status: 500 }
    );
  }
}
