import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInventoryWorkspace } from '@/lib/inventory/commerce/auth';
import { getInventorySalesByProduct } from '@/lib/inventory/commerce/pnl';
import { canViewInventorySales } from '@/lib/inventory/permissions';

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
  if (!canViewInventorySales(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  try {
    const sbAdmin = await createAdminClient();
    const data = await getInventorySalesByProduct({ sbAdmin, wsId });
    return NextResponse.json({ data });
  } catch (error) {
    serverLogger.error('Error fetching inventory sales by product', error);
    return NextResponse.json(
      { message: 'Failed to fetch inventory sales by product' },
      { status: 500 }
    );
  }
}
