import { getInventoryStorefrontAnalytics } from '@tuturuuu/inventory-core/commerce/analytics';
import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { canViewInventoryDashboard } from '@tuturuuu/inventory-core/permissions';
import { NextResponse } from 'next/server';

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
    console.error('Failed to load inventory storefront analytics', error);
    return NextResponse.json(
      { message: 'Failed to load storefront analytics' },
      { status: 500 }
    );
  }
}
