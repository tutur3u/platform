import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { getInventoryStorefrontAnalytics } from '@/lib/inventory/commerce/analytics';
import { authorizeInventoryWorkspace } from '@/lib/inventory/commerce/auth';
import { canViewInventoryDashboard } from '@/lib/inventory/permissions';

interface Params {
  params: Promise<{ wsId: string }>;
}

/**
 * Storefront analytics funnel (views -> add to cart -> checkout -> completed)
 * aggregated from inventory_storefront_events for the dashboard analytics panel.
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canViewInventoryDashboard(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const days = Number(new URL(request.url).searchParams.get('days') ?? '30');
    const analytics = await getInventoryStorefrontAnalytics(
      authorization.value.wsId,
      Number.isFinite(days) ? days : 30
    );
    return NextResponse.json(analytics);
  } catch (error) {
    serverLogger.error('Failed to load inventory storefront analytics', error);
    return NextResponse.json(
      { message: 'Failed to load storefront analytics' },
      { status: 500 }
    );
  }
}
