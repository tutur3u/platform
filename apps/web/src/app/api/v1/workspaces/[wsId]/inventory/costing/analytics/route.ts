import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { getCostingAnalytics } from '@tuturuuu/inventory-core/costing';
import { canViewInventoryAnalytics } from '@tuturuuu/inventory-core/permissions';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canViewInventoryAnalytics(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const data = await getCostingAnalytics(authorization.value.wsId);
    return NextResponse.json(data);
  } catch (error) {
    serverLogger.error('Failed to load inventory costing analytics', error);
    return NextResponse.json(
      { message: 'Failed to load inventory costing analytics' },
      { status: 500 }
    );
  }
}
