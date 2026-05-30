import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInventoryWorkspace } from '@/lib/inventory/commerce/auth';
import { canViewInventoryCatalog } from '@/lib/inventory/permissions';
import { getInventoryProductFormOptions } from '@/lib/inventory/product-rpc';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId: id } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const { permissions, wsId } = authorization.value;
  if (!canViewInventoryCatalog(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  try {
    const data = await getInventoryProductFormOptions({
      sbAdmin: await createAdminClient(),
      wsId,
    });

    return NextResponse.json(data);
  } catch (error) {
    serverLogger.error('Error fetching inventory product form options', error);
    return NextResponse.json(
      { message: 'Failed to fetch inventory product form options' },
      { status: 500 }
    );
  }
}
